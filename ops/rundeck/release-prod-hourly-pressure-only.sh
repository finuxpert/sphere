#!/usr/bin/env bash
# Narrow PROD report hotfix: copy only the reviewed CPU/RAM time-bucket backend
# module into an isolated copy of the active PROD API. No web, migrations, Nginx,
# snapshot worker, collector, or cross-environment source promotion.
set -Eeuo pipefail
umask 077

SOURCE=/root/rundeck-sphere-prod
API=/opt/sphere-rundeck-prod
RELEASES="$API/releases"
CURRENT="$API/current"
SERVICE=sphere-rundeck-prod-api.service
PY="$API/venv/bin/python"
HOSTS_URL='http://127.0.0.1:8092/evaluation/workloads/monthly/hosts?month=2026-11&start_date=2026-11-14&end_date=2026-11-15'
BASE='http://127.0.0.1:8092'

[[ "$EUID" == 0 ]] || { echo 'BLOCKED: root required'; exit 2; }
exec 9>/run/lock/sphere-prod-api-compat.lock
flock -n 9 || { echo 'BLOCKED: another PROD API release is active'; exit 2; }

cd "$SOURCE"
[[ "$(git branch --show-current)" == rundeck-sphere-prod ]] || {
  echo 'BLOCKED: expected PROD branch'; exit 2;
}
[[ -z "$(git status --porcelain)" ]] || {
  echo 'BLOCKED: dirty PROD checkout'; exit 2;
}
git fetch --no-tags origin rundeck-sphere-prod >/dev/null
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/rundeck-sphere-prod)" ]] || {
  echo 'BLOCKED: PROD source differs from origin; use git merge --ff-only'; exit 2;
}

SHA="$(git rev-parse HEAD)"
SHORT="${SHA:0:12}"
PREVIOUS="$(readlink -f "$CURRENT" 2>/dev/null || true)"
[[ -d "$PREVIOUS" && "$PREVIOUS" == "$RELEASES/"* ]] || {
  echo 'BLOCKED: active PROD API release is invalid'; exit 2;
}
[[ -x "$PY" ]] && systemctl is-active --quiet "$SERVICE" || {
  echo 'BLOCKED: PROD API is not running'; exit 2;
}
PROD_WEB="$(readlink -f /var/www/sphere.astraotoparts.co.id/current)"
DEV_API="$(readlink -f /opt/sphere-rundeck-dev/current)"
DEV_WEB="$(readlink -f /var/www/sphere-dev/current)"
test -d "$PROD_WEB" && test -d "$DEV_API" && test -d "$DEV_WEB"

MODULE=backend/rundeck_monthly_pressure.py
test -s "$SOURCE/$MODULE" && test -s "$PREVIOUS/$MODULE"
grep -Fq 'def monthly_pressure_observations(' "$PREVIOUS/$MODULE"
grep -Fq 'def bucketed_host_trend(' "$SOURCE/$MODULE"
grep -Fq '"trend_bucket_minutes": trend_bucket_minutes' "$SOURCE/$MODULE"
grep -Fq '"trend_hosts": trend_hosts' "$SOURCE/$MODULE"

RELEASE="$RELEASES/hourly-$SHORT"
[[ ! -e "$RELEASE" && ! -L "$RELEASE" ]] || {
  echo "BLOCKED: destination already exists $RELEASE"; exit 2;
}

TMP="$(mktemp -d /tmp/sphere-prod-hourly.XXXXXXXX)"
CREATED=0
CUTOVER=0
finish() {
  rc=$?
  trap - EXIT
  set +e
  if (( rc != 0 && CUTOVER == 1 )); then
    echo 'ROLLBACK=START'
    ln -s "$PREVIOUS" "$API/.hourly-rollback-$$" &&
      mv -Tf "$API/.hourly-rollback-$$" "$CURRENT"
    systemctl restart "$SERVICE"
    rollback_ready=0
    for _ in $(seq 1 30); do
      if systemctl is-active --quiet "$SERVICE" &&
         curl --noproxy '*' -fsS --max-time 2 -o /dev/null "$BASE/openapi.json" 2>/dev/null; then
        rollback_ready=1
        break
      fi
      sleep 1
    done
    if [[ "$(readlink -f "$CURRENT")" == "$PREVIOUS" && "$rollback_ready" == 1 ]]; then
      echo 'ROLLBACK=RESTORED_PREVIOUS_PROD_API HTTP_READY=PASS'
    else
      echo 'ROLLBACK=FAILED_MANUAL_INTERVENTION_REQUIRED' >&2
    fi
  fi
  if (( rc != 0 && CREATED == 1 )) &&
     [[ "$(readlink -f "$CURRENT" 2>/dev/null)" != "$RELEASE" ]]; then
    rm -rf -- "$RELEASE"
  fi
  rm -f "$API/.hourly-next-$$" "$API/.hourly-rollback-$$"
  rm -rf -- "$TMP"
  exit "$rc"
}
trap finish EXIT

echo "=== PROD HOURLY HOTFIX PREFLIGHT ==="
echo "SOURCE_SHA=$SHA ACTIVE_BEFORE=$PREVIOUS SCOPE=ONE_BACKEND_MODULE"
echo '=== BASELINE AVAILABILITY (READ ONLY) ==='
BASELINE_CODE="$(curl --noproxy '*' -sS --max-time 15 -o "$TMP/availability-before.json" -w '%{http_code}' "$BASE/availability/latest")"
[[ "$BASELINE_CODE" == 200 || "$BASELINE_CODE" == 503 ]] || {
  echo "BLOCKED: unexpected pre-existing availability HTTP=$BASELINE_CODE"; exit 2;
}
echo "AVAILABILITY_BASELINE_HTTP=$BASELINE_CODE"

echo '=== OFFLINE UNIT TESTS ==='
"$PY" -m unittest -q \
  backend.tests.test_rundeck_prod_hourly_pressure \
  backend.tests.test_rundeck_prod_compat_api \
  backend.tests.test_rundeck_network_prod_contract
echo 'OFFLINE_QA=PASS'

echo '=== STAGE ISOLATED API RELEASE ==='
cp -a -- "$PREVIOUS" "$RELEASE"
CREATED=1
install -m 0644 "$SOURCE/$MODULE" "$RELEASE/$MODULE"
"$PY" -m py_compile "$RELEASE/$MODULE"
printf 'source_sha=%s\noriginal_api=%s\nmode=hourly-pressure-single-module\n' \
  "$SHA" "$PREVIOUS" > "$RELEASE/.sphere-hourly-release-manifest"

echo '=== ACTIVATE PROD API ONLY ==='
ln -s "$RELEASE" "$API/.hourly-next-$$"
mv -Tf "$API/.hourly-next-$$" "$CURRENT"
CUTOVER=1
systemctl restart "$SERVICE"

ready=0
for attempt in $(seq 1 45); do
  if systemctl is-active --quiet "$SERVICE" &&
     curl --noproxy '*' -fsS --max-time 2 -o /dev/null "$BASE/openapi.json" 2>/dev/null; then
    ready=1
    echo "API_HTTP_READY=PASS ATTEMPT=$attempt"
    break
  fi
  sleep 1
done
[[ "$ready" == 1 ]] || { echo 'API_HTTP_READY=FAIL'; exit 1; }

echo '=== LIVE PROD SMOKE ==='
for endpoint in collections/latest infra/hosts evaluation/top-consumers?range=1h; do
  curl --noproxy '*' -fsS --max-time 25 -o /dev/null "$BASE/$endpoint"
  echo "API_ROUTE=PASS $endpoint"
done

curl --noproxy '*' -fsS --max-time 45 -o "$TMP/hosts.json" "$HOSTS_URL"
"$PY" - "$TMP/hosts.json" <<'PY'
import json, sys
payload = json.load(open(sys.argv[1]))
assert payload.get("period") == "custom", "Unexpected report period"
assert payload.get("preview_only") is True, "Not host-only evidence"
pressure = payload.get("monthly_pressure") or {}
assert pressure.get("trend_bucket_minutes") == 60, "Two-day window must have hourly buckets"
points = pressure.get("trend_hosts")
assert isinstance(points, list) and points, "Expected real retained APP host buckets"
assert all(row.get("bucket_start") and row.get("host") for row in points), "Missing source identity"
print(f"HOURLY_CUSTOM=PASS BUCKET_MINUTES=60 OBSERVED_HOST_BUCKETS={len(points)}")
PY

echo '=== AVAILABILITY NON-REGRESSION ==='
AFTER_CODE="$(curl --noproxy '*' -sS --max-time 15 -o "$TMP/availability-after.json" -w '%{http_code}' "$BASE/availability/latest")"
if [[ "$AFTER_CODE" == 200 ]]; then
  echo 'AVAILABILITY=PASS HTTP=200'
elif [[ "$BASELINE_CODE" == 503 && "$AFTER_CODE" == 503 ]] &&
     cmp -s "$TMP/availability-before.json" "$TMP/availability-after.json"; then
  echo 'AVAILABILITY=PREEXISTING_DEGRADED_HTTP_503 UNCHANGED=PASS'
else
  echo "BLOCKED: Availability regressed baseline=$BASELINE_CODE candidate=$AFTER_CODE" >&2
  exit 1
fi

[[ "$(readlink -f "$CURRENT")" == "$RELEASE" ]] || exit 1
[[ "$(readlink -f /var/www/sphere.astraotoparts.co.id/current)" == "$PROD_WEB" ]] || exit 1
[[ "$(readlink -f /opt/sphere-rundeck-dev/current)" == "$DEV_API" ]] || exit 1
[[ "$(readlink -f /var/www/sphere-dev/current)" == "$DEV_WEB" ]] || exit 1
systemctl is-active --quiet "$SERVICE"
echo 'FULL_MONTH_EVALUATION=NOT_VERIFIED NO_PROD_SNAPSHOT_AVAILABLE'
echo "FINAL=PASS_WITH_EXISTING_DEGRADATION PROD_API_HOURLY_SHA=$SHA WEB=UNCHANGED DEV=UNCHANGED DB_MIGRATION=SKIPPED ROLLBACK_PREVIOUS=$PREVIOUS"

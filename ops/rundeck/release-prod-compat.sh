#!/usr/bin/env bash
# Guarded PROD API release. Read-only API addition; no DB migration or collector change.
set -Eeuo pipefail
umask 022
SOURCE=/root/rundeck-sphere-prod
API=/opt/sphere-rundeck-prod
RELEASES="$API/releases"
CURRENT="$API/current"
SERVICE=sphere-rundeck-prod-api
PY="$API/venv/bin/python"
[[ "$EUID" == 0 ]] || { echo 'BLOCKED: root required'; exit 2; }
exec 9>/run/lock/sphere-prod-api-compat.lock
flock -n 9 || { echo 'BLOCKED: concurrent API release'; exit 2; }
cd "$SOURCE"
[[ "$(git branch --show-current)" == rundeck-sphere-prod ]] || { echo 'BLOCKED: wrong branch'; exit 2; }
[[ -z "$(git status --porcelain)" ]] || { echo 'BLOCKED: dirty PROD checkout'; exit 2; }
git fetch --no-tags origin rundeck-sphere-prod >/dev/null
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/rundeck-sphere-prod)" ]] || {
  echo 'BLOCKED: PROD checkout out of sync; run git merge --ff-only origin/rundeck-sphere-prod'; exit 2;
}
SHA="$(git rev-parse HEAD)"
SHORT="$(printf %.12s "$SHA")"
PREVIOUS="$(readlink -f "$CURRENT")"
[[ -d "$PREVIOUS" && "$PREVIOUS" == "$RELEASES/"* ]] || { echo 'BLOCKED: previous release invalid'; exit 2; }
RELEASE="$RELEASES/compat-$SHORT"
[[ ! -e "$RELEASE" && ! -L "$RELEASE" ]] || { echo "BLOCKED: $RELEASE exists"; exit 2; }
[[ -x "$PY" && -f /etc/sphere/rundeck-prod.env ]] || { echo 'BLOCKED: PROD runtime missing'; exit 2; }
echo "SOURCE_SHA=$SHA PREVIOUS=$PREVIOUS SCOPE=PROD_API_ONLY"

echo '=== STATIC / REGRESSION QA ==='
"$PY" -m compileall -q backend
"$PY" -m unittest -q \
  backend.tests.test_rundeck_prod_compat_api \
  backend.tests.test_rundeck_workload_activity \
  backend.tests.test_rundeck_top_consumers \
  backend.tests.test_rundeck_network_prod_contract \
  backend.tests.test_rundeck_evaluation_paging_prod

CUTOVER=0
STAGE=''
rollback() {
  rc=$?
  trap - EXIT
  set +e
  if [[ "$rc" != 0 && "$CUTOVER" == 1 ]]; then
    echo 'ROLLBACK=START'
    ln -s "$PREVIOUS" "$API/.rollback-$$" && mv -Tf "$API/.rollback-$$" "$CURRENT"
    systemctl restart "$SERVICE"
    if [[ "$(readlink -f "$CURRENT")" == "$PREVIOUS" ]] && systemctl is-active --quiet "$SERVICE"; then
      echo 'ROLLBACK=RESTORED_PREVIOUS_PROD_API'
    else
      echo 'ROLLBACK=FAILED_MANUAL_INTERVENTION_REQUIRED' >&2
    fi
  fi
  [[ -z "$STAGE" || ! -d "$STAGE" ]] || rm -rf -- "$STAGE"
  rm -f "$API/.next-$$" "$API/.rollback-$$"
  exit "$rc"
}
trap rollback EXIT

STAGE="$(mktemp -d "$RELEASES/.compat-$SHORT.XXXXXXXX")"
chmod 755 "$STAGE"
git archive --format=tar "$SHA" | tar -xf - -C "$STAGE"
test -s "$STAGE/backend/rundeck_prod_compat_api.py"
test -s "$STAGE/backend/rundeck_prod_monthly_storage.py"
mv -T "$STAGE" "$RELEASE"
STAGE=''
ln -s "$RELEASE" "$API/.next-$$"
mv -Tf "$API/.next-$$" "$CURRENT"
CUTOVER=1
systemctl restart "$SERVICE"
systemctl is-active --quiet "$SERVICE"

"$PY" - <<'PY'
from datetime import datetime,timedelta,timezone
from urllib.parse import urlencode
from urllib.request import urlopen
import json,time
base="http://127.0.0.1:8092"
now=datetime.now(timezone.utc)
wib=now+timedelta(hours=7)
month=(wib.replace(day=1)-timedelta(days=1)).strftime("%Y-%m")
a=(now-timedelta(minutes=30)).isoformat()
b=(now-timedelta(minutes=20)).isoformat()
cases=[
 ("COLLECTIONS","collections/latest",[]),
 ("AVAILABILITY","availability/latest",[]),
 ("INFRA_HOSTS","infra/hosts",["items"]),
 ("WORKLOAD_ACTIVITY","history/workload/activity?range=6h",["complete_checks","activity_checks","wp_checks","items"]),
 ("TOP_CONSUMERS","evaluation/top-consumers?range=1h",["complete_checks","cpu","memory"]),
 ("HISTORY_WINDOW","history/window?"+urlencode({"from_at":a,"to_at":b}),["host_samples","workloads","alerts"]),
 ("HISTORY_TRENDS","history/trends?range=6h&metrics=cpu,ram,wp",["series","metrics"]),
 ("MONTHLY_HOSTS","evaluation/workloads/monthly/hosts?month="+month,["month","monthly_pressure"]),
 ("MONTHLY_EVALUATION","evaluation/workloads/monthly?month="+month+"&limit=1",["summary","items"]),
 ("MONTHLY_STORAGE","infra/monthly-storage?month="+month,["configured_categories","items"]),
]
fail=[]
print("=== PROD API LIVE SMOKE ===")
for name,path,keys in cases:
    try:
        started=time.monotonic()
        with urlopen(f"{base}/{path}",timeout=120) as response:
            code=response.status
            obj=json.load(response)
        missing=[k for k in keys if k not in obj]
        ok=code==200 and isinstance(obj,dict) and not missing
        if name=="WORKLOAD_ACTIVITY": ok=ok and obj.get("complete_checks",0)>0 and obj.get("activity_checks",0)>0
        if name=="TOP_CONSUMERS": ok=ok and obj.get("complete_checks",0)>0
        print(f"{name:21} {'PASS' if ok else 'FAIL'} HTTP={code} seconds={time.monotonic()-started:.2f}" + (f" missing={missing}" if missing else ""))
    except Exception as exc:
        ok=False
        print(f"{name:21} FAIL {type(exc).__name__}: {str(exc)[:130]}")
    if not ok: fail.append(name)
if fail: raise SystemExit("PROD_API_SMOKE=FAIL "+",".join(fail))
print("PROD_API_COMPATIBILITY=PASS")
PY
[[ "$(readlink -f "$CURRENT")" == "$RELEASE" ]] || { echo 'BLOCKED: release symlink changed'; exit 2; }
systemctl is-active --quiet "$SERVICE"
trap - EXIT
echo "FINAL=PASS PROD_API_SHA=$SHA BACKEND_COMPAT=PASS ROLLBACK_PREVIOUS=$PREVIOUS"
echo "NEXT=REVIEW_AND_PROMOTE_FRONTEND_DEV"

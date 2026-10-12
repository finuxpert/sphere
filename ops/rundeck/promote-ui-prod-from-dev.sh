#!/usr/bin/env bash
# Promote exactly the operator-approved SPHERE DEV v1.35.0 frontend to PROD.
# Frontend-only: NEVER deploy backend/API, run migrations, modify Nginx,
# restart services, run Rundeck jobs, or update any production Git branch.
set -Eeuo pipefail
SOURCE=/root/rundeck-sphere-dev
DEV_ROOT=/var/www/sphere-dev
PROD_ROOT=/var/www/sphere.astraotoparts.co.id
PROD_RELEASES="$PROD_ROOT/releases"
PROD_CURRENT="$PROD_ROOT/current"
NGINX_SITE=/etc/nginx/sites-available/sphere.astraotoparts.co.id
# Explicitly reviewed DEV screenshot, build 2bf89c7 (2026-10-12).
# This one-off approval must not automatically follow future DEV branch changes.
REVIEWED_SHA=2bf89c756fb66b985875492c31d7c78057e37302
REVIEWED_VERSION=1.35.0
APPROVED="${1:?Pass exact reviewed DEV commit SHA}"
SHORT="$(printf %.7s "$APPROVED")"
[[ "$#" -eq 1 && "$APPROVED" =~ ^[a-f0-9]{40}$ ]] || { echo "BLOCKED: require exact 40-character DEV SHA" >&2; exit 2; }
[[ "$APPROVED" == "$REVIEWED_SHA" ]] || { echo "BLOCKED: only screenshot-approved DEV SHA $REVIEWED_SHA may be promoted" >&2; exit 2; }
[[ "$EUID" == 0 ]] || { echo "BLOCKED: run as root on JAHSVR-SPHERE" >&2; exit 2; }
exec 9>/run/lock/sphere-ui-prod-promotion.lock
flock -n 9 || { echo "BLOCKED: another PROD UI promotion is active" >&2; exit 2; }

BUILD_DIR=""
STAGE_TMP=""
RELEASE="$PROD_RELEASES/ui-$APPROVED"
PREVIOUS=""
CUTOVER=0
CREATED_RELEASE=0
cleanup() {
  local rc=$?
  trap - EXIT
  set +e
  if (( rc != 0 && CUTOVER == 1 )) && [[ -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
    ln -s "$PREVIOUS" "$PROD_ROOT/.rollback-ui-$$" &&
      mv -Tf "$PROD_ROOT/.rollback-ui-$$" "$PROD_CURRENT"
    if [[ "$(readlink -f "$PROD_CURRENT" 2>/dev/null || true)" == "$PREVIOUS" ]]; then
      echo "ROLLBACK=RESTORED_PREVIOUS_PROD_WEB"
    else
      echo "ROLLBACK=FAILED_MANUAL_INTERVENTION_REQUIRED" >&2
    fi
  fi
  # Never remove active assets if symlink rollback failed.
  if (( rc != 0 && CREATED_RELEASE == 1 )) &&
     [[ "$(readlink -f "$PROD_CURRENT" 2>/dev/null || true)" != "$RELEASE" ]]; then
    rm -rf -- "$RELEASE"
  fi
  [[ -z "$STAGE_TMP" || ! -e "$STAGE_TMP" ]] || rm -rf -- "$STAGE_TMP"
  [[ -z "$BUILD_DIR" || ! -e "$BUILD_DIR" ]] || rm -rf -- "$BUILD_DIR"
  rm -f "/tmp/sphere-prod-ui-verify-$$.html" "/tmp/sphere-prod-ui-verify-$$.js" "/tmp/sphere-prod-ui-dev-verify-$$.html" "/tmp/sphere-prod-ui-dev-before-$$.html"
  rm -f "$PROD_ROOT/.next-ui-$$" "$PROD_ROOT/.rollback-ui-$$"
  exit "$rc"
}
trap cleanup EXIT

# The release helper can be newer than the reviewed DEV code; the exact
# reviewed source must be an ancestor of origin/DEV and currently served by DEV.
[[ "$(git -C "$SOURCE" branch --show-current)" == rundeck-sphere-dev ]] || { echo "BLOCKED: wrong checkout"; exit 2; }
[[ -z "$(git -C "$SOURCE" status --porcelain)" ]] || { echo "BLOCKED: source checkout dirty"; exit 2; }
git -C "$SOURCE" fetch --no-tags origin rundeck-sphere-dev
[[ "$(git -C "$SOURCE" rev-parse HEAD)" == "$(git -C "$SOURCE" rev-parse origin/rundeck-sphere-dev)" ]] || {
  echo "BLOCKED: DEV checkout differs from GitHub" >&2; exit 2;
}
git -C "$SOURCE" cat-file -e "$APPROVED^{commit}"
git -C "$SOURCE" merge-base --is-ancestor "$APPROVED" origin/rundeck-sphere-dev || {
  echo "BLOCKED: approved SHA not contained in origin DEV" >&2; exit 2;
}
[[ -x "$SOURCE/node_modules/.bin/vite" ]] || { echo "BLOCKED: Vite unavailable"; exit 2; }
VERSION="$(git -C "$SOURCE" show "$APPROVED:src/app/version.js" | sed -n "s/^export const APP_VERSION = '\([^']*\)'.*/\1/p" | head -n1)"
[[ "$VERSION" == "$REVIEWED_VERSION" ]] || { echo "BLOCKED: incorrect application version $VERSION"; exit 2; }

# Visual acceptance is provided by the operator's screenshot; do not falsely
# claim Playwright or automated QA PASS.
[[ "$(readlink -f "$DEV_ROOT/current")" == "$DEV_ROOT/releases/$APPROVED" ]] || {
  echo "BLOCKED: reviewed SHA is not current live DEV web release" >&2; exit 2;
}
test -s "$DEV_ROOT/current/index.html"
grep -q '/dev/assets/' "$DEV_ROOT/current/index.html"
grep -Rqs "$SHORT" "$DEV_ROOT/current/assets"
curl --noproxy '*' --retry 2 --retry-delay 1 -fsS --max-time 15 \
  "https://sphere.astraotoparts.co.id/dev/?release_check=$SHORT" \
  -o "/tmp/sphere-prod-ui-dev-before-$$.html"
cmp -s "$DEV_ROOT/current/index.html" "/tmp/sphere-prod-ui-dev-before-$$.html" || {
  echo "BLOCKED: DEV live web HTML not identical to reviewed artifact"; exit 2;
}
echo "RELEASE_EVIDENCE=VERIFIED OPERATOR_SCREENSHOT=REVIEWED DEV_SHA=$APPROVED DEV_AUTO_QA=SKIPPED"

# Preserve current PROD web release as backup. Scope is STATIC FILES ONLY.
test -d "$PROD_RELEASES" && test -L "$PROD_CURRENT"
PREVIOUS="$(readlink -f "$PROD_CURRENT")"
[[ -d "$PREVIOUS" && "$PREVIOUS" == "$PROD_RELEASES/"* ]] || {
  echo "BLOCKED: PROD web is not a managed release symlink"; exit 2;
}
if [[ "$PREVIOUS" == "$RELEASE" ]]; then
  [[ -s "$RELEASE/index.html" ]] || { echo "BLOCKED: active PROD index missing"; exit 2; }
  curl --noproxy '*' -fsS --max-time 15 \
    "https://sphere.astraotoparts.co.id/?ui_release=$SHORT" \
    -o "/tmp/sphere-prod-ui-verify-$$.html"
  cmp -s "$RELEASE/index.html" "/tmp/sphere-prod-ui-verify-$$.html" || {
    echo "BLOCKED: active PROD release does not match public HTTPS"; exit 2;
  }
  echo "FINAL=PASS ALREADY_ACTIVE=YES SOURCE_SHA=$APPROVED PROD_BACKEND=UNCHANGED"
  exit 0
fi
[[ ! -e "$RELEASE" ]] || { echo "BLOCKED: release already exists"; exit 2; }
test -f "$NGINX_SITE"
nginx -t >/dev/null
NGINX_HASH="$(sha256sum "$NGINX_SITE" | cut -d' ' -f1)"
DEV_ACTIVE="$(readlink -f "$DEV_ROOT/current")"
DEV_INDEX_HASH="$(sha256sum "$DEV_ROOT/current/index.html" | cut -d' ' -f1)"
LEGACY_API="$(readlink -f /opt/sphere/current)"
PROD_API="$(readlink -f /opt/sphere-rundeck-prod/current)"
DEV_API="$(readlink -f /opt/sphere-rundeck-dev/current)"
[[ -n "$LEGACY_API" && -n "$PROD_API" && -n "$DEV_API" ]]
echo "BACKUP=RETAINED_PREVIOUS_PROD_WEB PATH=$PREVIOUS"

# Existing production read-only API contract must remain healthy.
check_api() {
  local label="$1" url="$2"
  curl --noproxy '*' --retry 2 --retry-delay 1 --retry-connrefused -fsS --max-time 15 "$url" \
    | python3 -c 'import json,sys; assert isinstance(json.load(sys.stdin),dict)' || {
      echo "BLOCKED: production API $label failed" >&2; return 1;
    }
  echo "API_$label=PASS"
}
check_api COLLECTIONS "https://sphere.astraotoparts.co.id/api/collections/latest"
check_api EVALUATION "https://sphere.astraotoparts.co.id/api/evaluation/workloads?period=1d&type=ALL&limit=1"
check_api INFRA "https://sphere.astraotoparts.co.id/api/infra/hosts"
check_api JOB_SOURCE "https://sphere.astraotoparts.co.id/api/jobs/source"
check_api PLATFORM "https://sphere.astraotoparts.co.id/api/platform/readiness"
check_api AVAILABILITY "https://sphere.astraotoparts.co.id/api/availability/latest"
check_api INCIDENT_HISTORY "https://sphere.astraotoparts.co.id/api/history/incidents?days=1&limit=1"
check_api HOST_HISTORY "https://sphere.astraotoparts.co.id/api/history/hosts/latest"
check_api RUNDECK_READINESS "https://sphere.astraotoparts.co.id/api/readiness"

echo "TARGET_PROD_VERSION=$VERSION SOURCE_SHA=$APPROVED"
echo "SCOPE=FRONTEND_ONLY PROD_BACKEND=UNCHANGED DB=UNCHANGED NGINX=UNCHANGED"
read -r -p "Type 'DEPLOY PROD $SHORT' to confirm cutover: " CONFIRM
[[ "$CONFIRM" == "DEPLOY PROD $SHORT" ]] || { echo "PROD=HOLD"; exit 2; }

# Build from exact approved source, isolated from DEV, with production BASE=/.
BUILD_DIR="$(mktemp -d /tmp/sphere-prod-ui-build.XXXXXXXX)"
git -C "$SOURCE" archive --format=tar "$APPROVED" | tar -xf - -C "$BUILD_DIR"
ln -s "$SOURCE/node_modules" "$BUILD_DIR/node_modules"
if ! (cd "$BUILD_DIR" && GITHUB_REF_NAME=rundeck-sphere-prod GITHUB_SHA="$APPROVED" npm run build) \
  > /tmp/sphere-prod-ui-build-v1350.log 2>&1; then
  echo "PROD_BUILD=FAIL"; tail -n 40 /tmp/sphere-prod-ui-build-v13486.log; exit 1;
fi
test -s "$BUILD_DIR/dist/index.html"
grep -q /assets/ "$BUILD_DIR/dist/index.html"
! grep -q /dev/assets/ "$BUILD_DIR/dist/index.html"
grep -Rqs "$VERSION" "$BUILD_DIR/dist/assets"
grep -Rqs "$SHORT" "$BUILD_DIR/dist/assets"
echo "PROD_BUILD=PASS BASE=/ SOURCE_SHA=$APPROVED"

STAGE_TMP="$(mktemp -d "$PROD_RELEASES/.ui-$SHORT.XXXXXXXX")"
cp -a "$BUILD_DIR/dist/." "$STAGE_TMP/"
printf 'version=%s\nsource_branch=rundeck-sphere-dev\nsource_sha=%s\noperator_screenshot_review=APPROVED\nautomated_visual_qa=SKIPPED\nproduction_scope=FRONTEND_ONLY\n' \
  "$VERSION" "$APPROVED" > "$STAGE_TMP/.sphere-ui-release-manifest"
mv -T "$STAGE_TMP" "$RELEASE"
STAGE_TMP=""
CREATED_RELEASE=1
ln -s "$RELEASE" "$PROD_ROOT/.next-ui-$$"
mv -Tf "$PROD_ROOT/.next-ui-$$" "$PROD_CURRENT"
CUTOVER=1

# Verify public PROD HTML and its hashed JS; rollback if either mismatches.
curl --noproxy '*' --retry 2 --retry-delay 1 -fsS --max-time 15 \
  "https://sphere.astraotoparts.co.id/?ui_release=$SHORT" \
  -o "/tmp/sphere-prod-ui-verify-$$.html"
cmp -s "$RELEASE/index.html" "/tmp/sphere-prod-ui-verify-$$.html"
ASSET_REL="$(grep -oE '/assets/[^"]+\.js' "$RELEASE/index.html" | head -n1)"
[[ -n "$ASSET_REL" && -f "$RELEASE$ASSET_REL" ]]
curl --noproxy '*' --retry 2 --retry-delay 1 -fsS --max-time 15 \
  "https://sphere.astraotoparts.co.id$ASSET_REL" \
  -o "/tmp/sphere-prod-ui-verify-$$.js"
cmp -s "$RELEASE$ASSET_REL" "/tmp/sphere-prod-ui-verify-$$.js"
curl --noproxy '*' --retry 2 --retry-delay 1 -fsS --max-time 15 \
  https://sphere.astraotoparts.co.id/dev/ -o "/tmp/sphere-prod-ui-dev-verify-$$.html"
cmp -s "$DEV_ROOT/current/index.html" "/tmp/sphere-prod-ui-dev-verify-$$.html"
check_api COLLECTIONS_AFTER "https://sphere.astraotoparts.co.id/api/collections/latest"
check_api JOB_SOURCE_AFTER "https://sphere.astraotoparts.co.id/api/jobs/source"
[[ "$(readlink -f "$PROD_CURRENT")" == "$RELEASE" ]]
[[ "$(readlink -f "$DEV_ROOT/current")" == "$DEV_ACTIVE" ]]
[[ "$(sha256sum "$DEV_ROOT/current/index.html" | cut -d' ' -f1)" == "$DEV_INDEX_HASH" ]]
[[ "$(readlink -f /opt/sphere/current)" == "$LEGACY_API" ]]
[[ "$(readlink -f /opt/sphere-rundeck-prod/current)" == "$PROD_API" ]]
[[ "$(readlink -f /opt/sphere-rundeck-dev/current)" == "$DEV_API" ]]
[[ "$(sha256sum "$NGINX_SITE" | cut -d' ' -f1)" == "$NGINX_HASH" ]]
echo "PUBLIC_PROD_HTML=PASS PUBLIC_JS=PASS DEV_UNCHANGED=PASS"
echo "FINAL=PASS PROD_UI=$VERSION SOURCE_SHA=$APPROVED PROD_BACKEND=UNCHANGED NGINX=UNCHANGED DB_MIGRATION=SKIPPED ROLLBACK_WEB=$PREVIOUS"

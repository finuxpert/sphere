#!/usr/bin/env bash
# Promote only the QA-attested SPHERE DEV 1.34.86 frontend to PROD.
# NEVER deploy API/backend, run a migration, reload Nginx, restart services,
# run Rundeck jobs, or update any production Git branch.
set -Eeuo pipefail
SOURCE=/root/rundeck-sphere-dev
DEV_ROOT=/var/www/sphere-dev
PROD_ROOT=/var/www/sphere.astraotoparts.co.id
PROD_RELEASES="$PROD_ROOT/releases"
PROD_CURRENT="$PROD_ROOT/current"
NGINX_SITE=/etc/nginx/sites-available/sphere.astraotoparts.co.id
APPROVED=099e2b6946238a0fd5701c6444adfae5a91edf11
SHORT="$(printf %.7s "$APPROVED")"
[[ "$#" -eq 1 && "$1" == "$APPROVED" ]] || { echo "BLOCKED: require exact approved DEV SHA $APPROVED" >&2; exit 2; }
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
    ln -s "$PREVIOUS" "$PROD_ROOT/.rollback-ui-$$"
    mv -Tf "$PROD_ROOT/.rollback-ui-$$" "$PROD_CURRENT"
    echo "ROLLBACK=RESTORED_PREVIOUS_PROD_WEB"
  fi
  if (( rc != 0 && CREATED_RELEASE == 1 )); then rm -rf -- "$RELEASE"; fi
  [[ -z "$STAGE_TMP" || ! -e "$STAGE_TMP" ]] || rm -rf -- "$STAGE_TMP"
  [[ -z "$BUILD_DIR" || ! -e "$BUILD_DIR" ]] || rm -rf -- "$BUILD_DIR"
  rm -f "/tmp/sphere-prod-ui-verify-$$.html" "/tmp/sphere-prod-ui-verify-$$.js" "/tmp/sphere-prod-ui-dev-verify-$$.html"
  exit "$rc"
}
trap cleanup EXIT

# Only this deployment helper is allowed to differ from the QA-passed code.
[[ "$(git -C "$SOURCE" branch --show-current)" == rundeck-sphere-dev ]]
[[ -z "$(git -C "$SOURCE" status --porcelain)" ]] || { echo "BLOCKED: source checkout dirty"; exit 2; }
git -C "$SOURCE" cat-file -e "$APPROVED^{commit}"
git -C "$SOURCE" merge-base --is-ancestor "$APPROVED" HEAD
[[ "$(git -C "$SOURCE" diff --name-only "$APPROVED" HEAD)" == "ops/rundeck/promote-ui-prod-from-dev.sh" ]] || {
  echo "BLOCKED: runtime files changed after DEV QA"; exit 2;
}
[[ -x "$SOURCE/node_modules/.bin/vite" ]]
[[ "$(git -C "$SOURCE" show "$APPROVED:src/app/version.js" | sed -n "s/^export const APP_VERSION = '\([^']*\)'.*/\1/p" | head -n1)" == 1.34.86 ]]

# Require actual release logs AND verified live DEV symlink for this SHA.
QA_LOG=/tmp/sphere-ui-v13486-qa.log
VISUAL_LOG=/tmp/sphere-ui-v13486-visual.log
test -s "$QA_LOG" && test -s "$VISUAL_LOG"
grep -Fq 'QA PASS' "$QA_LOG"
grep -Fq 'BUILD PASS' "$QA_LOG"
grep -Fq "ARTIFACT VERIFIED v1.34.86 · $SHORT" "$QA_LOG"
grep -Eq '(^|[^0-9])34 passed' "$VISUAL_LOG"
grep -Eq '(^|[^0-9])6 skipped' "$VISUAL_LOG"
[[ "$(readlink -f "$DEV_ROOT/current")" == "$DEV_ROOT/releases/$APPROVED" ]]
test -s "$DEV_ROOT/current/index.html"
grep -q /dev/assets/ "$DEV_ROOT/current/index.html"
grep -Rqs "$SHORT" "$DEV_ROOT/current/assets"
echo "RELEASE_EVIDENCE=VERIFIED DEV_SHA=$APPROVED DEV_QA=PASS DEV_VISUAL=PASS"

# Preserve current PROD web release as backup. Scope is STATIC FILES ONLY.
test -d "$PROD_RELEASES" && test -L "$PROD_CURRENT"
PREVIOUS="$(readlink -f "$PROD_CURRENT")"
[[ -d "$PREVIOUS" && "$PREVIOUS" == "$PROD_RELEASES/"* ]] || {
  echo "BLOCKED: PROD web is not a managed release symlink"; exit 2;
}
if [[ "$PREVIOUS" == "$RELEASE" ]]; then
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

# Build from exact approved source, isolated from DEV, with production BASE=/.
BUILD_DIR="$(mktemp -d /tmp/sphere-prod-ui-build.XXXXXXXX)"
git -C "$SOURCE" archive --format=tar "$APPROVED" | tar -xf - -C "$BUILD_DIR"
ln -s "$SOURCE/node_modules" "$BUILD_DIR/node_modules"
if ! (cd "$BUILD_DIR" && GITHUB_REF_NAME=rundeck-sphere-prod GITHUB_SHA="$APPROVED" npm run build) \
  > /tmp/sphere-prod-ui-build-v13486.log 2>&1; then
  echo "PROD_BUILD=FAIL"; tail -n 40 /tmp/sphere-prod-ui-build-v13486.log; exit 1;
fi
test -s "$BUILD_DIR/dist/index.html"
grep -q /assets/ "$BUILD_DIR/dist/index.html"
! grep -q /dev/assets/ "$BUILD_DIR/dist/index.html"
grep -Rqs 1.34.86 "$BUILD_DIR/dist/assets"
grep -Rqs "$SHORT" "$BUILD_DIR/dist/assets"
echo "PROD_BUILD=PASS BASE=/ SOURCE_SHA=$APPROVED"

STAGE_TMP="$(mktemp -d "$PROD_RELEASES/.ui-$SHORT.XXXXXXXX")"
cp -a "$BUILD_DIR/dist/." "$STAGE_TMP/"
printf 'version=1.34.86\nsource_branch=rundeck-sphere-dev\nsource_sha=%s\napproved_dev_qa=PASS\nproduction_scope=FRONTEND_ONLY\n' \
  "$APPROVED" > "$STAGE_TMP/.sphere-ui-release-manifest"
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
echo "FINAL=PASS PROD_UI=1.34.86 SOURCE_SHA=$APPROVED PROD_BACKEND=UNCHANGED NGINX=UNCHANGED DB_MIGRATION=SKIPPED ROLLBACK_WEB=$PREVIOUS"

#!/usr/bin/env bash
# SPHERE DEV exact-SHA UI-only release. No backend restart, poller start, migration or database write.
set -Eeuo pipefail
SOURCE=/root/rundeck-sphere-dev
WEB_ROOT=/var/www/sphere-dev
WEB_CURRENT="$WEB_ROOT/current"
EXPECTED="${1:?Pass the exact verified DEV GitHub SHA}"
PREVIOUS=''
STAGED=''
DEV_API_BEFORE=''
PROD_API_BEFORE=''
PROD_WEB=''
PROD_HASH=''
CUTOVER=0
SMOKE_HTML=''
cleanup() {
  local rc=$?
  trap - EXIT
  if [[ "$rc" -ne 0 && "$CUTOVER" == 1 && -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
    echo "ROLLBACK=RESTORE_PREVIOUS_DEV_WEB"
    ln -s "$PREVIOUS" "$WEB_ROOT/.rollback-$$"
    mv -Tf "$WEB_ROOT/.rollback-$$" "$WEB_CURRENT"
  fi
  if [[ "$rc" -ne 0 && -n "$STAGED" && "$STAGED" != "$PREVIOUS" ]]; then
    rm -rf -- "$STAGED"
  fi
  [[ -z "$SMOKE_HTML" ]] || rm -f "$SMOKE_HTML"
  exit "$rc"
}
trap cleanup EXIT

[[ "$(id -u)" == 0 ]]
[[ "$EXPECTED" =~ ^[0-9a-f]{40}$ ]]
cd "$SOURCE"
[[ "$(git branch --show-current)" == rundeck-sphere-dev ]]
[[ "$(git rev-parse HEAD)" == "$EXPECTED" ]]
[[ -z "$(git status --porcelain)" ]]
APP_VERSION="$(sed -n "s/^export const APP_VERSION = '\([^']*\)'.*/\1/p" src/app/version.js | head -n 1)"
[[ "$APP_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "BLOCKED: invalid APP_VERSION" >&2; exit 2; }
[[ -d "$WEB_ROOT/releases" ]]
PREVIOUS="$(readlink -f "$WEB_CURRENT")"
[[ -d "$PREVIOUS" && "$PREVIOUS" == "$WEB_ROOT/releases/"* ]]
DEV_API_BEFORE="$(readlink -f /opt/sphere-rundeck-dev/current)"
PROD_API_BEFORE="$(readlink -f /opt/sphere/current)"
PROD_WEB="$(readlink -f /var/www/sphere.astraotoparts.co.id/current)"
[[ -d "$DEV_API_BEFORE" && -d "$PROD_API_BEFORE" && -f "$PROD_WEB/index.html" ]]
PROD_HASH="$(sha256sum "$PROD_WEB/index.html" | cut -d' ' -f1)"
STAGED="$WEB_ROOT/releases/$EXPECTED"
[[ ! -e "$STAGED" ]] || { echo "BLOCKED: release path already exists ($STAGED)" >&2; STAGED=''; exit 2; }

# Build exact source, fail closed if the on-host frontend QA fails.
if ! bash ops/rundeck/qa-build-dev.sh "$SOURCE" > /tmp/sphere-ui-dev-release-qa.log 2>&1; then
  echo "QA=FAIL"
  tail -n 55 /tmp/sphere-ui-dev-release-qa.log
  exit 1
fi
[[ -z "$(git status --porcelain)" && "$(git rev-parse HEAD)" == "$EXPECTED" ]]
[[ -f dist/index.html ]]
grep -q '/dev/assets/' dist/index.html
grep -Rqs "$APP_VERSION" dist/assets
grep -Rqs "${EXPECTED:0:7}" dist/assets
echo "QA_BUILD=PASS APP_VERSION=$APP_VERSION SHA=${EXPECTED:0:8}"

# Atomic static web switch; no application processes or web-server reload.
install -d -m 0755 "$STAGED"
cp -a dist/. "$STAGED/"
[[ -f "$STAGED/index.html" ]]
grep -q '/dev/assets/' "$STAGED/index.html"
grep -Rqs "$APP_VERSION" "$STAGED/assets"
grep -Rqs "${EXPECTED:0:7}" "$STAGED/assets"
ln -s "$STAGED" "$WEB_ROOT/.next-$$"
mv -Tf "$WEB_ROOT/.next-$$" "$WEB_CURRENT"
CUTOVER=1

# Validate actual local TLS proxy responses without depending on external DNS.
SMOKE_HTML="$(mktemp)"
curl --noproxy '*' --resolve 'sphere.astraotoparts.co.id:443:127.0.0.1' \
  -fsS --connect-timeout 4 --max-time 15 \
  'https://sphere.astraotoparts.co.id/dev/' -o "$SMOKE_HTML"
cmp -s "$STAGED/index.html" "$SMOKE_HTML"
curl --noproxy '*' -fsS --max-time 8 'http://127.0.0.1:8091/health' \
  | python3 -c 'import json,sys; assert isinstance(json.load(sys.stdin),dict)'
for url in \
  'https://sphere.astraotoparts.co.id/dev/api/collections/latest' \
  'https://sphere.astraotoparts.co.id/api/collections/latest'
do
  curl --noproxy '*' --resolve 'sphere.astraotoparts.co.id:443:127.0.0.1' \
    -fsS --connect-timeout 4 --max-time 15 "$url" \
    | python3 -c 'import json,sys; assert isinstance(json.load(sys.stdin),dict)'
done
[[ "$(readlink -f "$WEB_CURRENT")" == "$STAGED" ]]
[[ "$(readlink -f /opt/sphere-rundeck-dev/current)" == "$DEV_API_BEFORE" ]]
[[ "$(readlink -f /opt/sphere/current)" == "$PROD_API_BEFORE" ]]
[[ "$(readlink -f /var/www/sphere.astraotoparts.co.id/current)" == "$PROD_WEB" ]]
[[ "$(sha256sum "$PROD_WEB/index.html" | cut -d' ' -f1)" == "$PROD_HASH" ]]
echo "FINAL=PASS MODE=DEV_UI_ONLY VERSION=$APP_VERSION DEV_SHA=$EXPECTED DB_MIGRATION=SKIPPED BACKEND=UNCHANGED POLLERS=NOT_RESTARTED PROD=UNCHANGED"

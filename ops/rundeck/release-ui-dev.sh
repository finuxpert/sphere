#!/usr/bin/env bash
# SPHERE DEV UI-only release: one QA/build, guarded browser geometry, static web switch.
# Does not restart backend services, run migrations, touch credentials or update PROD.
set -Eeuo pipefail
SOURCE=/root/rundeck-sphere-dev
WEB_ROOT=/var/www/sphere-dev
WEB_CURRENT="$WEB_ROOT/current"
EXPECTED="${1:?Pass exact verified GitHub SHA}"
PREVIEW_PID=""
CUTOVER=0
PREVIOUS=""
STAGED=""
PROD_WEB=""
PROD_HASH=""
cleanup() {
  local rc=$?
  trap - EXIT
  if [[ -n "$PREVIEW_PID" ]]; then
    kill "$PREVIEW_PID" 2>/dev/null || true
    wait "$PREVIEW_PID" 2>/dev/null || true
  fi
  if [[ "$rc" -ne 0 && "$CUTOVER" == 1 && -d "$PREVIOUS" ]]; then
    echo "ROLLBACK=RESTORE_PREVIOUS_DEV_WEB"
    ln -s "$PREVIOUS" "$WEB_ROOT/.rollback-$$"
    mv -Tf "$WEB_ROOT/.rollback-$$" "$WEB_CURRENT"
  fi
  if [[ "$rc" -ne 0 && -n "$STAGED" && "$STAGED" != "$PREVIOUS" ]]; then
    rm -rf -- "$STAGED"
  fi
  exit "$rc"
}
trap cleanup EXIT

[[ "$(id -u)" == 0 ]]
[[ "$EXPECTED" =~ ^[a-f0-9]{40}$ ]]
cd "$SOURCE"
[[ "$(git branch --show-current)" == "rundeck-sphere-dev" ]]
[[ "$(git rev-parse HEAD)" == "$EXPECTED" ]]
[[ -z "$(git status --porcelain)" ]]
grep -q "APP_VERSION = '1.34.86'" src/app/version.js
test -d "$WEB_ROOT/releases"
PREVIOUS="$(readlink -f "$WEB_CURRENT")"
[[ -d "$PREVIOUS" && "$PREVIOUS" == "$WEB_ROOT/releases/"* ]]
PROD_WEB="$(readlink -f /var/www/sphere.astraotoparts.co.id/current)"
[[ -f "$PROD_WEB/index.html" ]]
PROD_HASH="$(sha256sum "$PROD_WEB/index.html" | cut -d' ' -f1)"
[[ "$(readlink -f /opt/sphere/current)" != "" ]]

# DB read-only: no migration can run in this web-only release.
DB_REV="$(runuser -u sphere -- psql -XAt -d sphere_rundeck_dev -c 'SELECT version_num FROM alembic_version LIMIT 1;' | tr -d '\r\n')"
[[ "$DB_REV" == "20260929_0007" ]]
echo "SOURCE=VERIFIED DB_REV=$DB_REV MIGRATION=SKIP"

# Reuse a previously QA-attested build ONLY if the new commit changes no
# runtime source, assets, dependencies, configuration, or API.
ARTIFACT_SHA="${SPHERE_REUSE_QA_ARTIFACT_SHA:-$EXPECTED}"
if [[ "$ARTIFACT_SHA" != "$EXPECTED" ]]; then
  [[ "$ARTIFACT_SHA" == "5f9bf4aa84d5fd9b735479575f0a36456bafa3f4" ]]
  git merge-base --is-ancestor "$ARTIFACT_SHA" "$EXPECTED"
  DIFF="$(git diff --name-only "$ARTIFACT_SHA" "$EXPECTED")"
  [[ -n "$DIFF" ]]
  if grep -Ev '^(tests/visual/rundeck-v13479[.]visual[.]spec[.]mjs|ops/rundeck/release-ui-dev[.]sh)$' <<< "$DIFF"; then
    echo "BLOCKED: runtime source changes require fresh QA/build"
    exit 1
  fi
  grep -Fq 'QA PASS' /tmp/sphere-ui-v13486-qa.log
  grep -Fq 'BUILD PASS' /tmp/sphere-ui-v13486-qa.log
  grep -Fq "ARTIFACT VERIFIED v1.34.86 · ${ARTIFACT_SHA:0:7}" /tmp/sphere-ui-v13486-qa.log
  test -s dist/index.html
  grep -Rqs "${ARTIFACT_SHA:0:7}" dist/assets
  echo "QA_BUILD=PASS REUSED_VERIFIED_ARTIFACT=$ARTIFACT_SHA"
else
  if ! bash ops/rundeck/qa-build-dev.sh "$SOURCE" > /tmp/sphere-ui-v13486-qa.log 2>&1; then
    echo "QA=FAIL"
    tail -n 45 /tmp/sphere-ui-v13486-qa.log
    exit 1
  fi
  echo "QA_BUILD=PASS"
fi

# Playwright must be installed, and all four geometry viewports must PASS.
test -x node_modules/.bin/playwright || {
  echo "VISUAL=BLOCKED (Playwright not installed)"; exit 1;
}
./node_modules/.bin/vite preview \
  --config ops/rundeck/visual-preview-dev.config.mjs \
  --host 127.0.0.1 --port 4173 --strictPort \
  > /tmp/sphere-ui-v13486-preview.log 2>&1 &
PREVIEW_PID=$!
READY=0
for _ in {1..15}; do
  if curl --noproxy '*' -fsS --max-time 2 http://127.0.0.1:4173/dev/ >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
[[ "$READY" == 1 ]] || { tail -n 25 /tmp/sphere-ui-v13486-preview.log; exit 1; }
curl --noproxy '*' -fsS --max-time 10 http://127.0.0.1:4173/dev/api/collections/latest \
  | python3 -c 'import json,sys; x=json.load(sys.stdin); assert isinstance(x,dict)'
SPHERE_VISUAL_BASE_URL="http://127.0.0.1:4173/dev/#/tool/logs" \
  ./node_modules/.bin/playwright test -c playwright.config.mjs \
  tests/visual/rundeck-v13479.visual.spec.mjs \
  --grep 'v1\.34\.(83|84|85|86)' --workers=2 --reporter=line \
  > /tmp/sphere-ui-v13486-visual.log 2>&1 || {
  echo "VISUAL=FAIL"; tail -n 55 /tmp/sphere-ui-v13486-visual.log; exit 1;
}
echo "VISUAL_GEOMETRY=PASS"
kill "$PREVIEW_PID" 2>/dev/null || true
wait "$PREVIEW_PID" 2>/dev/null || true
PREVIEW_PID=""
[[ -z "$(git status --porcelain)" ]]
[[ "$(git rev-parse HEAD)" == "$EXPECTED" ]]

# This release changes only /dev static files. Keep DEV API and PROD fixed.
STAGED="$WEB_ROOT/releases/$EXPECTED"
[[ ! -e "$STAGED" ]] || { echo "BLOCKED: web release already exists"; exit 1; }
mkdir -m 0755 "$STAGED"
cp -a dist/. "$STAGED/"
test -f "$STAGED/index.html"
grep -q '/dev/assets/' "$STAGED/index.html"
grep -Rqs '1.34.86' "$STAGED/assets"
grep -Rqs "${ARTIFACT_SHA:0:7}" "$STAGED/assets"
ln -s "$STAGED" "$WEB_ROOT/.next-$$"
mv -Tf "$WEB_ROOT/.next-$$" "$WEB_CURRENT"
CUTOVER=1

curl --noproxy '*' -fsS --max-time 15 \
  https://sphere.astraotoparts.co.id/dev/ -o /tmp/sphere-ui-v13486-live.html
cmp -s "$STAGED/index.html" /tmp/sphere-ui-v13486-live.html
curl --noproxy '*' -fsS --max-time 15 \
  https://sphere.astraotoparts.co.id/dev/api/collections/latest \
  | python3 -c 'import json,sys; assert isinstance(json.load(sys.stdin),dict)'
[[ "$(readlink -f "$WEB_CURRENT")" == "$STAGED" ]]
[[ "$(readlink -f /var/www/sphere.astraotoparts.co.id/current)" == "$PROD_WEB" ]]
[[ "$(sha256sum "$PROD_WEB/index.html" | cut -d' ' -f1)" == "$PROD_HASH" ]]
echo "FINAL=PASS DEV_UI=1.34.86 SOURCE_SHA=$EXPECTED ARTIFACT_SHA=$ARTIFACT_SHA DB_MIGRATION=SKIPPED PROD=UNCHANGED"

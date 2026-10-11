#!/usr/bin/env bash
# Focused Android geometry QA. No deployment, migration or PROD mutation.
set -Eeuo pipefail
SOURCE=/root/rundeck-sphere-dev
EXPECTED="${1:?Pass the exact approved dev commit SHA}"
PREVIEW_PID=""
cleanup() {
  if [[ -n "$PREVIEW_PID" ]]; then
    kill "$PREVIEW_PID" 2>/dev/null || true
    wait "$PREVIEW_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT
[[ "$EXPECTED" =~ ^[0-9a-f]{40}$ ]]
cd "$SOURCE"
[[ "$(git branch --show-current)" == "rundeck-sphere-dev" ]]
[[ "$(git rev-parse HEAD)" == "$EXPECTED" ]]
[[ -z "$(git status --porcelain)" ]]
grep -q "APP_VERSION = '1.34.86'" src/app/version.js
test -x node_modules/.bin/playwright
test -x node_modules/.bin/vite
echo "SOURCE=VERIFIED SCOPE=ANDROID_TWO_FAILED_TESTS DEPLOY=DISABLED"
if ! npm run build > /tmp/sphere-android-focus-build.log 2>&1; then
  echo "BUILD=FAIL"
  tail -n 35 /tmp/sphere-android-focus-build.log
  exit 1
fi
test -s dist/index.html
grep -Rqs "${EXPECTED:0:7}" dist/assets
echo "BUILD=PASS SOURCE_SHA=$EXPECTED"
./node_modules/.bin/vite preview \
  --config ops/rundeck/visual-preview-dev.config.mjs \
  --host 127.0.0.1 --port 4173 --strictPort \
  > /tmp/sphere-android-focus-preview.log 2>&1 &
PREVIEW_PID=$!
READY=0
for _ in {1..15}; do
  if curl --noproxy '*' -fsS --max-time 2 http://127.0.0.1:4173/dev/ >/dev/null 2>&1; then
    READY=1; break
  fi
  sleep 1
done
if [[ "$READY" != 1 ]]; then
  echo "PREVIEW=FAIL"
  tail -n 20 /tmp/sphere-android-focus-preview.log
  exit 1
fi
curl --noproxy '*' -fsS --max-time 10 http://127.0.0.1:4173/dev/api/collections/latest \
  | python3 -c 'import json,sys; assert isinstance(json.load(sys.stdin),dict)'
echo "PREVIEW=PASS"
if ! SPHERE_VISUAL_BASE_URL="http://127.0.0.1:4173/dev/#/tool/logs" \
  ./node_modules/.bin/playwright test -c playwright.config.mjs \
  tests/visual/rundeck-v13479.visual.spec.mjs --project=android-393 \
  --grep 'v1\.34\.85 Cloudflare-inspired light tokens|v1\.34\.86 every analysis destination' \
  --workers=1 --reporter=line > /tmp/sphere-android-focus-visual.log 2>&1; then
  echo "TARGETED_ANDROID=FAIL"
  grep -E 'VISUAL_FAIL_BRIEF=|Error:|Expected:|Received:|[0-9]+ failed' \
    /tmp/sphere-android-focus-visual.log | tail -n 25 || true
  tail -n 22 /tmp/sphere-android-focus-visual.log
  exit 1
fi
echo "TARGETED_ANDROID=PASS"
grep -E '2 passed' /tmp/sphere-android-focus-visual.log | tail -n 1 || true
echo "DEPLOY=NOT_PERFORMED PROD=UNTOUCHED NEXT=FULL_RELEASE_QA"

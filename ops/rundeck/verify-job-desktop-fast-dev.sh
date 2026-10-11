#!/usr/bin/env bash
# Preflight only. Reuse the last v1.34.88 DEV UI build after test-only fixes.
# Do not deploy, restart a service, run migrations, or touch PROD.
set -Eeuo pipefail
SOURCE=/root/rundeck-sphere-dev
BASE=cd4837b5738894f0ca7deed91787c3185f27a3b1
EXPECTED="${1:?Pass the exact GitHub test-fix SHA}"
PREVIEW_PID=""
cleanup(){
  local rc=$?
  trap - EXIT
  if [[ -n "$PREVIEW_PID" ]]; then
    kill "$PREVIEW_PID" 2>/dev/null || true
    wait "$PREVIEW_PID" 2>/dev/null || true
  fi
  exit "$rc"
}
trap cleanup EXIT
cd "$SOURCE"
[[ "$(git branch --show-current)" == "rundeck-sphere-dev" ]]
[[ "$(git rev-parse HEAD)" == "$EXPECTED" ]]
[[ -z "$(git status --porcelain)" ]]
[[ -f dist/index.html ]]
grep -Rqs '1.34.88' dist/assets
grep -Rqs "${BASE:0:7}" dist/assets
git diff --quiet "$BASE" HEAD -- src/ package.json package-lock.json vite.config.js || {
  echo "FAST_PREVIEW=BLOCKED_SOURCE_CHANGED_NEEDS_NEW_BUILD"; exit 2;
}
if curl --noproxy '*' -fsS --max-time 2 http://127.0.0.1:4173/dev/ >/dev/null 2>&1; then
  echo "FAST_PREVIEW=BLOCKED_PORT_4173_IN_USE"; exit 2
fi
./node_modules/.bin/vite preview --config ops/rundeck/visual-preview-dev.config.mjs \
  --host 127.0.0.1 --port 4173 --strictPort > /tmp/sphere-ui-v13488-fast-preview.log 2>&1 &
PREVIEW_PID=$!
READY=0
for _ in {1..15}; do
  if curl --noproxy '*' -fsS --max-time 2 http://127.0.0.1:4173/dev/ >/dev/null 2>&1; then READY=1;break;fi
  sleep 1
done
[[ "$READY" == 1 ]] || { tail -n 30 /tmp/sphere-ui-v13488-fast-preview.log; exit 1; }
curl --noproxy '*' -fsS --max-time 10 \
  http://127.0.0.1:4173/dev/api/collections/latest \
  | python3 -c 'import json,sys; assert isinstance(json.load(sys.stdin),dict)'
SPHERE_VISUAL_BASE_URL="http://127.0.0.1:4173/dev/#/tool/logs" \
  ./node_modules/.bin/playwright test -c playwright.config.mjs \
  tests/visual/rundeck-v13479.visual.spec.mjs \
  --project=desktop-1536 --project=laptop-1366 \
  --grep 'v1\\.34\\.88 desktop Job' --workers=2 --reporter=line
echo "FAST_DESKTOP_JOB_QA=PASS scope=2tests_x_2viewports source_build=${BASE:0:7}"

#!/usr/bin/env bash
set -uo pipefail

ROOT="${1:-/root/rundeck-sphere-dev}"
LOG="${SPHERE_QA_LOG:-/tmp/sphere-qa.log}"

cd "$ROOT"

CURRENT_BRANCH="$(git branch --show-current)"
CURRENT_SHA="$(git rev-parse HEAD)"
if [[ "$CURRENT_BRANCH" != "rundeck-sphere-dev" ]]; then
  echo "QA BLOCKED: expected branch rundeck-sphere-dev, found ${CURRENT_BRANCH:-unknown}" >&2
  exit 2
fi
export GITHUB_REF_NAME="$CURRENT_BRANCH"
export GITHUB_SHA="$CURRENT_SHA"
rm -rf dist

echo "=== SPHERE DEV QA ==="
echo "Path: $ROOT"
echo "Log : $LOG"
echo "HEAD: $CURRENT_SHA"
echo

set +e
npm run qa 2>&1 | tee "$LOG"
qa_rc=${PIPESTATUS[0]}
set -e

echo
echo "=== FAILED CHECKS ==="
fails="$(grep -n '^FAIL ' "$LOG" || true)"

if [[ -n "$fails" ]]; then
  printf '%s\n' "$fails"
else
  echo "No FAIL checks found"
fi

if [[ $qa_rc -ne 0 || -n "$fails" ]]; then
  echo
  echo "QA FAILED - build skipped."
  echo "=== QA LOG TAIL ==="
  tail -n 40 "$LOG"
  exit 1
fi

APP_VERSION="$(sed -n "s/^export const APP_VERSION = '\([^']*\)'.*/\1/p" src/app/version.js | head -n 1)"
SHORT_SHA="${CURRENT_SHA:0:7}"
test -n "$APP_VERSION"
test -f dist/index.html
grep -Rqs "$APP_VERSION" dist/assets
grep -Rqs "$SHORT_SHA" dist/assets

echo
echo "=== RESULT ==="
echo "QA PASS"
echo "BUILD PASS"
echo "ARTIFACT VERIFIED v$APP_VERSION · $SHORT_SHA"

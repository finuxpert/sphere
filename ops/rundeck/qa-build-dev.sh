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

# Cache only a successful QA + exact immutable artifact for this source/environment.
# A different Node/npm runtime, frontend env, manifest, or dirty checkout never reuses QA.
APP_VERSION="$(sed -n "s/^export const APP_VERSION = '\([^']*\)'.*/\1/p" src/app/version.js | head -n 1)"
SHORT_SHA="${CURRENT_SHA:0:7}"
CACHE_DIR=/root/.cache/sphere-dev-qa
STAMP="$CACHE_DIR/$CURRENT_SHA.proof"
artifact_digest() {
  find dist -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}'
}
runtime_fingerprint() {
  {
    printf '%s\n' "$CURRENT_SHA" "$APP_VERSION"
    node --version
    npm --version
    sha256sum package.json package-lock.json
    env | grep -E '^(VITE_|NODE_ENV=|SPHERE_|GITHUB_)' | LC_ALL=C sort || true
  } | sha256sum | awk '{print $1}'
}
FINGERPRINT="$(runtime_fingerprint)"
if [[ -z "$(git status --porcelain)" && -s "$STAMP" && -f dist/index.html ]] &&
  grep -Rqs '/dev/assets/' dist/index.html &&
  grep -Rqs "$APP_VERSION" dist/assets &&
  grep -Rqs "$SHORT_SHA" dist/assets; then
  read -r SAVED_FINGERPRINT SAVED_ARTIFACT < "$STAMP" || true
  if [[ "$SAVED_FINGERPRINT" == "$FINGERPRINT" && "$SAVED_ARTIFACT" == "$(artifact_digest)" ]]; then
    echo "QA=REUSED BUILD=REUSED SOURCE_SHA=$CURRENT_SHA ARTIFACT_SHA=$SAVED_ARTIFACT"
    exit 0
  fi
fi

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
# Capture both legacy contract FAIL lines and Node TAP failures.
# The npm exit code remains authoritative even if there is no matching line.
fails="$(
  grep -n '^FAIL ' "$LOG" || true
  grep -nE '^not ok [0-9]+|^# fail [1-9][0-9]*' "$LOG" || true
)"

if [[ -n "$fails" ]]; then
  printf '%s\n' "$fails"
else
  echo "No explicit FAIL/TAP failure markers (npm exit code checked separately)"
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
mkdir -p "$CACHE_DIR"
TEMP_STAMP="$STAMP.$"
printf '%s %s\n' "$FINGERPRINT" "$(artifact_digest)" > "$TEMP_STAMP"
chmod 0600 "$TEMP_STAMP"
mv -f "$TEMP_STAMP" "$STAMP"
echo "QA_PROOF=VERIFIED SHA=$CURRENT_SHA"

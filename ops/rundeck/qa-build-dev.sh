#!/usr/bin/env bash
set -uo pipefail

ROOT="${1:-/root/rundeck-sphere-dev}"
LOG="${SPHERE_QA_LOG:-/tmp/sphere-qa.log}"

cd "$ROOT"

echo "=== SPHERE DEV QA ==="
echo "Path: $ROOT"
echo "Log : $LOG"
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

echo
echo "QA PASS - running build..."
npm run build

echo
echo "=== RESULT ==="
echo "QA PASS"
echo "BUILD PASS"

#!/usr/bin/env bash
# Fast, guarded combined DEV source refresh + QA + backend/web release.
set -Eeuo pipefail
SOURCE=/root/rundeck-sphere-dev
LOG=/tmp/sphere-dev-release-last.log
cd "$SOURCE"
START=$SECONDS
STAGE=SOURCE

report_failure() {
  local code="$1"
  echo "FINAL=FAIL STAGE=$STAGE SHA=$(git rev-parse --short HEAD 2>/dev/null || echo unknown) EXIT=$code"
  if [[ -f "$LOG" ]]; then
    grep -E '^FAIL |^not ok |BLOCKED|QA FAILED|DEPLOY FAILED|error:' "$LOG" | head -n 25 || true
  fi
  echo "LOG=$LOG"
}
trap 'rc=$?; if ((rc != 0)); then report_failure "$rc"; fi' EXIT

test "$(git branch --show-current)" = "rundeck-sphere-dev"
test -z "$(git status --porcelain)"
git fetch --no-tags origin rundeck-sphere-dev > "$LOG" 2>&1
git merge --ff-only origin/rundeck-sphere-dev >> "$LOG" 2>&1
SHA="$(git rev-parse HEAD)"
test -z "$(git status --porcelain)"
echo "SOURCE=PASS SHA=${SHA:0:8}"

STAGE=QA
QA_START=$SECONDS
bash ops/rundeck/qa-build-dev.sh >> "$LOG" 2>&1
echo "QA=PASS BUILD=PASS QA_SECONDS=$((SECONDS-QA_START))"

STAGE=BACKEND_UNIT_TESTS
/opt/sphere-rundeck-dev/venv/bin/python -m unittest \
  backend.tests.test_rundeck_evaluation_v1194 \
  backend.tests.test_rundeck_evaluation_paging_dev >> "$LOG" 2>&1
echo "BACKEND_TESTS=PASS"

STAGE=MIGRATION_GUARD
# An exact-SHA migration approval is issued only for an explicit operator SKIP
# with unchanged migration files relative to the active DEV release.
RUN_DEV_MIGRATIONS="$(sed -n 's/^SPHERE_RUN_DEV_MIGRATIONS=//p' /etc/sphere/rundeck-dev.env 2>/dev/null | tail -n 1 | tr -d '\r' || true)"
if [[ "$RUN_DEV_MIGRATIONS" == true ]]; then
  if [[ "${SPHERE_DEV_MIGRATION_DECISION:-}" != skip ]]; then
    echo "DEPLOY BLOCKED: run with SPHERE_DEV_MIGRATION_DECISION=skip after migration review" >> "$LOG"
    exit 42
  fi
  ACTIVE="$(basename "$(readlink -f /opt/sphere-rundeck-dev/current)")"
  if ! git cat-file -e "$ACTIVE^{commit}" 2>/dev/null ||
     ! git diff --quiet "$ACTIVE" "$SHA" -- backend/db/migrations; then
    echo "DEPLOY BLOCKED: migration scripts changed or active DEV commit unverified" >> "$LOG"
    exit 42
  fi
  export SPHERE_DEV_MIGRATION_APPROVED_SHA="$SHA"
fi

STAGE=DEPLOY
DEPLOY_START=$SECONDS
SPHERE_DEV_MIGRATION_DECISION=skip bash ops/rundeck/deploy-dev.sh >> "$LOG" 2>&1
echo "DEPLOY=PASS DB_MIGRATION=SKIPPED DEPLOY_SECONDS=$((SECONDS-DEPLOY_START))"
echo "FINAL=PASS DEV_SHA=${SHA:0:8} TOTAL_SECONDS=$((SECONDS-START)) PROD=UNCHANGED_BY_RELEASE_GUARDS"
trap - EXIT

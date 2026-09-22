#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${SPHERE_DEV_BASE_URL:-https://sphere.astraotoparts.co.id/dev/api}"
TMP_DIR="$(mktemp -d /tmp/sphere-job-intelligence-smoke.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

fetch() {
  local label=$1
  local path=$2
  local output=$3
  echo "SMOKE $label"
  curl --noproxy '*' -fsS --max-time 15 "$BASE_URL$path" -o "$output"
}

contains() {
  local label=$1
  local file=$2
  local pattern=$3
  grep -q "$pattern" "$file" || { echo "SMOKE FAILED $label: missing $pattern" >&2; head -c 800 "$file" >&2 || true; echo >&2; exit 1; }
  echo "SMOKE PASS $label"
}

fetch "platform readiness" "/platform/readiness" "$TMP_DIR/readiness.json"
contains "platform readiness" "$TMP_DIR/readiness.json" '"features"'
contains "platform readiness workload history" "$TMP_DIR/readiness.json" '"workload_history"'

fetch "SM37 source" "/jobs/source" "$TMP_DIR/source.json"
contains "SM37 source" "$TMP_DIR/source.json" '"status"'

fetch "Job Monitor" "/jobs/monitor?days=1&limit=20" "$TMP_DIR/monitor.json"
contains "Job Monitor" "$TMP_DIR/monitor.json" '"summary"'
contains "Job Monitor source" "$TMP_DIR/monitor.json" '"source"'

fetch "Review Queue" "/review/queue?days=1&limit=20" "$TMP_DIR/review.json"
contains "Review Queue" "$TMP_DIR/review.json" '"items"'

printf '\nJOB INTELLIGENCE DEV SMOKE PASS\n'

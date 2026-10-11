#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${1:-https://sphere.astraotoparts.co.id}"
TMP_AVAIL="$(mktemp /tmp/sphere-prod-availability.XXXXXX.json)"
TMP_EVIDENCE="$(mktemp /tmp/sphere-prod-evidence.XXXXXX.json)"
TMP_JOBS="$(mktemp /tmp/sphere-prod-jobs.XXXXXX.json)"
TMP_WATCHDOG="$(mktemp /tmp/sphere-prod-watchdog.XXXXXX.json)"
trap 'rm -f "$TMP_AVAIL" "$TMP_EVIDENCE" "$TMP_JOBS" "$TMP_WATCHDOG"' EXIT

fetch() {
  local label=$1
  local url=$2
  local output=$3
  local attempt
  echo "SMOKE ${label}"
  for attempt in 1 2 3; do
    if curl --noproxy '*' -fsS --max-time 15 "$url" -o "$output"; then
      return 0
    fi
    echo "SMOKE RETRY ${label} attempt=${attempt}" >&2
    sleep 1
  done
  echo "SMOKE FAILED ${label}: ${url}" >&2
  return 1
}

fetch "Availability SSH 30m" "$BASE_URL/api/availability/history?range=30m&category=SSH" "$TMP_AVAIL"
grep -q '"category":"SSH"' "$TMP_AVAIL" || { echo "SMOKE FAILED Availability SSH 30m: category marker missing" >&2; cat "$TMP_AVAIL" >&2; exit 1; }
echo "SMOKE PASS Availability SSH 30m"

fetch "Analysis evidence" "$BASE_URL/api/analysis/evidence?availability_range=30m" "$TMP_EVIDENCE"
grep -q '"correlation_mode":"supporting-evidence"' "$TMP_EVIDENCE" || { echo "SMOKE FAILED Analysis evidence: evidence marker missing" >&2; cat "$TMP_EVIDENCE" >&2; exit 1; }
echo "SMOKE PASS Analysis evidence"

fetch "SAP job source" "$BASE_URL/api/jobs/source" "$TMP_JOBS"
grep -q '"status"' "$TMP_JOBS" || { echo "SMOKE FAILED SAP job source: status marker missing" >&2; cat "$TMP_JOBS" >&2; exit 1; }
echo "SMOKE PASS SAP job source"

fetch "Watchdog events" "$BASE_URL/api/watchdog/events?limit=5" "$TMP_WATCHDOG"
grep -q '"items"' "$TMP_WATCHDOG" || { echo "SMOKE FAILED Watchdog events: items marker missing" >&2; cat "$TMP_WATCHDOG" >&2; exit 1; }
echo "SMOKE PASS Watchdog events"

echo "PRODUCTION RUNDECK ROUTING SMOKE PASS"

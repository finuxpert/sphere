#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${1:-https://sphere.astraotoparts.co.id/dev}"
PYTHON="${SPHERE_DEV_PYTHON:-/opt/sphere-rundeck-dev/venv/bin/python}"

tmp_health="$(mktemp)"
tmp_metrics="$(mktemp)"
tmp_events="$(mktemp)"
trap 'rm -f "$tmp_health" "$tmp_metrics" "$tmp_events"' EXIT

curl --noproxy '*' -fsS --max-time 10 "$BASE_URL/api/platform/health" -o "$tmp_health"
curl --noproxy '*' -fsS --max-time 10 "$BASE_URL/api/metrics" -o "$tmp_metrics"
curl --noproxy '*' -fsS --max-time 10 "$BASE_URL/api/watchdog/events?limit=5" -o "$tmp_events"

"$PYTHON" - "$tmp_health" "$tmp_events" <<'PY'
import json
import sys

health = json.load(open(sys.argv[1]))
events = json.load(open(sys.argv[2]))
collector = health.get("collector") or {}
status = str(collector.get("watchdog_status") or "UNKNOWN").upper()
if status in {"UNKNOWN", "NOT_CONFIGURED", "ERROR", "RECOVERY_FAILED"}:
    raise SystemExit(f"watchdog unhealthy: {status}")
if not isinstance(events.get("items"), list):
    raise SystemExit("watchdog events payload invalid")

print(
    "WATCHDOG",
    status,
    "auto_healing=" + ("on" if collector.get("auto_healing_enabled") else "off"),
    "age_seconds=" + str(collector.get("collection_age_seconds")),
    "recoveries=" + str(collector.get("auto_abort_total") or 0),
)
PY

grep -q '^sphere_collection_age_seconds ' "$tmp_metrics"
grep -q '^sphere_collector_stale ' "$tmp_metrics"
grep -q '^sphere_rundeck_execution_stuck ' "$tmp_metrics"
grep -q '^sphere_watchdog_auto_abort_total ' "$tmp_metrics"

"$PYTHON" - <<'PY'
from backend.rundeck_watchdog import watchdog_decision

assert watchdog_decision(120, 1, 300, 600, 2) == "NORMAL"
assert watchdog_decision(420, 1, 300, 600, 2) == "WARNING"
assert watchdog_decision(700, 1, 300, 600, 2) == "WARNING"
assert watchdog_decision(700, 2, 300, 600, 2) == "ABORT"
print("WATCHDOG DECISION CONTRACT PASS")
PY

echo "SPHERE WATCHDOG DEV SMOKE PASS"

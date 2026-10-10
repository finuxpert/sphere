#!/usr/bin/env bash
# Read-only DEV watchdog investigation. Never print credentials or mutate services.
set -uo pipefail

echo '=== SPHERE DEV WATCHDOG DIAGNOSTICS (READ ONLY) ==='
date '+%F %T %Z'

echo
echo '=== SERVICE / TIMER ==='
systemctl show sphere-rundeck-watchdog.service \
  -p ActiveState -p Result -p ExecMainCode -p ExecMainStatus \
  -p ExecMainStartTimestamp -p ExecMainExitTimestamp --no-pager 2>&1 || true
systemctl show sphere-rundeck-watchdog.timer \
  -p ActiveState -p LastTriggerUSec -p NextElapseUSecRealtime --no-pager 2>&1 || true

echo
echo '=== RECORDED STATE (ALLOWLIST FIELDS) ==='
python3 - <<'PY'
import json
from datetime import datetime, timezone
from pathlib import Path

root = Path("/var/lib/sphere/ingestion")
fields = {
    "watchdog.json": ("status", "error_type", "checked_at", "reader_credential_mode",
                      "auto_abort_enabled", "execution_id", "confirmations",
                      "running_duration_seconds", "recovery_action"),
    "poller.json": ("status", "error_type", "checked_at", "database_status",
                   "latest_execution", "credential_mode"),
}
for filename, names in fields.items():
    path = root / filename
    try:
        state = json.loads(path.read_text())
        if not isinstance(state, dict):
            raise ValueError("Unexpected data type")
        safe = {name: state.get(name) for name in names}
        at = state.get("checked_at")
        if isinstance(at, str):
            parsed = datetime.fromisoformat(at.replace("Z", "+00:00"))
            if parsed.tzinfo is not None:
                safe["checked_age_seconds"] = max(
                    0, int((datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)).total_seconds())
                )
        print(filename, json.dumps(safe, sort_keys=True))
    except (OSError, ValueError, TypeError) as exc:
        print(filename, type(exc).__name__, "(state unavailable or invalid)")

events_path = root / "watchdog-events.jsonl"
try:
    lines = events_path.read_text().splitlines()[-30:]
    events = [json.loads(line) for line in lines]
    recent = [
        {"at": item.get("at"), "event": item.get("event"), "error_type": item.get("error_type")}
        for item in events if isinstance(item, dict) and item.get("event") in {"WATCHDOG_ERROR", "RECOVERY_FAILED"}
    ]
    print("recent_watchdog_failures", json.dumps(recent[-5:]))
except (OSError, ValueError):
    print("recent_watchdog_failures unavailable")
PY

echo
echo '=== LAST SERVICE EXCEPTION CLASSES (NO RAW JOURNAL OR TOKENS) ==='
journalctl -u sphere-rundeck-watchdog.service -n 120 --no-pager -o cat 2>/dev/null | python3 -c '
import re, sys
matches = []
pattern = re.compile(r"(?<![A-Za-z])(?:[A-Za-z_][A-Za-z0-9_.]*\.)*[A-Za-z_][A-Za-z0-9_]*(?:Error|Exception|Timeout|Failure)\b")
for line in sys.stdin:
    classes = pattern.findall(line)
    for item in classes:
        if item not in matches:
            matches.append(item)
print(", ".join(matches[-12:]) if matches else "No exception class found in recent entries")
' || true

echo
echo '=== NEXT ==='
echo 'If watchdog remains ERROR, keep DEV deployment blocked.'
echo 'Check local Rundeck reachability and systemd journal privately; never paste tokens or credentials.'

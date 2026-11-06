#!/usr/bin/env bash
# SPHERE Availability historical evidence audit: local files and API GET only.
# No SQL, SAP/Rundeck calls, service/timer mutation, or background logging.
set -Eeuo pipefail
export TZ=Asia/Jakarta
PERIOD_START="2026-10-25T17:00:00Z"
PERIOD_END="2026-11-01T17:00:00Z"
ROOT="${SPHERE_INGESTION_ROOT:-/var/lib/sphere/ingestion}"
HISTORY="$ROOT/availability-history.jsonl"
API="${SPHERE_AUDIT_API:-http://127.0.0.1:8091}"
printf 'AUDIT=SPHERE_AVAILABILITY_READ_ONLY PERIOD=2026-10-26..2026-11-01_WIB\n'
printf 'HISTORY_PATH=%s\n' "$HISTORY"
if [[ ! -r "$HISTORY" ]]; then
  printf 'HISTORY_READABLE=NO PERIOD_DATA=UNVERIFIED\n'
else
  python3 - "$HISTORY" "$PERIOD_START" "$PERIOD_END" <<'PY'
import collections
import datetime as dt
import json
import os
import sys
path,start_raw,end_raw=sys.argv[1:]
start=dt.datetime.fromisoformat(start_raw.replace("Z","+00:00"))
end=dt.datetime.fromisoformat(end_raw.replace("Z","+00:00"))
stats={name:[] for name in ("APP1","APP2","APP3","APP4","APP5")}
bad=0
with open(path,encoding="utf-8",errors="replace") as fh:
    for line in fh:
        try:
            row=json.loads(line)
            checked=dt.datetime.fromisoformat(str(row.get("collected_at") or "").replace("Z","+00:00"))
            if checked.tzinfo is None or not start<=checked.astimezone(dt.timezone.utc)<end:
                continue
            for item in row.get("services",[]):
                name=str(item.get("name") or "").upper()
                state=str(item.get("status") or "").upper()
                if item.get("category")=="SAP_APP" and name in stats and state in {"UP","DOWN"}:
                    stats[name].append((checked,state,str(row.get("execution_id") or "")))
        except (ValueError,TypeError,KeyError,json.JSONDecodeError):
            bad+=1
print("HISTORY_BYTES=",os.path.getsize(path))
print("MALFORMED_HISTORY_LINES=",bad)
for name,rows in stats.items():
    distinct={(run,name): (at,state) for at,state,run in rows}
    cleaned=sorted(distinct.values())
    counts=collections.Counter(state for _,state in cleaned)
    first=cleaned[0][0].isoformat() if cleaned else "NONE"
    last=cleaned[-1][0].isoformat() if cleaned else "NONE"
    last_state=cleaned[-1][1] if cleaned else "UNKNOWN"
    print(f"{name} CHECKS={len(cleaned)} UP={counts['UP']} DOWN={counts['DOWN']} FIRST_UTC={first} LAST_UTC={last} LAST_OBSERVED={last_state}")
    if cleaned:
        lead=int((cleaned[0][0]-start).total_seconds())
        trail=int((end-cleaned[-1][0]).total_seconds())
        deltas=[int((b[0]-a[0]).total_seconds()) for a,b in zip(cleaned,cleaned[1:])]
        cadence=sorted(deltas)[len(deltas)//2] if deltas else None
        maximum=max(deltas) if deltas else None
        print(f"{name} LEADING_UNOBSERVED_SECONDS={lead} TRAILING_UNOBSERVED_SECONDS={trail} MEDIAN_INTERVAL_SECONDS={cadence} MAX_INTERVAL_SECONDS={maximum} PERIOD_COVERAGE=INCOMPLETE" if lead>3600 or trail>3600 else f"{name} LEADING_UNOBSERVED_SECONDS={lead} TRAILING_UNOBSERVED_SECONDS={trail} MEDIAN_INTERVAL_SECONDS={cadence} MAX_INTERVAL_SECONDS={maximum} PERIOD_COVERAGE=CHECK_BOUNDARIES_ONLY")
print("PERIOD_DATA=" + ("ABSENT" if not any(stats.values()) else
      "PARTIAL" if any(not stats[name] for name in stats) else "ALL_FIVE_OBSERVED"))
print("NOTE=Port checks are discrete observations; no duration uptime inferred")
PY
fi
for target in 8091 8092; do
  status="$(curl --noproxy '*' -sS --max-time 10 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${target}/health" || true)"
  printf 'API_%s_HEALTH_HTTP=%s\n' "$target" "$status"
done
# A 400 is expected on the old 24h-only route; new DEV code must return 200.
status="$(curl --noproxy '*' -sS --max-time 20 -o /dev/null -w '%{http_code}' \
  --get "$API/availability/history" \
  --data-urlencode 'range=custom' --data-urlencode 'category=SAP_APP' \
  --data-urlencode "from_at=$PERIOD_START" \
  --data-urlencode "to_at=$PERIOD_END" || true)"
printf 'HISTORICAL_WEEK_API_HTTP=%s\n' "$status"
printf 'SNAPSHOT_PROD_TIMER_STATE='
systemctl is-enabled sphere-report-precompute-prod.timer 2>/dev/null || true
printf 'SNAPSHOT_DEV_WORKER_STATE='
systemctl is-active sphere-report-precompute-dev.service 2>/dev/null || true
printf 'SNAPSHOT_PROD_WORKER_STATE='
systemctl is-active sphere-report-precompute-prod.service 2>/dev/null || true
printf 'FINAL=AUDIT_COMPLETE LIVE_DEPLOYMENT=NONE\n'

#!/usr/bin/env bash
# Read-only, one-request SAP reporting SQL timing capture. Never prints report rows.
# Usage: sudo bash ops/rundeck/diagnose-report-query.sh dev week 2026-10-26
#        sudo bash ops/rundeck/diagnose-report-query.sh dev month 2026-10
set -Eeuo pipefail
[[ "$(id -u)" -eq 0 ]] || { echo "Run as root to read pg_stat_activity" >&2; exit 2; }
TARGET="${1:?Specify dev or prod explicitly}"
PERIOD="${2:?Specify month or week}"
VALUE="${3:?Pass YYYY-MM or YYYY-MM-DD}"
case "$TARGET" in
  dev) PORT=8091; DB=sphere_rundeck_dev ;;
  prod) PORT=8090; DB=sphere ;;
  *) echo "Invalid target: dev or prod" >&2; exit 2 ;;
esac
case "$PERIOD" in
  month)
    [[ "$VALUE" =~ ^[0-9]{4}-(0[1-9]|1[0-2])$ ]] || exit 2
    MONTH="$VALUE"
    args=(--data-urlencode "month=$MONTH")
    ;;
  week)
    [[ "$VALUE" =~ ^[0-9]{4}-(0[1-9]|1[0-2])-[0-3][0-9]$ ]] || exit 2
    MONTH="${VALUE:0:7}"
    args=(--data-urlencode "month=$MONTH" --data-urlencode "week_start=$VALUE")
    ;;
  *) echo "Invalid period: month or week" >&2; exit 2 ;;
esac
tmp="$(mktemp)"
cleanup() { rm -f "$tmp"; }
trap cleanup EXIT
echo "EVAL_DIAG=START target=$TARGET period=$PERIOD value=$VALUE"
echo "Only one read-only evaluation request will be made; no writes or restarts."
curl --noproxy '*' -sS -G --connect-timeout 3 --max-time 100 \
  "${args[@]}" --data-urlencode 'type=ALL' --data-urlencode 'limit=1' \
  --data-urlencode 'offset=0' \
  -o "$tmp" -w 'EVAL_HTTP=%{http_code} TOTAL_SECONDS=%{time_total}\n' \
  "http://127.0.0.1:$PORT/evaluation/workloads/monthly" &
request_pid=$!
while kill -0 "$request_pid" 2>/dev/null; do
  # Active query timings are snapshots; no EXPLAIN ANALYZE or table locks.
  sudo -u postgres psql -X -q -d postgres -P pager=off -v ON_ERROR_STOP=1 -c "
    SELECT to_char(clock_timestamp(), 'HH24:MI:SS') AS at,
           pid, round(extract(epoch FROM (clock_timestamp()-query_start))::numeric, 1) AS query_seconds,
           coalesce(wait_event_type, '-') AS wait_type,
           coalesce(wait_event, '-') AS wait_event,
           left(regexp_replace(query, '[[:space:]]+', ' ', 'g'), 160) AS query_prefix
    FROM pg_stat_activity
    WHERE datname = '$DB' AND state = 'active'
      AND pid <> pg_backend_pid()
    ORDER BY query_start ASC
    LIMIT 8;
  " || true
  sleep 2
done
rc=0
wait "$request_pid" || rc=$?
echo "EVAL_CURL_RC=$rc"
python3 - "$tmp" <<'PY'
import json,sys
try:
    with open(sys.argv[1]) as fh:
        value=json.load(fh)
except (OSError, ValueError) as err:
    print("EVAL_PAYLOAD=UNREADABLE",type(err).__name__)
    sys.exit(0)
if not isinstance(value,dict):
    print("EVAL_PAYLOAD=UNEXPECTED")
    sys.exit(0)
runtime=value.get("runtime") or {}
print("EVAL_CACHE="+str(runtime.get("cache","N/A")))
print("EVAL_DURATION_MS="+str(runtime.get("duration_ms","N/A")))
print("EVAL_LOCK_WAIT_MS="+str(runtime.get("lock_wait_ms","N/A")))
for name,ms in sorted((runtime.get("sql_timings_ms") or {}).items(),
                      key=lambda item:float(item[1]),reverse=True):
    print("STAGE=%s DURATION_MS=%s"%(name,ms))
print("EVAL_ERROR_TYPE="+str((value.get("detail") or "").split(":")[0])[:70])
PY
echo "EVAL_DIAG=FINISHED"

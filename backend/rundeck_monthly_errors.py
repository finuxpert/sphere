"""Read-only monthly ABAP error evidence from retained SPHERE WP observations.

Trace values are not ST22 or SM37 authority. A timestamped trace observation
is counted only when its explicit event timestamp falls inside the selected
calendar month. Repeated collector snapshots of the same host/PID/code/event
timestamp are deduplicated. Untimed WP error signals remain observations, never
manufactured as new monthly incidents.
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text

MAX_ERROR_GROUPS = 15000

CATEGORIES = (
    (r"TSV_TNEW_PAGE_ALLOC_FAILED|SYSTEM_NO_ROLL|SYSTEM_NO_TASK_STORAGE|OUT_OF_MEMORY|MEMORY[_ -]?(ALLOC|NO_MORE)", "MEMORY", "Memori"),
    (r"DBSQL_SQL_DEADLOCK|SQL_DEADLOCK|DEADLOCK", "LOCK", "Lock dan deadlock"),
    (r"DBSQL_SQL_ERROR|DBIF_RSQL|SQL_ERROR|DUPLICATE_KEY", "DATABASE", "Database"),
    (r"TIME_OUT|TIMEOUT", "RUNTIME", "Waktu proses"),
    (r"CALL_FUNCTION_SEND_ERROR|CALL_FUNCTION_REMOTE_ERROR|RFC|COMMUNICATION|CONNECTION|ICM|NI_", "RFC", "RFC dan koneksi"),
    (r"RAISE_EXCEPTION|ASSERTION_FAILED|MESSAGE_TYPE_X|SYSTEM_CORE_DUMPED", "APPLICATION", "Aplikasi ABAP"),
    (r"STRING_SIZE_TOO_LARGE|CONVT_|MOVE_TO_LIT_NOTALLOWED_NODATA|IMPORT_WRONG_END_POS|EXPORT_TOO_MUCH_DATA", "ABAP_DATA", "Pengolahan data ABAP"),
)


def classify_error(code: str) -> tuple[str, str]:
    for pattern, key, title in CATEGORIES:
        if re.search(pattern, code, re.IGNORECASE):
            return key, title
    return "OTHER", "Lainnya"


def parse_explicit_error_time(value: Any) -> datetime | None:
    """Only timezone-aware timestamps are verifiable as exact month events."""
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    return parsed.astimezone(timezone.utc) if parsed.tzinfo else None


def summarize_monthly_wp_errors(rows: list[dict], start: datetime, end: datetime, *, truncated: bool = False) -> dict:
    """Aggregate candidate WP signals without converting trace rereads to new errors."""
    events: set[tuple] = set()
    categories: dict[tuple, dict] = {}
    untimed = 0
    snapshot_checks: set[tuple] = set()
    for row in rows:
        snapshot_code = str(row.get("error_at_snapshot") or "").strip()
        trace_code = str(row.get("latest_trace_error") or "").strip()
        code = snapshot_code or trace_code
        if not code or code == "?":
            continue
        host = str(row.get("host") or "").strip().upper()
        pid = str(row.get("pid") or "").strip()
        explicit_program = str(row.get("error_program") or "").strip()
        # A nearby JOB / PROGRAM observation is not proof it owns the trace.
        program = explicit_program or "Belum teridentifikasi"
        timestamp = parse_explicit_error_time(row.get("latest_error_ts"))
        # latest_error_ts belongs to the latest trace, not necessarily the
        # error_at_snapshot. Never assign the trace timestamp to a different
        # snapshot code and accidentally manufacture a verified event.
        if snapshot_code and trace_code and snapshot_code != trace_code:
            timestamp = None
        category, label = classify_error(code)
        group_key = (category, code, program, host)
        item = categories.setdefault(group_key, {
            "category": category, "category_label": label,
            "error_code": code, "program": program, "host": host,
            "events": set(), "snapshot_checks": set(), "untimed_checks": set(),
            "first_at": None, "last_at": None,
            "sample_workload": str(row.get("consumer_key") or ""),
            "program_link": "EXPLICIT_ERROR_PROGRAM" if explicit_program else "CONTEXT_ONLY",
            "cpu_snapshot_pct": None, "pss_snapshot_gb": None,
        })
        if row.get("error_at_snapshot"):
            # Resource values describe the collection snapshot, not the
            # historical time at which a retained trace error may have started.
            for source_key, result_key in (("cpu_pct", "cpu_snapshot_pct"), ("pss_gb", "pss_snapshot_gb")):
                try:
                    value = float(row[source_key]) if row.get(source_key) is not None else None
                except (TypeError, ValueError):
                    value = None
                if value is not None:
                    item[result_key] = max(value, item[result_key]) if item[result_key] is not None else value
            key = (host, str(row.get("collection_id") or ""), pid, code)
            if key not in snapshot_checks:
                snapshot_checks.add(key)
            item["snapshot_checks"].add(key)
        if timestamp is None:
            untimed += int(row.get("collection_checks") or 1)
            item["untimed_checks"].add((host, str(row.get("collection_id") or ""), pid, code))
            continue
        if not start <= timestamp < end:
            # Historical trace from another month is not an error of this month.
            continue
        # Same retained trace seen in multiple collector runs counts once.
        event_key = (host, pid, code, timestamp.isoformat())
        events.add(event_key)
        item["events"].add(event_key)
        for field, fn in (("first_at", min), ("last_at", max)):
            current = item[field]
            item[field] = fn(current, timestamp) if current else timestamp
    result = []
    for item in categories.values():
        count = len(item["events"])
        observed = len(item["snapshot_checks"])
        untimed_checks = len(item["untimed_checks"])
        # An untimed trace stays visible as a signal for ABAP investigation.
        if not count and not observed and not untimed_checks:
            continue
        result.append({
            **{key: value for key, value in item.items() if key not in {"events", "snapshot_checks", "untimed_checks"}},
            "event_count": count,
            "snapshot_host_checks": observed,
            "untimed_trace_checks": untimed_checks,
            "first_at": item["first_at"],
            "last_at": item["last_at"],
        })
    result.sort(key=lambda row: (-row["event_count"], -row["snapshot_host_checks"], row["error_code"], row["program"]))
    count_by_category: dict[str, int] = defaultdict(int)
    for item in result:
        count_by_category[item["category_label"]] += item["event_count"]
    return {
        "status": ("TRUNCATED" if truncated else "TIMESTAMPED_TRACE" if events
                   else "SNAPSHOT_ONLY" if snapshot_checks
                   else "UNTIMED_TRACE_ONLY" if untimed else "NO_RETAINED_ERROR_EVIDENCE"),
        "timestamped_events": len(events),
        "snapshot_host_checks": len(snapshot_checks),
        "untimed_trace_observations": untimed,
        "groups": len(result),
        "top_errors": result[:20],
        "categories": [
            {"category": category, "event_count": count}
            for category, count in sorted(count_by_category.items(), key=lambda row: (-row[1], row[0]))
        ],
        "truncated": truncated,
        "scope": "SPHERE_WP_TRACE_NOT_ST22_OR_SM37",
        "definition": (
            "Timestamped events are unique host/PID/error/timestamp combinations. "
            "Error at Snapshot is a collector observation, not a confirmed dump. "
            "Missing event time is not included in monthly event counts."
        ),
    }


def monthly_error_evidence(conn, start: datetime, end: datetime, source: str, complete_clause: str) -> dict:
    """Only query normalized, retained and complete in-month SPHERE observations."""
    rows = [dict(row) for row in conn.execute(text(f"""
        SELECT tc.collection_id, tc.host, tc.consumer_type, tc.consumer_key,
               signal.value->>'pid' AS pid,
               signal.value->>'error_at_snapshot' AS error_at_snapshot,
               signal.value->>'latest_trace_error' AS latest_trace_error,
               signal.value->>'error_program' AS error_program,
               signal.value->>'error_recency' AS error_recency,
               signal.value->>'latest_error_ts' AS latest_error_ts,
               MAX(tc.cpu_pct) AS cpu_pct,
               MAX(NULLIF(COALESCE(tc.details->>'total_pss_gb', tc.details->>'pss_gb'), '')::double precision) AS pss_gb,
               COUNT(DISTINCT tc.collection_id) AS collection_checks
          FROM {source} tc
          JOIN rundeck_collections c ON c.collection_id = tc.collection_id
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(tc.details->'wp_signals') = 'array'
                 THEN tc.details->'wp_signals' ELSE '[]'::jsonb END
          ) AS signal(value)
         WHERE {complete_clause}
           AND COALESCE(c.finished_at, c.started_at) >= :start
           AND COALESCE(c.finished_at, c.started_at) < :end
           AND tc.collected_at >= :start AND tc.collected_at < :end
           AND tc.consumer_type IN ('JOB', 'PROGRAM')
           AND (
             NULLIF(signal.value->>'error_at_snapshot', '') IS NOT NULL
             OR NULLIF(signal.value->>'latest_trace_error', '') IS NOT NULL
           )
         GROUP BY tc.collection_id, tc.host, tc.consumer_type, tc.consumer_key,
                  signal.value->>'pid', signal.value->>'error_at_snapshot',
                  signal.value->>'latest_trace_error', signal.value->>'error_program',
                  signal.value->>'error_recency', signal.value->>'latest_error_ts'
         ORDER BY tc.host, tc.consumer_key
         LIMIT :max_groups
    """), {"start": start, "end": end, "max_groups": MAX_ERROR_GROUPS + 1}).mappings().all()]
    truncated = len(rows) > MAX_ERROR_GROUPS
    return summarize_monthly_wp_errors(rows[:MAX_ERROR_GROUPS], start, end, truncated=truncated)

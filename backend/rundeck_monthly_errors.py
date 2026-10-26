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
    (r"TSV_TNEW_PAGE_ALLOC(?:_FAILED)?|SYSTEM_NO_ROLL|SYSTEM_NO_TASK_STORAGE|OUT_OF_MEMORY|MEMORY[_ -]?(ALLOC|NO_MORE)", "MEMORY", "Memory"),
    (r"DBSQL_SQL_DEADLOCK|SQL_DEADLOCK|DEADLOCK", "LOCK", "Lock / Deadlock"),
    (r"DBSQL_SQL_ERROR|DBIF_RSQL|SQL_ERROR|DUPLICATE_KEY", "DATABASE", "Database"),
    (r"TIME_OUT|TIMEOUT", "RUNTIME", "Runtime / Timeout"),
    (r"CALL_FUNCTION_SEND_(?:ERR|ERROR)|CALL_FUNCTION_REMOTE_ERROR|RFC|COMMUNICATION|CONNECTION|ICM|NI_", "RFC", "RFC / Network"),
    (r"RAISE_EXCEPTION|ASSERTION_FAILED|MESSAGE_TYPE_X|SYSTEM_CORE_DUMPED", "APPLICATION", "ABAP Application"),
    (r"STRING_SIZE_TOO_LARGE|CONVT_|MOVE_TO_LIT_NOTALLOWED_NODATA|IMPORT_WRONG_END_POS|EXPORT_TOO_MUCH_DATA", "ABAP_DATA", "ABAP Data"),
)


def classify_error(code: str) -> tuple[str, str]:
    for pattern, key, title in CATEGORIES:
        if re.search(pattern, code, re.IGNORECASE):
            return key, title
    return "OTHER", "Other"


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


def _positive_signal(value: Any) -> bool:
    try:
        return float(value or 0) > 0
    except (TypeError, ValueError):
        return False


def summarize_monthly_wp_errors(rows: list[dict], start: datetime, end: datetime, *, truncated: bool = False) -> dict:
    """Keep explicitly dated errors, snapshot errors and untimed WP signals distinct."""
    events: set[tuple] = set()
    snapshot_checks: set[tuple] = set()
    untimed_checks: set[tuple] = set()
    diagnostic_checks: set[tuple] = set()
    categories: dict[tuple, dict] = {}
    diagnostics: dict[tuple, dict] = {}

    for row in rows:
        host = str(row.get("host") or "").strip().upper()
        pid = str(row.get("pid") or "").strip()
        collection_id = str(row.get("collection_id") or "")
        explicit_program = str(row.get("error_program") or "").strip()
        if explicit_program.upper() in {"?", "NA", "N/A", "-"}:
            explicit_program = ""
        program = explicit_program or "Belum teridentifikasi"
        context_workload = str(row.get("consumer_key") or "")
        wp_number = str(row.get("wp") or "").strip()
        wp_type = str(row.get("wp_type") or "").strip()
        job_name = str(row.get("job_name") or "").strip()
        log_path = str(row.get("log_path") or "").strip()
        observed_at = row.get("observed_at")
        program_link = "EXPLICIT_ERROR_PROGRAM" if explicit_program else "CONTEXT_ONLY"

        # RABAX and RXMSG tail counts are diagnostic evidence, NOT unique dumps
        # or events. Never assign their snapshot date as the error event date.
        for source_key, label in (("rabax", "RABAX"), ("rxmsg", "RXMSG")):
            if not _positive_signal(row.get(source_key)):
                continue
            signal_key = (host, collection_id, pid, label)
            diagnostic_checks.add(signal_key)
            key = (label, host, program)
            item = diagnostics.setdefault(key, {
                "signal": label, "host": host, "program": program,
                "program_link": program_link, "sample_workload": context_workload,
                "checks": set(), "peak_tail_count": 0.0,
            })
            item["checks"].add((collection_id, host, pid))
            item["peak_tail_count"] = max(item["peak_tail_count"], float(row[source_key]))

        raw_code = str(row.get("error_code") or "").strip()
        recency = str(row.get("error_recency") or "").upper().strip()
        snapshot_code = str(row.get("error_at_snapshot") or "").strip()
        if not snapshot_code and recency == "AT_SNAPSHOT":
            snapshot_code = raw_code
        trace_code = str(row.get("latest_trace_error") or raw_code).strip()
        if trace_code.upper() in {"?", "NA", "N/A", "-"}:
            trace_code = ""
        timestamp = parse_explicit_error_time(row.get("latest_error_ts"))

        # Snapshot and latest trace can contain DIFFERENT error codes.
        # Evaluate separately: a trace timestamp must never be borrowed by
        # a different snapshot error, but the dated trace remains visible.
        for origin, code in (("snapshot", snapshot_code), ("trace", trace_code)):
            if not code or code == "?":
                continue
            category, label = classify_error(code)
            group_key = (category, code, program, host)
            item = categories.setdefault(group_key, {
                "category": category, "category_label": label,
                "error_code": code, "program": program, "host": host,
                "events": set(), "snapshot_checks": set(), "untimed_checks": set(),
                "pids": set(), "wps": set(), "job_names": set(), "log_paths": set(),
                "first_at": None, "last_at": None,
                "sample_workload": context_workload,
                "program_link": program_link,
                "cpu_snapshot_pct": None, "pss_snapshot_gb": None,
                "observed_at": observed_at, "error_recency": recency,
            })
            if pid:
                item["pids"].add(pid)
            if wp_number:
                item["wps"].add(f"{wp_type} {wp_number}".strip())
            if job_name:
                item["job_names"].add(job_name)
            if log_path:
                item["log_paths"].add(log_path)
            signal_key = (host, collection_id, pid, code)
            if origin == "snapshot":
                snapshot_checks.add(signal_key)
                item["snapshot_checks"].add(signal_key)
                for source_key, target_key in (("cpu_pct", "cpu_snapshot_pct"), ("pss_gb", "pss_snapshot_gb")):
                    try:
                        value = float(row[source_key]) if row.get(source_key) is not None else None
                    except (TypeError, ValueError):
                        value = None
                    if value is not None:
                        prior = item[target_key]
                        item[target_key] = max(value, prior) if prior is not None else value
                continue
            if timestamp is None:
                untimed_checks.add(signal_key)
                item["untimed_checks"].add(signal_key)
                continue
            if start <= timestamp < end:
                event_key = (host, pid, code, timestamp.isoformat())
                events.add(event_key)
                item["events"].add(event_key)
                for field, fn in (("first_at", min), ("last_at", max)):
                    prior = item[field]
                    item[field] = fn(prior, timestamp) if prior else timestamp

    result = []
    for item in categories.values():
        count = len(item["events"])
        observed = len(item["snapshot_checks"])
        untimed_count = len(item["untimed_checks"])
        if not (count or observed or untimed_count):
            continue
        result.append({
            **{key: value for key, value in item.items() if key not in {"events", "snapshot_checks", "untimed_checks", "pids", "wps", "job_names", "log_paths"}},
            "pids": sorted(item["pids"]),
            "wps": sorted(item["wps"]),
            "job_names": sorted(item["job_names"]),
            "log_paths": sorted(item["log_paths"])[:3],
            "event_count": count,
            "snapshot_host_checks": observed,
            "untimed_trace_checks": untimed_count,
        })
    result.sort(key=lambda row: (-row["event_count"], -row["snapshot_host_checks"], row["error_code"], row["program"]))
    count_by_category: dict[str, int] = defaultdict(int)
    for item in result:
        count_by_category[item["category_label"]] += item["event_count"]
    diagnostic_rows = [{
        **{key: value for key, value in item.items() if key != "checks"},
        "observed_checks": len(item["checks"]),
    } for item in diagnostics.values()]
    diagnostic_rows.sort(key=lambda item: (-item["observed_checks"], item["signal"], item["host"], item["program"]))
    # Counts include the complete processed history, not just top_errors[:20].
    # Only an explicitly named error_program counts as an identified program.
    explicit_rows = [row for row in result if row["program_link"] == "EXPLICIT_ERROR_PROGRAM"]
    known_programs = {row["program"] for row in explicit_rows}
    dated_programs = {row["program"] for row in explicit_rows if row["event_count"] > 0}
    explicit_diagnostics = [row for row in diagnostic_rows if row["program_link"] == "EXPLICIT_ERROR_PROGRAM"]
    rabax_programs = {row["program"] for row in explicit_diagnostics if row["signal"] == "RABAX"}
    rxmsg_programs = {row["program"] for row in explicit_diagnostics if row["signal"] == "RXMSG"}
    return {
        "status": ("TRUNCATED" if truncated else "TIMESTAMPED_TRACE" if events
                   else "SNAPSHOT_ONLY" if snapshot_checks
                   else "UNTIMED_TRACE_ONLY" if untimed_checks
                   else "WP_SIGNALS_ONLY" if diagnostic_checks else "NO_RETAINED_ERROR_EVIDENCE"),
        "timestamped_events": len(events),
        "snapshot_host_checks": len(snapshot_checks),
        "untimed_trace_observations": len(untimed_checks),
        "wp_signal_host_checks": len(diagnostic_checks),
        "error_program_count": len(known_programs),
        "dated_error_program_count": len(dated_programs),
        "error_code_count": len({row["error_code"] for row in result}),
        "rabax_program_count": len(rabax_programs),
        "rxmsg_program_count": len(rxmsg_programs),
        "rabax_wp_checks": sum(row["observed_checks"] for row in diagnostic_rows if row["signal"] == "RABAX"),
        "rxmsg_wp_checks": sum(row["observed_checks"] for row in diagnostic_rows if row["signal"] == "RXMSG"),
        "wp_diagnostics": diagnostic_rows[:20],
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
            "RABAX and RXMSG are diagnostic tail signals, not incident counts. "
            "Missing event time is not included in monthly event counts."
        ),
    }


def monthly_error_evidence(conn, start: datetime, end: datetime, source: str, complete_clause: str) -> dict:
    """Read complete SPHERE collections, including legacy scalar WP error details."""
    rows = [dict(row) for row in conn.execute(text(f"""
        SELECT tc.collection_id, tc.host, tc.consumer_type, tc.consumer_key,
               signal.value->>'pid' AS pid,
               MAX(signal.value->>'wp') AS wp,
               MAX(signal.value->>'wp_type') AS wp_type,
               MAX(signal.value->>'job_name') AS job_name,
               MAX(signal.value->>'log_path') AS log_path,
               MIN(tc.collected_at) AS observed_at,
               signal.value->>'error_at_snapshot' AS error_at_snapshot,
               signal.value->>'latest_trace_error' AS latest_trace_error,
               signal.value->>'error_code' AS error_code,
               signal.value->>'error_program' AS error_program,
               signal.value->>'error_recency' AS error_recency,
               signal.value->>'latest_error_ts' AS latest_error_ts,
               COALESCE(signal.value->>'rabax', signal.value->>'rabax_tail_count') AS rabax,
               COALESCE(signal.value->>'rxmsg', signal.value->>'rxmsg_tail_count') AS rxmsg,
               MAX(NULLIF(signal.value->>'cpu_pct', '')::double precision) AS cpu_pct,
               MAX(NULLIF(signal.value->>'pss_gb', '')::double precision) AS pss_gb
          FROM {source} tc
          JOIN rundeck_collections c ON c.collection_id = tc.collection_id
          CROSS JOIN LATERAL jsonb_array_elements(
              CASE WHEN jsonb_typeof(tc.details->'wp_signals') = 'array'
                   THEN CASE WHEN jsonb_array_length(tc.details->'wp_signals') > 0
                             THEN tc.details->'wp_signals'
                             ELSE jsonb_build_array(tc.details) END
                   WHEN jsonb_typeof(tc.details) = 'object' THEN jsonb_build_array(tc.details)
                   ELSE '[]'::jsonb END
          ) AS signal(value)
         WHERE {complete_clause}
           AND COALESCE(c.finished_at, c.started_at) >= :start
           AND COALESCE(c.finished_at, c.started_at) < :end
           AND tc.collected_at >= :start AND tc.collected_at < :end
           AND tc.consumer_type IN ('JOB', 'PROGRAM', 'PROCESS')
           AND (
                NULLIF(signal.value->>'error_at_snapshot', '') IS NOT NULL
                OR NULLIF(signal.value->>'latest_trace_error', '') IS NOT NULL
                OR NULLIF(signal.value->>'error_code', '') IS NOT NULL
                OR COALESCE(signal.value->>'rabax', signal.value->>'rabax_tail_count', '0') ~ '^[0-9]*[1-9][0-9]*$'
                OR COALESCE(signal.value->>'rxmsg', signal.value->>'rxmsg_tail_count', '0') ~ '^[0-9]*[1-9][0-9]*$'
           )
         GROUP BY tc.collection_id, tc.host, tc.consumer_type, tc.consumer_key,
                  signal.value->>'pid', signal.value->>'error_at_snapshot',
                  signal.value->>'latest_trace_error', signal.value->>'error_code',
                  signal.value->>'error_program', signal.value->>'error_recency',
                  signal.value->>'latest_error_ts',
                  COALESCE(signal.value->>'rabax', signal.value->>'rabax_tail_count'),
                  COALESCE(signal.value->>'rxmsg', signal.value->>'rxmsg_tail_count')
         ORDER BY tc.host, tc.consumer_key
         LIMIT :max_groups
    """), {"start": start, "end": end, "max_groups": MAX_ERROR_GROUPS + 1}).mappings().all()]
    truncated = len(rows) > MAX_ERROR_GROUPS
    report = summarize_monthly_wp_errors(rows[:MAX_ERROR_GROUPS], start, end, truncated=truncated)
    # A zero error result is not authoritative when the retained source never
    # stored error-capable WP fields. Distinguish this case without a full scan
    # of every WP signal: EXISTS can short-circuit on the first matching row.
    if not rows:
        source_present = bool(conn.execute(text(f"""
            SELECT EXISTS (
                SELECT 1 FROM {source} tc
                JOIN rundeck_collections c ON c.collection_id = tc.collection_id
                WHERE {complete_clause}
                  AND COALESCE(c.finished_at, c.started_at) >= :start
                  AND COALESCE(c.finished_at, c.started_at) < :end
                  AND tc.collected_at >= :start AND tc.collected_at < :end
                  AND tc.consumer_type IN ('JOB', 'PROGRAM', 'PROCESS')
                  AND (
                    jsonb_typeof(tc.details->'wp_signals') = 'array'
                    OR tc.details ? 'error_code'
                    OR tc.details ? 'latest_trace_error'
                    OR tc.details ? 'error_at_snapshot'
                    OR tc.details ? 'rabax_tail_count'
                    OR tc.details ? 'rxmsg_tail_count'
                  )
                LIMIT 1
            )
        """), {"start": start, "end": end}).scalar())
        report["error_fields_retained"] = source_present
        if not source_present:
            report["status"] = "ERROR_SOURCE_NOT_RETAINED"
    else:
        report["error_fields_retained"] = True
    return report

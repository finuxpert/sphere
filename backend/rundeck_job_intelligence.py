"""SAP background-job intelligence for SPHERE.

This module intentionally separates authoritative SAP job execution data from sampled
work-process observations. An SM37 execution is only reported as MATCHED when an
execution record has been ingested into ``sap_job_executions``. Workload observations
remain correlation/supporting evidence and are never promoted to an authoritative
SM37 result by inference alone.
"""
from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from sqlalchemy import text

from backend.db.session import get_engine

TERMINAL_OK = {"FINISHED", "COMPLETED", "SUCCESS"}
TERMINAL_BAD = {"CANCELED", "CANCELLED", "ABORTED", "FAILED", "ERROR"}
ACTIVE_STATES = {"ACTIVE", "RUNNING"}


def _engine():
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")
    return engine


def _table_exists(conn, name: str) -> bool:
    return bool(conn.execute(text("SELECT to_regclass(:name) IS NOT NULL"), {"name": f"public.{name}"}).scalar())


def _aware(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def _iso(value: Any) -> str | None:
    parsed = _aware(value)
    return parsed.isoformat() if parsed else None


def _number(value: Any, digits: int = 1) -> float | None:
    try:
        if value is None:
            return None
        return round(float(value), digits)
    except (TypeError, ValueError):
        return None


def _duration(started_at: Any, ended_at: Any, stored: Any = None) -> int | None:
    try:
        if stored is not None:
            return max(0, int(stored))
    except (TypeError, ValueError):
        pass
    start = _aware(started_at)
    end = _aware(ended_at)
    if not start or not end or end < start:
        return None
    return max(0, int((end - start).total_seconds()))


def _execution_view(row: dict) -> dict:
    result = dict(row)
    result["status"] = str(result.get("status") or "UNKNOWN").upper()
    result["started_at"] = _iso(result.get("started_at"))
    result["ended_at"] = _iso(result.get("ended_at"))
    result["imported_at"] = _iso(result.get("imported_at"))
    result["duration_seconds"] = _duration(result.get("started_at"), result.get("ended_at"), result.get("duration_seconds"))
    result["step_no"] = int(result.get("step_no") or 1)
    return result


def sm37_source_status() -> dict:
    engine = _engine()
    with engine.connect() as conn:
        if not _table_exists(conn, "sap_job_executions"):
            return {
                "status": "MIGRATION_REQUIRED",
                "authoritative": False,
                "rows": 0,
                "latest_started_at": None,
                "latest_imported_at": None,
            }
        row = conn.execute(text("""
            SELECT COUNT(*) AS rows,
                   MAX(started_at) AS latest_started_at,
                   MAX(imported_at) AS latest_imported_at
              FROM sap_job_executions
        """)).mappings().one()
    count = int(row.get("rows") or 0)
    return {
        "status": "READY" if count else "NOT_CONFIGURED",
        "authoritative": bool(count),
        "rows": count,
        "latest_started_at": _iso(row.get("latest_started_at")),
        "latest_imported_at": _iso(row.get("latest_imported_at")),
    }


def import_job_executions(records: Iterable[dict], source: str = "SM37") -> dict:
    rows = list(records or [])
    if not rows:
        return {"imported": 0, "source": source, **sm37_source_status()}
    engine = _engine()
    imported = 0
    with engine.begin() as conn:
        if not _table_exists(conn, "sap_job_executions"):
            raise RuntimeError("sap_job_executions migration is required")
        statement = text("""
            INSERT INTO sap_job_executions (
                source, client, job_name, job_count, step_no, program, variant,
                status, scheduled_by, server, started_at, ended_at,
                duration_seconds, imported_at, details
            ) VALUES (
                :source, :client, :job_name, :job_count, :step_no, :program, :variant,
                :status, :scheduled_by, :server, :started_at, :ended_at,
                :duration_seconds, now(), CAST(:details AS jsonb)
            )
            ON CONFLICT (source, job_name, job_count, step_no)
            DO UPDATE SET
                client = EXCLUDED.client,
                program = EXCLUDED.program,
                variant = EXCLUDED.variant,
                status = EXCLUDED.status,
                scheduled_by = EXCLUDED.scheduled_by,
                server = EXCLUDED.server,
                started_at = EXCLUDED.started_at,
                ended_at = EXCLUDED.ended_at,
                duration_seconds = EXCLUDED.duration_seconds,
                imported_at = now(),
                details = EXCLUDED.details
        """)
        for raw in rows:
            job_name = str(raw.get("job_name") or raw.get("job") or "").strip()
            started_at = _aware(raw.get("started_at") or raw.get("start_time"))
            if not job_name or not started_at:
                continue
            ended_at = _aware(raw.get("ended_at") or raw.get("end_time"))
            params = {
                "source": str(raw.get("source") or source or "SM37").upper(),
                "client": str(raw.get("client") or "").strip() or None,
                "job_name": job_name,
                "job_count": str(raw.get("job_count") or raw.get("job_id") or "").strip(),
                "step_no": max(1, int(raw.get("step_no") or raw.get("step") or 1)),
                "program": str(raw.get("program") or raw.get("report") or "").strip() or None,
                "variant": str(raw.get("variant") or "").strip() or None,
                "status": str(raw.get("status") or "UNKNOWN").upper(),
                "scheduled_by": str(raw.get("scheduled_by") or raw.get("user") or "").strip() or None,
                "server": str(raw.get("server") or raw.get("host") or "").strip().upper() or None,
                "started_at": started_at,
                "ended_at": ended_at,
                "duration_seconds": _duration(started_at, ended_at, raw.get("duration_seconds")),
                "details": json.dumps(raw.get("details") or {}),
            }
            conn.execute(statement, params)
            imported += 1
    return {"imported": imported, "source": source, **sm37_source_status()}


def job_executions(
    query: str | None = None,
    *,
    status: str | None = None,
    days: int = 7,
    limit: int = 200,
) -> dict:
    safe_days = max(1, min(90, int(days)))
    safe_limit = max(1, min(1000, int(limit)))
    q = str(query or "").strip()
    status_key = str(status or "").strip().upper()
    engine = _engine()
    with engine.connect() as conn:
        if not _table_exists(conn, "sap_job_executions"):
            return {"source": sm37_source_status(), "items": []}
        clauses = ["started_at >= now() - (:days * interval '1 day')"]
        params: dict[str, Any] = {"days": safe_days, "limit": safe_limit}
        if q:
            clauses.append("(job_name ILIKE :q OR COALESCE(program, '') ILIKE :q OR COALESCE(variant, '') ILIKE :q)")
            params["q"] = f"%{q}%"
        if status_key:
            clauses.append("status = :status")
            params["status"] = status_key
        rows = conn.execute(text(f"""
            SELECT id, source, client, job_name, job_count, step_no, program, variant,
                   status, scheduled_by, server, started_at, ended_at,
                   duration_seconds, imported_at, details
              FROM sap_job_executions
             WHERE {' AND '.join(clauses)}
             ORDER BY started_at DESC, job_name, step_no
             LIMIT :limit
        """), params).mappings().all()
    return {"source": sm37_source_status(), "query": q, "days": safe_days, "items": [_execution_view(row) for row in rows]}


def verify_workload(
    job_name: str,
    *,
    program: str | None = None,
    host: str | None = None,
    observed_at: str | datetime | None = None,
    window_minutes: int = 30,
) -> dict:
    job = str(job_name or "").strip()
    prog = str(program or "").strip()
    host_key = str(host or "").strip().upper()
    observed = _aware(observed_at)
    if not job:
        raise ValueError("job_name is required")
    source = sm37_source_status()
    if not source.get("authoritative"):
        return {"verification": "NOT_VERIFIED", "reason": "SM37 execution feed is not configured", "source": source, "match": None}

    engine = _engine()
    with engine.connect() as conn:
        params: dict[str, Any] = {"job": job, "program": prog, "limit": 50}
        time_clause = ""
        if observed:
            params["from_time"] = observed - timedelta(minutes=max(1, window_minutes))
            params["to_time"] = observed + timedelta(minutes=max(1, window_minutes))
            time_clause = "AND started_at <= :to_time AND COALESCE(ended_at, started_at + interval '1 hour') >= :from_time"
        rows = conn.execute(text(f"""
            SELECT id, source, client, job_name, job_count, step_no, program, variant,
                   status, scheduled_by, server, started_at, ended_at,
                   duration_seconds, imported_at, details
              FROM sap_job_executions
             WHERE (UPPER(job_name) = UPPER(:job)
                    OR (:program <> '' AND UPPER(COALESCE(program,'')) = UPPER(:program)))
               {time_clause}
             ORDER BY started_at DESC
             LIMIT :limit
        """), params).mappings().all()

    scored: list[tuple[int, dict, list[str]]] = []
    for raw in rows:
        row = _execution_view(raw)
        score = 0
        evidence: list[str] = []
        if str(row.get("job_name") or "").upper() == job.upper():
            score += 60
            evidence.append("Job Name")
        if prog and str(row.get("program") or "").upper() == prog.upper():
            score += 20
            evidence.append("Step Program")
        if host_key and str(row.get("server") or "").upper().endswith(host_key):
            score += 10
            evidence.append("Server")
        if observed:
            start = _aware(row.get("started_at"))
            end = _aware(row.get("ended_at")) or (start + timedelta(hours=1) if start else None)
            if start and end and start - timedelta(minutes=5) <= observed <= end + timedelta(minutes=5):
                score += 10
                evidence.append("Execution Time")
        scored.append((score, row, evidence))

    if not scored:
        return {"verification": "NOT_FOUND", "reason": "No authoritative SM37 execution matched the requested context", "source": source, "match": None}
    score, match, evidence = max(scored, key=lambda item: (item[0], item[1].get("started_at") or ""))
    state = "MATCHED" if score >= 80 else "PARTIAL_MATCH" if score >= 60 else "NOT_FOUND"
    return {
        "verification": state,
        "score": score,
        "evidence": evidence,
        "source": source,
        "match": match if state != "NOT_FOUND" else None,
        "note": "Verification is an execution identity/time correlation, not a root-cause conclusion.",
    }


def _performance_for_execution(conn, execution: dict) -> dict:
    if not _table_exists(conn, "rundeck_workload_observations"):
        return {}
    start = _aware(execution.get("started_at"))
    end = _aware(execution.get("ended_at")) or (start + timedelta(hours=1) if start else None)
    if not start or not end:
        return {}
    job = execution.get("job_name") or ""
    program = execution.get("program") or ""
    server = str(execution.get("server") or "").upper()
    row = conn.execute(text("""
        SELECT COUNT(*) AS samples,
               AVG(w.cpu_pct) AS avg_cpu_pct,
               MAX(w.cpu_pct) AS peak_cpu_pct,
               AVG(NULLIF(COALESCE(w.details->>'total_pss_gb', w.details->>'pss_gb'),'')::double precision) AS avg_pss_gb,
               MAX(NULLIF(COALESCE(w.details->>'total_pss_gb', w.details->>'pss_gb'),'')::double precision) AS peak_pss_gb,
               MAX(COALESCE(h.wp_critical,0)) AS max_critical_wp,
               COUNT(DISTINCT w.collection_id) FILTER (WHERE COALESCE(h.wp_critical,0) > 0) AS critical_wp_overlap_samples
          FROM rundeck_workload_observations w
          LEFT JOIN rundeck_host_metrics h
            ON h.collection_id = w.collection_id AND h.host = w.host
         WHERE w.collected_at BETWEEN :start AND :end
           AND (UPPER(w.consumer_key) = UPPER(:job)
                OR (:program <> '' AND UPPER(COALESCE(w.details->>'program','')) = UPPER(:program)))
           AND (:server = '' OR UPPER(w.host) = :server OR UPPER(w.host) LIKE '%' || :server)
    """), {"start": start, "end": end, "job": job, "program": program, "server": server}).mappings().one()
    return {
        "samples": int(row.get("samples") or 0),
        "avg_cpu_pct": _number(row.get("avg_cpu_pct"), 1),
        "peak_cpu_pct": _number(row.get("peak_cpu_pct"), 1),
        "avg_pss_gb": _number(row.get("avg_pss_gb"), 2),
        "peak_pss_gb": _number(row.get("peak_pss_gb"), 2),
        "max_critical_wp": int(row.get("max_critical_wp") or 0),
        "critical_wp_overlap_samples": int(row.get("critical_wp_overlap_samples") or 0),
    }


def job_monitor(days: int = 1, limit: int = 200) -> dict:
    result = job_executions(days=days, limit=limit)
    executions = result.get("items") or []
    if not executions:
        return {**result, "summary": {"executions": 0, "active": 0, "failed": 0, "long_running": 0}, "review": []}

    completed_durations = [row.get("duration_seconds") for row in executions if row.get("duration_seconds") is not None and row.get("status") in TERMINAL_OK]
    sorted_duration = sorted(completed_durations)
    p90 = sorted_duration[min(len(sorted_duration) - 1, max(0, int(len(sorted_duration) * .9)))] if sorted_duration else 3600
    long_threshold = max(1800, int(p90 or 0))
    frequency = Counter(row.get("job_name") for row in executions)

    review = []
    engine = _engine()
    with engine.connect() as conn:
        for row in executions:
            status = row.get("status") or "UNKNOWN"
            duration = row.get("duration_seconds")
            signals = []
            severity = "INFO"
            if status in TERMINAL_BAD:
                signals.append(f"Job status {status}")
                severity = "CRITICAL"
            elif status in ACTIVE_STATES and duration is not None and duration >= long_threshold:
                signals.append("Long running active job")
                severity = "ATTENTION"
            elif duration is not None and duration >= long_threshold:
                signals.append("Duration above recent long-running threshold")
                severity = "ATTENTION"
            if frequency.get(row.get("job_name"), 0) >= 10:
                signals.append("High execution frequency")
                severity = "ATTENTION" if severity == "INFO" else severity
            performance = _performance_for_execution(conn, row)
            if (performance.get("peak_cpu_pct") or 0) >= 90:
                signals.append("High CPU observed during execution")
                severity = "ATTENTION" if severity == "INFO" else severity
            if (performance.get("max_critical_wp") or 0) > 0:
                signals.append("Critical WP overlap observed")
                severity = "ATTENTION" if severity == "INFO" else severity
            if signals:
                review.append({"severity": severity, "signals": signals, "execution": row, "performance": performance})
    order = {"CRITICAL": 0, "ATTENTION": 1, "INFO": 2}
    review.sort(key=lambda item: (order.get(item["severity"], 9), item["execution"].get("started_at") or ""), reverse=False)
    return {
        **result,
        "summary": {
            "executions": len(executions),
            "active": sum(1 for row in executions if row.get("status") in ACTIVE_STATES),
            "failed": sum(1 for row in executions if row.get("status") in TERMINAL_BAD),
            "long_running": sum(1 for item in review if any("Long running" in signal or "Duration above" in signal for signal in item["signals"])),
            "long_threshold_seconds": long_threshold,
        },
        "review": review[:100],
        "note": "Review signals prioritize investigation; they do not identify root cause automatically.",
    }


def workload_execution_analytics(job_name: str, *, program: str | None = None, days: int = 7) -> dict:
    safe_days = max(1, min(90, int(days)))
    executions = job_executions(job_name, days=safe_days, limit=1000).get("items") or []
    if program:
        program_key = program.upper()
        executions = [row for row in executions if str(row.get("program") or "").upper() == program_key or str(row.get("job_name") or "").upper() == job_name.upper()]
    durations = [row.get("duration_seconds") for row in executions if row.get("duration_seconds") is not None]
    statuses = Counter(row.get("status") for row in executions)
    success = sum(statuses[state] for state in TERMINAL_OK)
    bad = sum(statuses[state] for state in TERMINAL_BAD)
    return {
        "job_name": job_name,
        "program": program,
        "days": safe_days,
        "source": sm37_source_status(),
        "execution_count": len(executions),
        "success_count": success,
        "failed_count": bad,
        "success_rate_pct": round(success / len(executions) * 100, 1) if executions else None,
        "avg_duration_seconds": round(sum(durations) / len(durations)) if durations else None,
        "max_duration_seconds": max(durations) if durations else None,
        "statuses": dict(statuses),
        "servers": dict(Counter(row.get("server") or "UNKNOWN" for row in executions)),
    }


def workload_baseline(job_name: str, *, program: str | None = None, current_hours: int = 24, baseline_days: int = 7) -> dict:
    engine = _engine()
    now = datetime.now(timezone.utc)
    current_start = now - timedelta(hours=max(1, current_hours))
    baseline_start = current_start - timedelta(days=max(1, baseline_days))
    key = str(job_name or "").strip()
    prog = str(program or "").strip()
    if not key:
        raise ValueError("job_name is required")
    with engine.connect() as conn:
        if not _table_exists(conn, "rundeck_workload_observations"):
            return {"job_name": key, "program": prog or None, "signals": [], "status": "NOT_AVAILABLE"}
        def stats(start: datetime, end: datetime) -> dict:
            row = conn.execute(text("""
                SELECT COUNT(*) AS samples,
                       AVG(cpu_pct) AS avg_cpu_pct,
                       MAX(cpu_pct) AS peak_cpu_pct,
                       AVG(NULLIF(COALESCE(details->>'total_pss_gb', details->>'pss_gb'),'')::double precision) AS avg_pss_gb,
                       MAX(NULLIF(COALESCE(details->>'total_pss_gb', details->>'pss_gb'),'')::double precision) AS peak_pss_gb
                  FROM rundeck_workload_observations
                 WHERE collected_at >= :start AND collected_at < :end
                   AND (UPPER(consumer_key) = UPPER(:job)
                        OR (:program <> '' AND UPPER(COALESCE(details->>'program','')) = UPPER(:program)))
            """), {"start": start, "end": end, "job": key, "program": prog}).mappings().one()
            return {
                "samples": int(row.get("samples") or 0),
                "avg_cpu_pct": _number(row.get("avg_cpu_pct"), 1),
                "peak_cpu_pct": _number(row.get("peak_cpu_pct"), 1),
                "avg_pss_gb": _number(row.get("avg_pss_gb"), 2),
                "peak_pss_gb": _number(row.get("peak_pss_gb"), 2),
            }
        current = stats(current_start, now)
        baseline = stats(baseline_start, current_start)

    signals = []
    for field, label in (("avg_cpu_pct", "Average CPU"), ("peak_cpu_pct", "Peak CPU"), ("avg_pss_gb", "Average PSS"), ("peak_pss_gb", "Peak PSS")):
        current_value = current.get(field)
        baseline_value = baseline.get(field)
        if current_value is None or baseline_value is None or baseline_value <= 0:
            continue
        ratio = current_value / baseline_value
        if ratio >= 1.5:
            signals.append({"metric": field, "label": label, "ratio": round(ratio, 2), "current": current_value, "baseline": baseline_value, "severity": "ATTENTION" if ratio < 2 else "WARNING"})
    return {
        "job_name": key,
        "program": prog or None,
        "status": "REVIEW" if signals else "NORMAL",
        "current_window": {"start": current_start.isoformat(), "end": now.isoformat(), **current},
        "baseline_window": {"start": baseline_start.isoformat(), "end": current_start.isoformat(), **baseline},
        "signals": signals,
        "note": "Baseline signals compare retained observations and require Basis validation.",
    }


def correlation_timeline(job_name: str, *, program: str | None = None, days: int = 1, limit: int = 200) -> dict:
    engine = _engine()
    since = datetime.now(timezone.utc) - timedelta(days=max(1, min(30, int(days))))
    key = str(job_name or "").strip()
    prog = str(program or "").strip()
    events: list[dict] = []
    with engine.connect() as conn:
        if _table_exists(conn, "sap_job_executions"):
            rows = conn.execute(text("""
                SELECT job_name, program, status, server, started_at, ended_at, duration_seconds, job_count
                  FROM sap_job_executions
                 WHERE started_at >= :since
                   AND (UPPER(job_name) = UPPER(:job)
                        OR (:program <> '' AND UPPER(COALESCE(program,'')) = UPPER(:program)))
                 ORDER BY started_at DESC
                 LIMIT :limit
            """), {"since": since, "job": key, "program": prog, "limit": limit}).mappings().all()
            for row in rows:
                view = _execution_view(row)
                events.append({"at": view["started_at"], "type": "JOB_START", "label": f"{view['job_name']} started", "context": view})
                if view.get("ended_at"):
                    events.append({"at": view["ended_at"], "type": "JOB_END", "label": f"{view['job_name']} {view['status'].lower()}", "context": view})
        if _table_exists(conn, "rundeck_workload_observations"):
            rows = conn.execute(text("""
                SELECT w.collected_at, w.host, w.consumer_key, w.cpu_pct,
                       COALESCE(h.wp_critical,0) AS wp_critical,
                       w.details
                  FROM rundeck_workload_observations w
                  LEFT JOIN rundeck_host_metrics h
                    ON h.collection_id = w.collection_id AND h.host = w.host
                 WHERE w.collected_at >= :since
                   AND (UPPER(w.consumer_key) = UPPER(:job)
                        OR (:program <> '' AND UPPER(COALESCE(w.details->>'program','')) = UPPER(:program)))
                 ORDER BY w.collected_at DESC
                 LIMIT :limit
            """), {"since": since, "job": key, "program": prog, "limit": limit}).mappings().all()
            for row in rows:
                events.append({
                    "at": _iso(row.get("collected_at")),
                    "type": "WORKLOAD_OBSERVED",
                    "label": f"{row.get('consumer_key')} observed on {row.get('host')}",
                    "context": {
                        "host": row.get("host"),
                        "cpu_pct": _number(row.get("cpu_pct"), 1),
                        "critical_wp": int(row.get("wp_critical") or 0),
                        "program": (row.get("details") or {}).get("program"),
                    },
                })
    events = [event for event in events if event.get("at")]
    events.sort(key=lambda event: event["at"])
    return {
        "job_name": key,
        "program": prog or None,
        "since": since.isoformat(),
        "events": events[-limit:],
        "correlation_mode": "supporting-evidence",
        "note": "Temporal alignment narrows investigation; it does not prove causation.",
    }


def review_queue(days: int = 1, limit: int = 100) -> dict:
    monitor = job_monitor(days=days, limit=max(limit, 200))
    items = []
    for item in monitor.get("review") or []:
        execution = item.get("execution") or {}
        items.append({
            "source": "SM37_JOB" if monitor.get("source", {}).get("authoritative") else "WORKLOAD_CONTEXT",
            "severity": item.get("severity"),
            "key": f"{execution.get('job_name')}:{execution.get('job_count')}:{execution.get('step_no')}",
            "job_name": execution.get("job_name"),
            "program": execution.get("program"),
            "server": execution.get("server"),
            "started_at": execution.get("started_at"),
            "status": execution.get("status"),
            "signals": item.get("signals") or [],
            "performance": item.get("performance") or {},
        })
    return {"days": days, "items": items[:limit], "summary": monitor.get("summary"), "source": monitor.get("source"), "note": monitor.get("note")}


def investigation_report(job_name: str, *, program: str | None = None, host: str | None = None, observed_at: str | None = None, days: int = 7) -> dict:
    verification = verify_workload(job_name, program=program, host=host, observed_at=observed_at)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "report_type": "SPHERE_JOB_INVESTIGATION",
        "workload": {"job_name": job_name, "program": program, "host": host, "observed_at": observed_at},
        "verification": verification,
        "execution_analytics": workload_execution_analytics(job_name, program=program, days=days),
        "baseline": workload_baseline(job_name, program=program),
        "timeline": correlation_timeline(job_name, program=program, days=min(days, 30), limit=300),
        "conclusion": "SPHERE provides correlation and supporting evidence. Root-cause validation remains a Basis investigation step.",
    }


def platform_readiness() -> dict:
    engine = _engine()
    with engine.connect() as conn:
        tables = {}
        for name in ("rundeck_collections", "rundeck_host_metrics", "rundeck_workload_observations", "sap_job_executions"):
            exists = _table_exists(conn, name)
            count = int(conn.execute(text(f"SELECT COUNT(*) FROM {name}")).scalar() or 0) if exists else 0
            tables[name] = {"exists": exists, "rows": count}
        latest_workload = conn.execute(text("SELECT MAX(collected_at) FROM rundeck_workload_observations" )).scalar() if tables["rundeck_workload_observations"]["exists"] else None
        latest_sm37 = conn.execute(text("SELECT MAX(imported_at) FROM sap_job_executions")).scalar() if tables["sap_job_executions"]["exists"] else None
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "tables": tables,
        "latest_workload_at": _iso(latest_workload),
        "latest_sm37_import_at": _iso(latest_sm37),
        "features": {
            "workload_history": "READY" if tables["rundeck_workload_observations"]["rows"] else "NOT_READY",
            "sm37_verification": "READY" if tables["sap_job_executions"]["rows"] else "NOT_CONFIGURED",
            "job_monitor": "READY" if tables["sap_job_executions"]["rows"] else "WAITING_FOR_SM37_FEED",
            "baseline": "READY" if tables["rundeck_workload_observations"]["rows"] else "NOT_READY",
            "correlation": "READY" if tables["rundeck_workload_observations"]["rows"] else "NOT_READY",
        },
    }

"""Deterministic SAP workload evaluation for Basis and Infrastructure teams.

SPHERE evaluates normalized PROGRAM and JOB observations. Results are investigation
signals, not root-cause declarations. v1.20 adds workload-specific historical
baselines, anomaly context and recent performance-shift detection while preserving
backward-compatible assessment fields used by existing clients.
"""
from __future__ import annotations

import os
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from statistics import median
from threading import Lock
from typing import Any

from sqlalchemy import text

from backend.db.session import get_engine
from backend.rundeck_consumers import TOP_CONSUMERS_PER_HOST
from backend.rundeck_monthly_pressure import monthly_pressure_observations
from backend.rundeck_monthly_errors import monthly_error_evidence

PERIOD_DAYS = {"1d": 1, "7d": 7, "30d": 30}
CPU_HIGH_AVG = float(os.getenv("SPHERE_EVAL_CPU_HIGH_AVG_PCT", "70"))
CPU_HIGH_PEAK = float(os.getenv("SPHERE_EVAL_CPU_HIGH_PEAK_PCT", "100"))
PSS_HIGH_GB = float(os.getenv("SPHERE_EVAL_PSS_HIGH_GB", "4"))
INCREASE_PCT = float(os.getenv("SPHERE_EVAL_INCREASE_PCT", "25"))
RECURRING_PCT = float(os.getenv("SPHERE_EVAL_RECURRING_PCT", "30"))
WP_CORRELATION_PCT = float(os.getenv("SPHERE_EVAL_WP_CORRELATION_PCT", "30"))
WP_EXCESS_ASSOCIATION_PCT = float(os.getenv("SPHERE_EVAL_WP_EXCESS_ASSOCIATION_PCT", "20"))
MIN_BASELINE_OCCURRENCES = max(2, int(os.getenv("SPHERE_EVAL_MIN_BASELINE_OCCURRENCES", "5")))
CONFIDENCE_MEDIUM_OCCURRENCES = max(2, int(os.getenv("SPHERE_EVAL_CONFIDENCE_MEDIUM_OCCURRENCES", "4")))
CONFIDENCE_HIGH_OCCURRENCES = max(CONFIDENCE_MEDIUM_OCCURRENCES, int(os.getenv("SPHERE_EVAL_CONFIDENCE_HIGH_OCCURRENCES", "20")))
HISTORICAL_BASELINE_DAYS = max(7, int(os.getenv("SPHERE_EVAL_BASELINE_DAYS", "30")))
HISTORICAL_BASELINE_MIN_OBSERVATIONS = max(5, int(os.getenv("SPHERE_EVAL_BASELINE_MIN_OBSERVATIONS", "20")))
BASELINE_DEVIATION_PCT = max(0.0, float(os.getenv("SPHERE_EVAL_BASELINE_DEVIATION_PCT", "25")))
BASELINE_CPU_MIN_DELTA_PP = max(0.0, float(os.getenv("SPHERE_EVAL_BASELINE_CPU_MIN_DELTA_PP", "15")))
BASELINE_PSS_MIN_DELTA_GB = max(0.0, float(os.getenv("SPHERE_EVAL_BASELINE_PSS_MIN_DELTA_GB", "0.5")))
SHIFT_RECENT_HOURS = max(1, int(os.getenv("SPHERE_EVAL_SHIFT_RECENT_HOURS", "6")))
SHIFT_MIN_OBSERVATIONS = max(2, int(os.getenv("SPHERE_EVAL_SHIFT_MIN_OBSERVATIONS", "3")))
SHIFT_INCREASE_PCT = max(0.0, float(os.getenv("SPHERE_EVAL_SHIFT_INCREASE_PCT", "50")))
SHIFT_CPU_MIN_DELTA_PP = max(0.0, float(os.getenv("SPHERE_EVAL_SHIFT_CPU_MIN_DELTA_PP", "20")))
_CONFIDENCE_RANK = {"LOW": 1, "MEDIUM": 2, "HIGH": 3}
EVALUATION_CACHE_TTL_SECONDS = max(5, int(os.getenv("SPHERE_EVAL_CACHE_TTL_SECONDS", "900")))
EVALUATION_CACHE_MAX_ENTRIES = max(6, int(os.getenv("SPHERE_EVAL_CACHE_MAX_ENTRIES", "24")))
_EVALUATION_CACHE: dict[tuple[str, str, str], tuple[float, dict]] = {}
# Prevent simultaneous paginated requests from executing the same expensive cold SQL.
# FastAPI runs this synchronous endpoint in a worker thread; lock scope is process-local.
_EVALUATION_COMPUTE_LOCK = Lock()


def _cache_get(key: tuple[str, str, str]) -> dict | None:
    now = time.monotonic()
    cached = _EVALUATION_CACHE.get(key)
    if not cached:
        return None
    stored_at, payload = cached
    if now - stored_at > EVALUATION_CACHE_TTL_SECONDS:
        _EVALUATION_CACHE.pop(key, None)
        return None
    # Refresh recency without discarding the other period/type entries.
    _EVALUATION_CACHE.pop(key, None)
    _EVALUATION_CACHE[key] = (stored_at, payload)
    return payload


def _cache_put(key: tuple[str, str, str], payload: dict) -> None:
    now = time.monotonic()
    stale = [
        cache_key for cache_key, (stored_at, _payload) in _EVALUATION_CACHE.items()
        if now - stored_at > EVALUATION_CACHE_TTL_SECONDS
    ]
    for cache_key in stale:
        _EVALUATION_CACHE.pop(cache_key, None)

    _EVALUATION_CACHE.pop(key, None)
    _EVALUATION_CACHE[key] = (now, payload)
    while len(_EVALUATION_CACHE) > EVALUATION_CACHE_MAX_ENTRIES:
        oldest_key = next(iter(_EVALUATION_CACHE))
        _EVALUATION_CACHE.pop(oldest_key, None)


def _runtime_payload(payload: dict, *, cache: str, duration_ms: float) -> dict:
    return {
        **payload,
        "runtime": {
            "cache": cache,
            "duration_ms": round(max(0.0, duration_ms), 1),
            "cache_entries": len(_EVALUATION_CACHE),
        },
    }


def _number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _round(value: Any, digits: int = 1) -> float | None:
    number = _number(value)
    return round(number, digits) if number is not None else None


def _change_pct(current: Any, previous: Any) -> float | None:
    current_value = _number(current)
    previous_value = _number(previous)
    if current_value is None or previous_value is None or previous_value <= 0:
        return None
    return round((current_value - previous_value) / previous_value * 100.0, 1)


def _observation_confidence(occurrences: int) -> str:
    if occurrences >= CONFIDENCE_HIGH_OCCURRENCES:
        return "HIGH"
    if occurrences >= CONFIDENCE_MEDIUM_OCCURRENCES:
        return "MEDIUM"
    return "LOW"


def _cap_confidence(value: str, period_confidence: str) -> str:
    value_rank = _CONFIDENCE_RANK.get(value, 1)
    period_rank = _CONFIDENCE_RANK.get(period_confidence, 1)
    target = min(value_rank, period_rank)
    return next((name for name, rank in _CONFIDENCE_RANK.items() if rank == target), "LOW")


def _baseline_deviation(current: float | None, p95: float | None, *, min_delta: float) -> tuple[bool, float | None]:
    if current is None or p95 is None or p95 <= 0:
        return False, None
    deviation_pct = round((current - p95) / p95 * 100.0, 1)
    above = current - p95 >= min_delta and deviation_pct >= BASELINE_DEVIATION_PCT
    return above, deviation_pct


def _operational_status(
    *,
    sustained_high_cpu: bool,
    high_memory: bool,
    cpu_spike: bool,
    increasing: bool,
    recurring: bool,
    enough_window_evidence: bool,
    review_required: bool,
) -> str:
    if review_required:
        return "REVIEW REQUIRED"
    if sustained_high_cpu:
        return "HIGH CPU"
    if high_memory:
        return "HIGH MEMORY"
    if cpu_spike:
        return "CPU SPIKE"
    if increasing:
        return "INCREASING CPU"
    if recurring:
        return "RECURRING"
    if not enough_window_evidence:
        return "INSUFFICIENT DATA"
    return "NORMAL"


def assess_workload(
    current: dict,
    previous: dict | None,
    total_checks: int,
    *,
    baseline_eligible: bool = True,
    period_confidence: str = "HIGH",
    previous_period_confidence: str = "HIGH",
) -> dict:
    """Return deterministic review classification and separated confidence signals."""
    previous = previous or {}
    occurrences = int(current.get("occurrences") or 0)
    host_observations = int(current.get("host_observations") or occurrences)
    wp_host_checks = int(current.get("critical_wp_host_checks") or current.get("critical_wp_checks") or 0)
    avg_cpu = _number(current.get("avg_cpu_pct"))
    peak_cpu = _number(current.get("peak_cpu_pct"))
    avg_pss = _number(current.get("avg_pss_gb"))
    app_wp_baseline = _number(current.get("app_wp_baseline_pct"))
    baseline = current.get("historical_baseline") or {}
    baseline_observations = int(baseline.get("observations") or 0)
    baseline_cpu_p95 = _number(baseline.get("cpu_p95_pct"))
    baseline_pss_p95 = _number(baseline.get("pss_p95_gb"))
    baseline_ready = baseline_observations >= HISTORICAL_BASELINE_MIN_OBSERVATIONS

    observation_confidence = _observation_confidence(occurrences)
    overall_confidence = _cap_confidence(observation_confidence, period_confidence)
    trend_confidence = previous_period_confidence if baseline_eligible else "NOT_READY"
    change = _change_pct(avg_cpu, previous.get("avg_cpu_pct")) if baseline_eligible else None
    recurring_rate = round(occurrences / total_checks * 100.0, 1) if total_checks else 0.0
    wp_rate = round(wp_host_checks / host_observations * 100.0, 1) if host_observations else 0.0
    wp_excess = round(wp_rate - app_wp_baseline, 1) if app_wp_baseline is not None else None

    cpu_above_baseline, cpu_baseline_deviation_pct = _baseline_deviation(
        avg_cpu,
        baseline_cpu_p95 if baseline_ready else None,
        min_delta=BASELINE_CPU_MIN_DELTA_PP,
    )
    pss_above_baseline, pss_baseline_deviation_pct = _baseline_deviation(
        avg_pss,
        baseline_pss_p95 if baseline_ready else None,
        min_delta=BASELINE_PSS_MIN_DELTA_GB,
    )

    shift_previous = _number(current.get("shift_previous_avg_cpu_pct"))
    shift_recent = _number(current.get("shift_recent_avg_cpu_pct"))
    shift_previous_count = int(current.get("shift_previous_observations") or 0)
    shift_recent_count = int(current.get("shift_recent_observations") or 0)
    shift_change = _change_pct(shift_recent, shift_previous)
    performance_shift = bool(
        shift_change is not None
        and shift_previous_count >= SHIFT_MIN_OBSERVATIONS
        and shift_recent_count >= SHIFT_MIN_OBSERVATIONS
        and shift_recent is not None
        and shift_previous is not None
        and shift_recent - shift_previous >= SHIFT_CPU_MIN_DELTA_PP
        and shift_change >= SHIFT_INCREASE_PCT
    )

    sustained_high_cpu = bool((avg_cpu is not None and avg_cpu >= CPU_HIGH_AVG) or cpu_above_baseline)
    high_memory = bool((avg_pss is not None and avg_pss >= PSS_HIGH_GB) or pss_above_baseline)
    cpu_spike = bool(
        peak_cpu is not None
        and peak_cpu >= CPU_HIGH_PEAK
        and not sustained_high_cpu
        and (
            avg_cpu is None
            or peak_cpu - avg_cpu >= 40
            or (avg_cpu > 0 and peak_cpu >= avg_cpu * 1.75)
        )
    )
    high_resource = sustained_high_cpu or high_memory or cpu_spike
    increasing = bool((baseline_eligible and change is not None and change >= INCREASE_PCT) or performance_shift)
    recurring_signal = occurrences >= 3 and recurring_rate >= RECURRING_PCT
    wp_overlap_signal = host_observations >= 2 and wp_rate >= WP_CORRELATION_PCT
    wp_excess_signal = bool(
        wp_overlap_signal
        and wp_excess is not None
        and wp_excess >= WP_EXCESS_ASSOCIATION_PCT
    )
    enough_window_evidence = overall_confidence in {"MEDIUM", "HIGH"}
    recurring = recurring_signal and enough_window_evidence
    wp_associated = wp_excess_signal and enough_window_evidence
    baseline_anomaly = baseline_ready and (cpu_above_baseline or pss_above_baseline)
    review_required = bool(
        enough_window_evidence
        and (sustained_high_cpu or high_memory)
        and (increasing or wp_associated or baseline_anomaly)
    )

    # Backward-compatible assessment values are intentionally preserved.
    if review_required:
        assessment = "NEEDS REVIEW"
    elif high_resource:
        assessment = "HIGH RESOURCE"
    elif increasing:
        assessment = "INCREASING"
    elif recurring:
        assessment = "RECURRING"
    elif not enough_window_evidence:
        assessment = "LIMITED DATA"
    else:
        assessment = "STABLE"

    status = _operational_status(
        sustained_high_cpu=sustained_high_cpu,
        high_memory=high_memory,
        cpu_spike=cpu_spike,
        increasing=increasing,
        recurring=recurring,
        enough_window_evidence=enough_window_evidence,
        review_required=review_required,
    )

    reason_parts: list[str] = []
    if sustained_high_cpu:
        reason_parts.append("CPU usage is sustained above the review range" if not cpu_above_baseline else "CPU usage is above the workload historical baseline")
    if high_memory:
        reason_parts.append("memory usage is above the review range" if not pss_above_baseline else "memory usage is above the workload historical baseline")
    if cpu_spike:
        reason_parts.append("a CPU spike was observed without sustained high average CPU")
    if performance_shift:
        reason_parts.append("recent CPU usage is materially higher than the preceding six-hour window")
    elif baseline_eligible and change is not None and change >= INCREASE_PCT:
        reason_parts.append("CPU usage increased versus the previous equivalent period")
    if wp_associated:
        reason_parts.append("Critical WP overlap is materially above the APP baseline")
    if recurring and not (sustained_high_cpu or high_memory):
        reason_parts.append("the workload is repeatedly observed across collection checks")
    if not enough_window_evidence:
        reason_parts.append("data coverage is not yet sufficient for a stronger historical conclusion")
    reason = "; ".join(reason_parts) + "." if reason_parts else "No review threshold is currently met."

    baseline_status = "READY" if baseline_ready else ("BUILDING" if baseline_observations else "NOT_READY")
    anomaly_status = "ABOVE BASELINE" if baseline_anomaly else ("NORMAL RANGE" if baseline_ready else "NO BASELINE")

    return {
        "assessment": assessment,
        "status": status,
        "assessment_reason": reason,
        "observation_confidence": observation_confidence,
        "period_confidence": period_confidence,
        "overall_confidence": overall_confidence,
        "evidence_confidence": overall_confidence,
        "trend_confidence": trend_confidence,
        "trend_baseline_status": "READY" if baseline_eligible else "NOT_READY",
        "baseline_available": bool(baseline_eligible),
        "baseline_status": baseline_status,
        "anomaly_status": anomaly_status,
        "avg_cpu_change_pct": change,
        "recent_cpu_shift_pct": shift_change,
        "recurring_rate_pct": recurring_rate,
        "wp_signal_overlap_pct": wp_rate,
        "app_wp_baseline_pct": _round(app_wp_baseline),
        "wp_excess_association_pct": wp_excess,
        "critical_wp_correlation_pct": wp_rate,
        "cpu_baseline_deviation_pct": cpu_baseline_deviation_pct,
        "pss_baseline_deviation_pct": pss_baseline_deviation_pct,
        "resource_pattern": (
            "SUSTAINED_HIGH_CPU" if sustained_high_cpu else
            "HIGH_MEMORY" if high_memory else
            "CPU_SPIKE" if cpu_spike else
            "NORMAL"
        ),
        "signals": {
            "high_resource": high_resource,
            "sustained_high_cpu": sustained_high_cpu,
            "high_memory": high_memory,
            "cpu_spike": cpu_spike,
            "baseline_anomaly": baseline_anomaly,
            "performance_shift": performance_shift,
            "increasing": increasing,
            "recurring": recurring,
            "recurring_signal": recurring_signal,
            "critical_wp_correlated": wp_associated,
            "wp_signal_overlap": wp_overlap_signal,
            "wp_excess_association": wp_excess_signal,
        },
    }


def _workload_source_relation(conn) -> tuple[str, str]:
    """Prefer the full retained JOB/PROGRAM observation projection.

    Legacy Top Consumer rows are used only for collections that do not yet have
    matching workload observations, preserving older history without biasing
    newer evaluation toward only the hottest consumers.
    """
    observed = bool(conn.execute(text(
        "SELECT to_regclass('public.rundeck_workload_observations') IS NOT NULL"
    )).scalar())
    if not observed:
        return "rundeck_top_consumers", "TOP_CONSUMERS_ONLY"
    return """(
        SELECT wo.collection_id, wo.collected_at, wo.host, wo.consumer_type, wo.consumer_key,
               NULLIF(wo.details->>'performance_rank', '')::integer AS rank,
               wo.cpu_pct, wo.ram_pct, wo.details
          FROM rundeck_workload_observations wo
        UNION ALL
        SELECT tc.collection_id, tc.collected_at, tc.host, tc.consumer_type, tc.consumer_key,
               tc.rank, tc.cpu_pct, tc.ram_pct, tc.details
          FROM rundeck_top_consumers tc
         WHERE tc.consumer_type IN ('JOB', 'PROGRAM')
           AND NOT EXISTS (
               SELECT 1
                 FROM rundeck_workload_observations wo
                WHERE wo.collection_id = tc.collection_id
                  AND wo.host = tc.host
                  AND wo.collected_at = tc.collected_at
                  AND wo.consumer_type = tc.consumer_type
                  AND wo.consumer_key = tc.consumer_key
           )
    )""", "ALL_OBSERVED_ACTIVE_WORKLOADS"


def _complete_collection_clause(alias: str = "c") -> str:
    return (
        f"{alias}.status = 'READY' "
        f"AND {alias}.expected_host_count > 0 "
        f"AND {alias}.received_host_count >= {alias}.expected_host_count"
    )


def _aggregate_window(conn, start: datetime, end: datetime, consumer_type: str) -> list[dict]:
    source, _coverage_scope = _workload_source_relation(conn)
    type_clause = "AND tc.consumer_type = :consumer_type" if consumer_type in {"JOB", "PROGRAM"} else ""
    params: dict[str, Any] = {"start": start, "end": end}
    if type_clause:
        params["consumer_type"] = consumer_type

    rows = conn.execute(text(f"""
        WITH complete_collections AS (
          SELECT collection_id
            FROM rundeck_collections c
           WHERE {_complete_collection_clause('c')}
             AND COALESCE(c.finished_at, c.started_at) >= :start
             AND COALESCE(c.finished_at, c.started_at) < :end
        ),
        host_signal AS (
          SELECT hm.collection_id,
                 hm.host,
                 MAX(COALESCE(hm.wp_critical, 0)) AS wp_critical,
                 MAX(hm.cpu_pct) AS host_cpu_pct
            FROM rundeck_host_metrics hm
            JOIN complete_collections cc ON cc.collection_id = hm.collection_id
           GROUP BY hm.collection_id, hm.host
        ),
        host_baseline AS (
          SELECT host,
                 100.0 * COUNT(*) FILTER (WHERE COALESCE(wp_critical, 0) > 0)
                   / NULLIF(COUNT(*), 0) AS wp_active_pct
            FROM host_signal
           GROUP BY host
        )
        SELECT tc.consumer_type,
               tc.consumer_key,
               COUNT(DISTINCT tc.collection_id) AS occurrences,
               COUNT(*) AS observations,
               COUNT(DISTINCT (tc.collection_id, tc.host)) AS host_observations,
               AVG(tc.cpu_pct) AS avg_cpu_pct,
               MAX(tc.cpu_pct) AS peak_cpu_pct,
               AVG(NULLIF(COALESCE(tc.details->>'total_pss_gb', tc.details->>'pss_gb'), '')::double precision) AS avg_pss_gb,
               MAX(NULLIF(COALESCE(tc.details->>'total_pss_gb', tc.details->>'pss_gb'), '')::double precision) AS peak_pss_gb,
               AVG(NULLIF(tc.details->>'process_count', '')::double precision) AS avg_process_count,
               MAX(NULLIF(tc.details->>'process_count', '')::double precision) AS peak_process_count,
               AVG(hs.host_cpu_pct) AS avg_host_cpu_pct,
               MAX(hs.host_cpu_pct) AS peak_host_cpu_pct,
               COUNT(DISTINCT tc.host) AS app_count,
               ARRAY_AGG(DISTINCT tc.host ORDER BY tc.host) AS hosts,
               MIN(tc.collected_at) AS first_seen,
               MAX(tc.collected_at) AS last_seen,
               COUNT(DISTINCT CASE WHEN COALESCE(hs.wp_critical, 0) > 0 THEN tc.collection_id END) AS critical_wp_checks,
               COUNT(DISTINCT (tc.collection_id, tc.host)) FILTER (WHERE COALESCE(hs.wp_critical, 0) > 0) AS critical_wp_host_checks,
               AVG(hb.wp_active_pct) AS app_wp_baseline_pct,
               MAX(tc.rank) AS max_rank_seen,
               COUNT(*) FILTER (WHERE tc.details->>'resource_aggregation' = 'SUM_BY_CONSUMER') AS aggregate_resource_observations
          FROM {source} tc
          JOIN complete_collections cc ON cc.collection_id = tc.collection_id
          LEFT JOIN host_signal hs
            ON hs.collection_id = tc.collection_id AND hs.host = tc.host
          LEFT JOIN host_baseline hb ON hb.host = tc.host
         WHERE tc.collected_at >= :start
           AND tc.collected_at < :end
           AND tc.consumer_type IN ('JOB', 'PROGRAM')
           {type_clause}
         GROUP BY tc.consumer_type, tc.consumer_key
    """), params)
    return [dict(row._mapping) for row in rows]


def _historical_baseline(conn, end: datetime, consumer_type: str) -> list[dict]:
    source, _coverage_scope = _workload_source_relation(conn)
    start = end - timedelta(days=HISTORICAL_BASELINE_DAYS)
    type_clause = "AND tc.consumer_type = :consumer_type" if consumer_type in {"JOB", "PROGRAM"} else ""
    params: dict[str, Any] = {"start": start, "end": end}
    if type_clause:
        params["consumer_type"] = consumer_type
    rows = conn.execute(text(f"""
        WITH complete_collections AS (
          SELECT collection_id
            FROM rundeck_collections c
           WHERE {_complete_collection_clause('c')}
             AND COALESCE(c.finished_at, c.started_at) >= :start
             AND COALESCE(c.finished_at, c.started_at) < :end
        )
        SELECT tc.consumer_type,
               tc.consumer_key,
               COUNT(*) AS observations,
               COUNT(DISTINCT tc.collection_id) AS collection_checks,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY tc.cpu_pct) AS cpu_median_pct,
               percentile_cont(0.95) WITHIN GROUP (ORDER BY tc.cpu_pct) AS cpu_p95_pct,
               percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY NULLIF(COALESCE(tc.details->>'total_pss_gb', tc.details->>'pss_gb'), '')::double precision
               ) AS pss_median_gb,
               percentile_cont(0.95) WITHIN GROUP (
                 ORDER BY NULLIF(COALESCE(tc.details->>'total_pss_gb', tc.details->>'pss_gb'), '')::double precision
               ) AS pss_p95_gb,
               MIN(tc.collected_at) AS first_seen,
               MAX(tc.collected_at) AS last_seen
          FROM {source} tc
          JOIN complete_collections cc ON cc.collection_id = tc.collection_id
         WHERE tc.collected_at >= :start
           AND tc.collected_at < :end
           AND tc.consumer_type IN ('JOB', 'PROGRAM')
           {type_clause}
         GROUP BY tc.consumer_type, tc.consumer_key
    """), params)
    return [dict(row._mapping) for row in rows]


def _recent_shift_window(conn, end: datetime, consumer_type: str) -> list[dict]:
    source, _coverage_scope = _workload_source_relation(conn)
    recent_start = end - timedelta(hours=SHIFT_RECENT_HOURS)
    previous_start = recent_start - timedelta(hours=SHIFT_RECENT_HOURS)
    type_clause = "AND tc.consumer_type = :consumer_type" if consumer_type in {"JOB", "PROGRAM"} else ""
    params: dict[str, Any] = {
        "previous_start": previous_start,
        "recent_start": recent_start,
        "end": end,
    }
    if type_clause:
        params["consumer_type"] = consumer_type
    rows = conn.execute(text(f"""
        SELECT tc.consumer_type,
               tc.consumer_key,
               AVG(tc.cpu_pct) FILTER (WHERE tc.collected_at >= :previous_start AND tc.collected_at < :recent_start) AS previous_avg_cpu_pct,
               COUNT(*) FILTER (WHERE tc.collected_at >= :previous_start AND tc.collected_at < :recent_start) AS previous_observations,
               AVG(tc.cpu_pct) FILTER (WHERE tc.collected_at >= :recent_start AND tc.collected_at < :end) AS recent_avg_cpu_pct,
               COUNT(*) FILTER (WHERE tc.collected_at >= :recent_start AND tc.collected_at < :end) AS recent_observations
          FROM {source} tc
          JOIN rundeck_collections c ON c.collection_id = tc.collection_id
         WHERE {_complete_collection_clause('c')}
           AND tc.collected_at >= :previous_start
           AND tc.collected_at < :end
           AND tc.consumer_type IN ('JOB', 'PROGRAM')
           {type_clause}
         GROUP BY tc.consumer_type, tc.consumer_key
    """), params)
    return [dict(row._mapping) for row in rows]


def _collection_quality(conn, start: datetime, end: datetime) -> dict:
    rows = conn.execute(text("""
        SELECT status,
               COALESCE(finished_at, started_at) AS observed_at,
               expected_host_count,
               received_host_count
          FROM rundeck_collections
         WHERE COALESCE(finished_at, started_at) >= :start
           AND COALESCE(finished_at, started_at) < :end
         ORDER BY COALESCE(finished_at, started_at) ASC
    """), {"start": start, "end": end}).mappings().all()

    complete = [
        row for row in rows
        if row.get("status") == "READY"
        and int(row.get("expected_host_count") or 0) > 0
        and int(row.get("received_host_count") or 0) >= int(row.get("expected_host_count") or 0)
        and row.get("observed_at") is not None
    ]
    partial = [row for row in rows if row not in complete]
    times = [row["observed_at"] if row["observed_at"].tzinfo else row["observed_at"].replace(tzinfo=timezone.utc) for row in complete]
    window_seconds = max(1.0, (end - start).total_seconds())
    observed_span_seconds = max(0.0, (times[-1] - times[0]).total_seconds()) if len(times) > 1 else 0.0
    gaps = [max(0.0, (right - left).total_seconds()) for left, right in zip(times, times[1:]) if right > left]
    cadence_seconds = median(gaps) if gaps else None
    expected_checks = int(window_seconds / cadence_seconds) + 1 if cadence_seconds and cadence_seconds > 0 else None
    check_coverage_pct = min(100.0, len(complete) / expected_checks * 100.0) if expected_checks else (100.0 if len(complete) > 1 and observed_span_seconds >= window_seconds * .95 else 0.0)
    time_coverage_pct = min(100.0, observed_span_seconds / window_seconds * 100.0)
    coverage_pct = round(min(check_coverage_pct, time_coverage_pct), 1)

    expected_hosts = max((int(row.get("expected_host_count") or 0) for row in rows), default=0)
    host_ratios = [
        min(1.0, int(row.get("received_host_count") or 0) / int(row.get("expected_host_count") or 1))
        for row in rows if int(row.get("expected_host_count") or 0) > 0
    ]
    app_coverage_pct = round(sum(host_ratios) / len(host_ratios) * 100.0, 1) if host_ratios else 0.0

    if len(complete) >= 20 and coverage_pct >= 75 and app_coverage_pct >= 99:
        confidence = "HIGH"
    elif len(complete) >= 5 and coverage_pct >= 25 and app_coverage_pct >= 95:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    return {
        "confidence": confidence,
        "complete_checks": len(complete),
        "partial_or_incomplete_checks": len(partial),
        "expected_checks": expected_checks,
        "coverage_pct": coverage_pct,
        "observed_span_hours": round(observed_span_seconds / 3600.0, 1),
        "window_hours": round(window_seconds / 3600.0, 1),
        "cadence_minutes": round(cadence_seconds / 60.0, 1) if cadence_seconds else None,
        "app_coverage_pct": app_coverage_pct,
        "expected_host_count": expected_hosts,
        "first_complete_at": times[0] if times else None,
        "last_complete_at": times[-1] if times else None,
    }


def _sampling_quality(conn, start: datetime, end: datetime) -> dict:
    source, coverage_scope = _workload_source_relation(conn)
    row = conn.execute(text(f"""
        SELECT MAX(tc.rank) AS observed_rank_depth,
               COUNT(*) AS observations,
               COUNT(*) FILTER (WHERE tc.details->>'resource_aggregation' = 'SUM_BY_CONSUMER') AS aggregate_observations,
               MAX(NULLIF(tc.details->>'persisted_rank_limit', '')::integer) AS recorded_rank_limit
          FROM {source} tc
          JOIN rundeck_collections c ON c.collection_id = tc.collection_id
         WHERE {_complete_collection_clause('c')}
           AND tc.collected_at >= :start
           AND tc.collected_at < :end
    """), {"start": start, "end": end}).mappings().one()
    observations = int(row.get("observations") or 0)
    aggregate_observations = int(row.get("aggregate_observations") or 0)
    return {
        "configured_rank_limit": TOP_CONSUMERS_PER_HOST,
        "recorded_rank_limit": int(row.get("recorded_rank_limit") or 0) or None,
        "observed_rank_depth": int(row.get("observed_rank_depth") or 0),
        "resource_aggregation_coverage_pct": round(aggregate_observations / observations * 100.0, 1) if observations else 0.0,
        "coverage_scope": coverage_scope,
        "seen_definition": (
            "Observed JOB/PROGRAM rows retained from RCA-WP collection cycles; not an SM37 execution counter."
            if coverage_scope == "ALL_OBSERVED_ACTIVE_WORKLOADS"
            else "Observed in legacy persisted top-consumer collection cycles; not an SM37 execution counter."
        ),
        "wp_overlap_basis": "APP Critical WP overlap is measured on the same SAP App Server and collection check. It is temporal co-observation, not workload-level causation.",
        "direct_wp_match_available": False,
    }


def _anchor_time(conn) -> datetime:
    value = conn.execute(text(f"""
        SELECT MAX(COALESCE(finished_at, started_at))
          FROM rundeck_collections c
         WHERE {_complete_collection_clause('c')}
    """)).scalar()
    if value is None:
        return datetime.now(timezone.utc)
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _calendar_month_collection_anchor(conn, start: datetime, end: datetime) -> str:
    """Cache completed months against their own READY collection anchor, not today's run."""
    value = conn.execute(text(f"""
        SELECT MAX(COALESCE(c.finished_at, c.started_at))
          FROM rundeck_collections c
         WHERE {_complete_collection_clause('c')}
           AND COALESCE(c.finished_at, c.started_at) >= :start
           AND COALESCE(c.finished_at, c.started_at) < :end
    """), {"start": start, "end": end}).scalar()
    return value.isoformat() if value is not None else "NO_COMPLETE_COLLECTION"


def _evaluation_page(report: dict, *, limit: int, offset: int, query: str, health: str, pressure: str = "ALL", flag: str = "ALL") -> dict:
    """Filter the FULL evaluated population, then slice; leave all-population summary intact."""
    normalized_query = query.strip().casefold()
    group = health.upper().strip()
    if group not in {"ALL", "REVIEW", "ATTENTION", "NORMAL", "UNKNOWN"}:
        raise ValueError("health must be ALL, REVIEW, ATTENTION, NORMAL or UNKNOWN")
    if offset < 0 or offset > 100000:
        raise ValueError("offset must be between 0 and 100000")
    if len(normalized_query) > 512:
        raise ValueError("q must contain at most 512 characters")
    pressure_key = pressure.upper().strip()
    if pressure_key not in {"ALL", "CPU", "RAM", "WP"}:
        raise ValueError("pressure must be ALL, CPU, RAM or WP")
    flag_key = flag.upper().strip()
    if flag_key not in {"ALL", "HIGH_CPU", "HIGH_MEMORY", "RECURRING"}:
        raise ValueError("flag must be ALL, HIGH_CPU, HIGH_MEMORY or RECURRING")
    full = report["items"]
    def search_text(row: dict) -> str:
        details = row.get("details")
        details = details if isinstance(details, dict) else {}
        return " ".join([
            str(row.get("consumer_key") or ""),
            str(row.get("program") or ""),
            str(details.get("program") or ""),
            str(details.get("job_name") or ""),
            str(row.get("consumer_type") or ""),
            " ".join(str(host) for host in (row.get("hosts") or []) if host),
        ]).casefold()

    matching = [
        row for row in full
        if (group == "ALL" or _evaluation_health(row) == group)
        and (pressure_key == "ALL" or (
            pressure_key == "CPU" and row.get("pressure_overlap", {}).get("cpu_pressure_host_checks", 0) > 0
        ) or (
            pressure_key == "RAM" and row.get("pressure_overlap", {}).get("ram_pressure_host_checks", 0) > 0
        ) or (
            pressure_key == "WP" and row.get("pressure_overlap", {}).get("wp_host_checks", 0) > 0
        ))
        and (flag_key == "ALL" or (
            flag_key == "HIGH_CPU" and (
                (row.get("signals") or {}).get("sustained_high_cpu")
                or (row.get("signals") or {}).get("cpu_spike")
            )
        ) or (
            flag_key == "HIGH_MEMORY" and (row.get("signals") or {}).get("high_memory")
        ) or (
            flag_key == "RECURRING" and (row.get("signals") or {}).get("recurring")
        ))
        and (not normalized_query or normalized_query in search_text(row))
    ]
    return {
        **report,
        "items": matching[offset:offset + limit],
        "page": {
            "offset": offset, "limit": limit,
            "total": len(matching), "returned": len(matching[offset:offset + limit]),
            "has_more": offset + limit < len(matching),
            "query": query.strip(), "health": group,
            "scope": "FULL_EVALUATED_POPULATION",
        },
    }


def _evaluation_health(row: dict) -> str:
    status = str(row.get("status") or "").upper()
    if status == "REVIEW REQUIRED":
        return "REVIEW"
    if status in {"HIGH CPU", "HIGH MEMORY", "CPU SPIKE", "INCREASING CPU", "RECURRING"}:
        return "ATTENTION"
    if status == "NORMAL":
        return "NORMAL"
    return "UNKNOWN"


def _evaluation_health_summary(evaluated: list[dict]) -> dict:
    """Mutually-exclusive population counts; no approximation from first-ranked rows."""
    counts = {"review": 0, "attention": 0, "normal": 0, "unknown": 0}
    for row in evaluated:
        counts[_evaluation_health(row).lower()] += 1
    return counts


def calendar_month_bounds(month: str, now: datetime | None = None) -> tuple[datetime, datetime, datetime]:
    """WIB calendar month [start, end), capped at now; comparison is previous calendar month."""
    from re import fullmatch

    if not fullmatch(r"20[0-9]{2}-(0[1-9]|1[0-2])", str(month or "")):
        raise ValueError("month must be YYYY-MM")
    year, month_number = (int(piece) for piece in month.split("-"))
    wib = ZoneInfo("Asia/Jakarta")
    now_local = (now or datetime.now(timezone.utc)).astimezone(wib)
    start_local = datetime(year, month_number, 1, tzinfo=wib)
    if start_local > now_local:
        raise ValueError("Future calendar months are unavailable")
    end_local = datetime(year + (month_number == 12), (month_number % 12) + 1, 1, tzinfo=wib)
    previous_local = (datetime(year - 1, 12, 1, tzinfo=wib)
                      if month_number == 1 else datetime(year, month_number - 1, 1, tzinfo=wib))
    return (
        start_local.astimezone(timezone.utc),
        min(end_local, now_local).astimezone(timezone.utc),
        previous_local.astimezone(timezone.utc),
    )


def _monthly_daily_host_trend(conn, start: datetime, end: datetime) -> list[dict]:
    """Host CPU / Critical WP observations per WIB day. Not SAP transaction response time."""
    rows = conn.execute(text(f"""
        SELECT DATE(hm.collected_at AT TIME ZONE 'Asia/Jakarta') AS day,
               COUNT(DISTINCT hm.collection_id) AS complete_checks,
               AVG(hm.cpu_pct) AS avg_host_cpu_pct,
               MAX(hm.cpu_pct) AS peak_host_cpu_pct,
               AVG(hm.ram_pct) AS avg_host_ram_pct,
               MAX(hm.ram_pct) AS peak_host_ram_pct,
               COUNT(DISTINCT (hm.collection_id, hm.host)) FILTER (
                   WHERE COALESCE(hm.wp_critical, 0) > 0
               ) AS critical_wp_host_checks
          FROM rundeck_host_metrics hm
          JOIN rundeck_collections c ON c.collection_id = hm.collection_id
         WHERE {_complete_collection_clause('c')}
           AND hm.collected_at >= :start AND hm.collected_at < :end
           AND COALESCE(c.finished_at, c.started_at) >= :start
           AND COALESCE(c.finished_at, c.started_at) < :end
         GROUP BY DATE(hm.collected_at AT TIME ZONE 'Asia/Jakarta')
         ORDER BY day
    """), {"start": start, "end": end}).mappings().all()
    return [{
        "day": str(row["day"]),
        "complete_checks": int(row["complete_checks"] or 0),
        "avg_host_cpu_pct": _round(row["avg_host_cpu_pct"]),
        "peak_host_cpu_pct": _round(row["peak_host_cpu_pct"]),
        "avg_host_ram_pct": _round(row["avg_host_ram_pct"]),
        "peak_host_ram_pct": _round(row["peak_host_ram_pct"]),
        "critical_wp_host_checks": int(row["critical_wp_host_checks"] or 0),
    } for row in rows]


def evaluation_report(period: str = "1d", consumer_type: str = "ALL", limit: int = 30, offset: int = 0, query: str = "", health: str = "ALL", month: str | None = None, pressure: str = "ALL", flag: str = "ALL") -> dict:
    """Serialize cold full-population computations; cached pages use the same source anchor."""
    with _EVALUATION_COMPUTE_LOCK:
        if month is None:
            return _evaluation_report_locked(period, consumer_type, limit, offset, query, health)
        return _evaluation_report_locked(period, consumer_type, limit, offset, query, health, month, pressure, flag)


def _evaluation_report_locked(period: str, consumer_type: str, limit: int, offset: int, query: str, health: str, month: str | None = None, pressure: str = "ALL", flag: str = "ALL") -> dict:
    started = time.perf_counter()
    period_key = str(period or "1d").lower()
    if period_key not in PERIOD_DAYS and period_key != "month":
        raise ValueError("period must be one of 1d, 7d, 30d, month")
    if period_key == "month" and not month:
        raise ValueError("month is required when period=month")
    if period_key != "month" and month:
        raise ValueError("month requires period=month")
    type_key = str(consumer_type or "ALL").upper()
    if type_key not in {"ALL", "JOB", "PROGRAM"}:
        raise ValueError("type must be ALL, JOB or PROGRAM")

    limit_key = max(1, min(int(limit), 100))
    offset_key = int(offset)
    query_key = str(query or '').strip()
    health_key = str(health or 'ALL').strip().upper()
    if offset_key < 0 or offset_key > 100000 or len(query_key) > 512 or health_key not in {'ALL','REVIEW','ATTENTION','NORMAL','UNKNOWN'}:
        raise ValueError('Invalid evaluation paging/filter parameters')
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")

    with engine.connect() as conn:
        if period_key == "month":
            start, end, previous_start = calendar_month_bounds(str(month))
            days = round((end - start).total_seconds() / 86400, 2)
            # Monthly reports are separate from rolling-period cached populations.
            # The committed collection anchor invalidates data when a new READY run arrives.
            anchor_key = _calendar_month_collection_anchor(conn, start, end)
            cache_key = (f"month:{month}", type_key, anchor_key)
        else:
            # Preserve the existing 1D/7D/30D cache contract exactly:
            # key off the committed evaluation end, independent of page limit.
            days = PERIOD_DAYS[period_key]
            end = _anchor_time(conn) + timedelta(microseconds=1)
            start = end - timedelta(days=days)
            previous_start = start - timedelta(days=days)
            anchor_key = end.isoformat()
            cache_key = (period_key, type_key, anchor_key)
        cached = _cache_get(cache_key)
        if cached:
            page = _evaluation_page(cached, limit=limit_key, offset=offset_key, query=query_key, health=health_key,
                                    pressure=pressure if period_key == "month" else "ALL",
                                    flag=flag if period_key == "month" else "ALL")
            return _runtime_payload(page, cache="HIT", duration_ms=(time.perf_counter() - started) * 1000.0)
        current_quality = _collection_quality(conn, start, end)
        previous_quality = _collection_quality(conn, previous_start, start)
        current_rows = _aggregate_window(conn, start, end, type_key)
        previous_rows = _aggregate_window(conn, previous_start, start, type_key)
        historical_rows = _historical_baseline(conn, start, type_key)
        shift_rows = _recent_shift_window(conn, end, type_key)
        sampling = _sampling_quality(conn, start, end)
        monthly_daily = _monthly_daily_host_trend(conn, start, end) if period_key == "month" else []
        monthly_pressure = (monthly_pressure_observations(
            conn, start, end, _workload_source_relation(conn)[0], _complete_collection_clause('c')
        ) if period_key == "month" else None)
        monthly_errors = (monthly_error_evidence(
            conn, start, end, _workload_source_relation(conn)[0], _complete_collection_clause('c')
        ) if period_key == "month" else None)

    current_checks = int(current_quality["complete_checks"])
    previous_checks = int(previous_quality["complete_checks"])
    previous_map = {(str(row.get("consumer_type")), str(row.get("consumer_key"))): row for row in previous_rows}
    historical_map = {(str(row.get("consumer_type")), str(row.get("consumer_key"))): row for row in historical_rows}
    shift_map = {(str(row.get("consumer_type")), str(row.get("consumer_key"))): row for row in shift_rows}
    priority = {"NEEDS REVIEW": 7, "HIGH RESOURCE": 6, "INCREASING": 5, "RECURRING": 4, "LIMITED DATA": 2, "STABLE": 1}
    evaluated: list[dict] = []

    for row in current_rows:
        key = (str(row.get("consumer_type")), str(row.get("consumer_key")))
        previous = previous_map.get(key)
        baseline = historical_map.get(key) or {}
        shift = shift_map.get(key) or {}
        observations = int(row.get("observations") or 0)
        aggregate_resource_observations = int(row.get("aggregate_resource_observations") or 0)
        previous_occurrences = int(previous.get("occurrences") or 0) if previous else 0
        baseline_eligible = (
            previous is not None
            and previous_occurrences >= MIN_BASELINE_OCCURRENCES
            and previous_quality.get("confidence") in {"MEDIUM", "HIGH"}
        )
        avg_cpu = _round(row.get("avg_cpu_pct"))
        peak_cpu = _round(row.get("peak_cpu_pct"))
        baseline_normalized = {
            "days": HISTORICAL_BASELINE_DAYS,
            "observations": int(baseline.get("observations") or 0),
            "collection_checks": int(baseline.get("collection_checks") or 0),
            "cpu_median_pct": _round(baseline.get("cpu_median_pct")),
            "cpu_p95_pct": _round(baseline.get("cpu_p95_pct")),
            "pss_median_gb": _round(baseline.get("pss_median_gb"), 2),
            "pss_p95_gb": _round(baseline.get("pss_p95_gb"), 2),
            "first_seen": baseline.get("first_seen"),
            "last_seen": baseline.get("last_seen"),
        }
        normalized = {
            **row,
            "occurrences": int(row.get("occurrences") or 0),
            "observations": observations,
            "host_observations": int(row.get("host_observations") or 0),
            "app_count": int(row.get("app_count") or 0),
            "hosts": list(row.get("hosts") or []),
            "critical_wp_checks": int(row.get("critical_wp_checks") or 0),
            "critical_wp_host_checks": int(row.get("critical_wp_host_checks") or 0),
            "max_rank_seen": int(row.get("max_rank_seen") or 0),
            "aggregate_resource_observations": aggregate_resource_observations,
            "resource_aggregation_coverage_pct": round(aggregate_resource_observations / observations * 100.0, 1) if observations else 0.0,
            "avg_cpu_pct": avg_cpu,
            "peak_cpu_pct": peak_cpu,
            "avg_cpu_core_equivalent": round(avg_cpu / 100.0, 2) if avg_cpu is not None else None,
            "peak_cpu_core_equivalent": round(peak_cpu / 100.0, 2) if peak_cpu is not None else None,
            "avg_pss_gb": _round(row.get("avg_pss_gb"), 2),
            "peak_pss_gb": _round(row.get("peak_pss_gb"), 2),
            "avg_process_count": _round(row.get("avg_process_count"), 1),
            "peak_process_count": _round(row.get("peak_process_count"), 0),
            "avg_host_cpu_pct": _round(row.get("avg_host_cpu_pct")),
            "peak_host_cpu_pct": _round(row.get("peak_host_cpu_pct")),
            "app_wp_baseline_pct": _round(row.get("app_wp_baseline_pct")),
            "historical_baseline": baseline_normalized,
            "shift_previous_avg_cpu_pct": _round(shift.get("previous_avg_cpu_pct")),
            "shift_previous_observations": int(shift.get("previous_observations") or 0),
            "shift_recent_avg_cpu_pct": _round(shift.get("recent_avg_cpu_pct")),
            "shift_recent_observations": int(shift.get("recent_observations") or 0),
            "shift_window_hours": SHIFT_RECENT_HOURS,
            "previous": {
                "occurrences": previous_occurrences,
                "avg_cpu_pct": _round(previous.get("avg_cpu_pct")) if previous else None,
                "peak_cpu_pct": _round(previous.get("peak_cpu_pct")) if previous else None,
                "avg_pss_gb": _round(previous.get("avg_pss_gb"), 2) if previous else None,
            },
        }
        if monthly_pressure is not None:
            normalized["pressure_overlap"] = monthly_pressure["correlation"].get(key, {
                "cpu_pressure_host_checks": 0, "ram_pressure_host_checks": 0,
                "wp_host_checks": 0, "cpu_peak_during_cpu_pressure": None,
                "pss_peak_during_ram_pressure": None,
            })
        normalized.update(assess_workload(
            normalized,
            normalized["previous"],
            current_checks,
            baseline_eligible=baseline_eligible,
            period_confidence=str(current_quality.get("confidence") or "LOW"),
            previous_period_confidence=str(previous_quality.get("confidence") or "LOW"),
        ))
        evaluated.append(normalized)

    evaluated.sort(key=lambda item: (
        priority.get(item["assessment"], 0),
        1 if item.get("status") == "REVIEW REQUIRED" else 0,
        1 if item.get("signals", {}).get("baseline_anomaly") else 0,
        _CONFIDENCE_RANK.get(item.get("overall_confidence"), 0),
        _CONFIDENCE_RANK.get(item.get("observation_confidence"), 0),
        item.get("wp_excess_association_pct") or 0,
        item.get("occurrences") or 0,
        item.get("avg_cpu_pct") or 0,
    ), reverse=True)
    summary = {
        "workloads": len(evaluated),
        "health": _evaluation_health_summary(evaluated),
        "programs": sum(1 for item in evaluated if item.get("consumer_type") == "PROGRAM"),
        "jobs": sum(1 for item in evaluated if item.get("consumer_type") == "JOB"),
        "needs_review": sum(1 for item in evaluated if item["assessment"] == "NEEDS REVIEW"),
        "review_required": sum(1 for item in evaluated if item.get("status") == "REVIEW REQUIRED"),
        "high_resource": sum(1 for item in evaluated if item.get("signals", {}).get("high_resource")),
        "sustained_high_cpu": sum(1 for item in evaluated if item.get("signals", {}).get("sustained_high_cpu")),
        "high_memory": sum(1 for item in evaluated if item.get("signals", {}).get("high_memory")),
        "cpu_spike": sum(1 for item in evaluated if item.get("signals", {}).get("cpu_spike")),
        "baseline_anomaly": sum(1 for item in evaluated if item.get("signals", {}).get("baseline_anomaly")),
        "performance_shift": sum(1 for item in evaluated if item.get("signals", {}).get("performance_shift")),
        "increasing": sum(1 for item in evaluated if item.get("signals", {}).get("increasing")),
        "recurring": sum(1 for item in evaluated if item.get("signals", {}).get("recurring")),
        "limited_data": sum(1 for item in evaluated if item["assessment"] == "LIMITED DATA"),
        "wp_signal_overlap": sum(1 for item in evaluated if item.get("signals", {}).get("wp_signal_overlap")),
        "wp_excess_association": sum(1 for item in evaluated if item.get("signals", {}).get("wp_excess_association")),
    }

    if monthly_pressure is not None:
        monthly_pressure.pop("correlation")
        monthly_pressure["top_cpu_workloads"] = sorted(
            (row for row in evaluated if row.get("pressure_overlap", {}).get("cpu_pressure_host_checks", 0) > 0),
            key=lambda row: (
                -row["pressure_overlap"]["cpu_pressure_host_checks"],
                -(row["pressure_overlap"]["cpu_peak_during_cpu_pressure"] or 0),
                str(row["consumer_key"]),
            ),
        )[:5]
        monthly_pressure["top_ram_workloads"] = sorted(
            (row for row in evaluated if row.get("pressure_overlap", {}).get("ram_pressure_host_checks", 0) > 0),
            key=lambda row: (
                -row["pressure_overlap"]["ram_pressure_host_checks"],
                -(row["pressure_overlap"]["pss_peak_during_ram_pressure"] or 0),
                str(row["consumer_key"]),
            ),
        )[:5]

    result = {
        "period": period_key,
        "month": str(month) if period_key == "month" else None,
        "days": days,
        "type": type_key,
        "recommended_period": "1d",
        "start": start,
        "end": end,
        "previous_start": previous_start,
        "previous_end": start,
        "collection_checks": current_checks,
        "previous_collection_checks": previous_checks,
        "quality": current_quality,
        "previous_quality": previous_quality,
        "sampling": sampling,
        "daily_host_trend": monthly_daily,
        "monthly_pressure": monthly_pressure,
        "monthly_errors": monthly_errors,
        "baseline": {
            "days": HISTORICAL_BASELINE_DAYS,
            "min_observations": HISTORICAL_BASELINE_MIN_OBSERVATIONS,
            "cpu_deviation_pct": BASELINE_DEVIATION_PCT,
            "cpu_min_delta_pp": BASELINE_CPU_MIN_DELTA_PP,
            "pss_min_delta_gb": BASELINE_PSS_MIN_DELTA_GB,
        },
        "shift_detection": {
            "recent_hours": SHIFT_RECENT_HOURS,
            "min_observations_each_window": SHIFT_MIN_OBSERVATIONS,
            "increase_pct": SHIFT_INCREASE_PCT,
            "cpu_min_delta_pp": SHIFT_CPU_MIN_DELTA_PP,
        },
        "thresholds": {
            "avg_cpu_high_pct": CPU_HIGH_AVG,
            "peak_cpu_high_pct": CPU_HIGH_PEAK,
            "avg_pss_high_gb": PSS_HIGH_GB,
            "increase_pct": INCREASE_PCT,
            "recurring_pct": RECURRING_PCT,
            "wp_signal_overlap_pct": WP_CORRELATION_PCT,
            "wp_excess_association_pp": WP_EXCESS_ASSOCIATION_PCT,
            "min_baseline_occurrences": MIN_BASELINE_OCCURRENCES,
            "confidence_medium_occurrences": CONFIDENCE_MEDIUM_OCCURRENCES,
            "confidence_high_occurrences": CONFIDENCE_HIGH_OCCURRENCES,
        },
        "summary": summary,
        "items": evaluated,
        "method": "Deterministic complete-collection evaluation with workload-specific median and P95 baseline, recent CPU shift detection and App Server normalized Critical WP overlap. Investigation signal only; not root-cause proof.",
    }
    _cache_put(cache_key, result)
    return _runtime_payload(_evaluation_page(result, limit=limit_key, offset=offset_key, query=query_key,
                                             health=health_key, pressure=pressure if period_key == "month" else "ALL",
                                             flag=flag if period_key == "month" else "ALL"),
                            cache="MISS", duration_ms=(time.perf_counter() - started) * 1000.0)

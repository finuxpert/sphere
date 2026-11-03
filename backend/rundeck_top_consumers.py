"""Source-backed CPU and PSS rankings for compact Monitoring.

Unlike the saved daily evaluation, this read-only query supports short windows.
It never interprets collector observations as SM37 job executions.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from math import isfinite

from sqlalchemy import text

from backend.db.session import get_engine
from backend.rundeck_prod_compat_evaluation import (
    _anchor_collection,
    _complete_collection_clause,
    _workload_source_relation,
)

RANGES = {"30m": 30, "1h": 60, "6h": 360, "24h": 1440}
MIN_CUSTOM_MINUTES = 10
MAX_CUSTOM_MINUTES = 1440


def _offset_timestamp(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        raise ValueError("Invalid custom timestamp") from None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("Custom timestamps require an explicit timezone offset (WIB +07:00)")
    return parsed.astimezone(timezone.utc)


def _bounds(range_key: str, from_at: str | None, to_at: str | None,
            *, anchor: datetime | None = None, now: datetime | None = None) -> tuple[datetime, datetime]:
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    if range_key == "custom":
        if not from_at or not to_at:
            raise ValueError("Custom range requires from_at and to_at")
        start, end = _offset_timestamp(from_at), _offset_timestamp(to_at)
        duration = (end - start).total_seconds() / 60
        if duration < MIN_CUSTOM_MINUTES or duration > MAX_CUSTOM_MINUTES:
            raise ValueError("Custom range must be between 10 minutes and 24 hours")
        if end > current + timedelta(minutes=2):
            raise ValueError("Custom range cannot end in the future")
        return start, end
    if range_key not in RANGES:
        raise ValueError("Range must be 30m, 1h, 6h, 24h or custom")
    if from_at or to_at:
        raise ValueError("Explicit timestamps require range=custom")
    if anchor is None:
        raise ValueError("No complete collection anchor is available")
    end = min(anchor.astimezone(timezone.utc), current) + timedelta(microseconds=1)
    return end - timedelta(minutes=RANGES[range_key]), end


def _observed(value):
    try:
        result = float(value)
        return result if isfinite(result) and result >= 0 else None
    except (ValueError, TypeError, OverflowError):
        return None


def _rank(rows: list[dict], field: str, *, limit: int = 10) -> list[dict]:
    ranked = []
    for row in rows:
        key = str(row.get("consumer_key") or "").strip()
        kind = str(row.get("consumer_type") or "").upper()
        value = _observed(row.get(field))
        if not key or kind not in {"JOB", "PROGRAM"} or value is None:
            continue
        at = row.get("last_seen")
        ranked.append({
            "consumer_type": kind,
            "consumer_key": key,
            "value": round(value / 100, 4) if field == "avg_cpu_pct" else round(value, 3),
            "observations": int(row.get("observations") or 0),
            "collection_checks": int(row.get("collection_checks") or 0),
            "aggregate_observations": int(row.get("aggregate_observations") or 0),
            "last_seen": at.isoformat() if isinstance(at, datetime) else str(at or ""),
        })
    return sorted(ranked, key=lambda row: (-row["value"], row["consumer_type"], row["consumer_key"]))[:limit]


def top_consumers_window(range_key: str = "24h", from_at: str | None = None,
                         to_at: str | None = None, *, now: datetime | None = None) -> dict:
    # Reject bad input before connecting to the production-history database.
    if range_key == "custom":
        start, end = _bounds(range_key, from_at, to_at, now=now)
    else:
        if range_key not in RANGES or from_at or to_at:
            _bounds(range_key, from_at, to_at, now=now)
        start = end = None

    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")
    with engine.connect() as conn:
        if range_key != "custom":
            anchor_at, _anchor_id = _anchor_collection(conn)
            start, end = _bounds(range_key, None, None, anchor=anchor_at, now=now)
        source, coverage_scope = _workload_source_relation(conn)
        params = {"start": start, "end": end}
        rows = [dict(row._mapping) for row in conn.execute(text(f"""
            SELECT tc.consumer_type, tc.consumer_key,
                   COUNT(*) AS observations,
                   COUNT(DISTINCT tc.collection_id) AS collection_checks,
                   COUNT(*) FILTER (
                       WHERE tc.details->>'resource_aggregation' = 'SUM_BY_CONSUMER'
                   ) AS aggregate_observations,
                   AVG(tc.cpu_pct) AS avg_cpu_pct,
                   AVG(NULLIF(COALESCE(tc.details->>'total_pss_gb',
                                       tc.details->>'pss_gb'), '')::double precision) AS avg_pss_gb,
                   MAX(tc.collected_at) AS last_seen
              FROM {source} tc
              JOIN rundeck_collections c ON c.collection_id = tc.collection_id
             WHERE {_complete_collection_clause('c')}
               AND tc.collected_at >= :start AND tc.collected_at < :end
               AND tc.consumer_type IN ('JOB', 'PROGRAM')
             GROUP BY tc.consumer_type, tc.consumer_key
        """), params)]
        check_count = conn.execute(text(f"""
            SELECT COUNT(*) FROM rundeck_collections c
             WHERE {_complete_collection_clause('c')}
               AND COALESCE(c.finished_at, c.started_at) >= :start
               AND COALESCE(c.finished_at, c.started_at) < :end
        """), params).scalar_one()

    return {
        "range": range_key,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "source": "RCA-WP retained complete collections",
        "coverage_scope": coverage_scope,
        "metric_basis": "Unweighted average of observed workload collection rows across all APPs",
        "complete_checks": int(check_count or 0),
        "observed_workloads": len(rows),
        "cpu": _rank(rows, "avg_cpu_pct"),
        "memory": _rank(rows, "avg_pss_gb"),
    }

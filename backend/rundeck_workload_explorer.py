"""Read-only historical workload explorer queries for SPHERE.

The explorer reuses retained Rundeck top-consumer observations. It provides
historical ranking and aggregation only; it does not assign root cause.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text

from backend.db.session import get_engine

RANGES = {
    "24h": {"hours": 24, "bucket_seconds": 600, "bucket": "10m"},
    "3d": {"hours": 72, "bucket_seconds": 1800, "bucket": "30m"},
    "7d": {"hours": 168, "bucket_seconds": 1800, "bucket": "30m"},
    "30d": {"hours": 720, "bucket_seconds": 3600, "bucket": "1h"},
}
VALID_TYPES = {"ALL", "JOB", "PROGRAM"}


def range_config(range_key: str) -> dict:
    key = str(range_key or "24h").lower()
    if key not in RANGES:
        raise ValueError("range must be one of 24h, 3d, 7d, 30d")
    return {"key": key, **RANGES[key]}


def normalize_type(consumer_type: str | None) -> str:
    value = str(consumer_type or "ALL").upper()
    if value not in VALID_TYPES:
        raise ValueError("type must be ALL, JOB or PROGRAM")
    return value


def _complete_collection_clause(alias: str = "c") -> str:
    return (
        f"{alias}.status = 'READY' "
        f"AND {alias}.expected_host_count > 0 "
        f"AND {alias}.received_host_count >= {alias}.expected_host_count"
    )


def _engine():
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")
    return engine


def _anchor_time(conn) -> datetime:
    value = conn.execute(text(f"""
        SELECT MAX(COALESCE(c.finished_at, c.started_at))
          FROM rundeck_collections c
         WHERE {_complete_collection_clause('c')}
    """)).scalar()
    if value is None:
        return datetime.now(timezone.utc)
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _number(value: Any, digits: int = 2) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return None


def workload_search(query: str, consumer_type: str = "ALL", limit: int = 30) -> dict:
    q = str(query or "").strip()
    if len(q) < 2:
        return {"query": q, "type": normalize_type(consumer_type), "items": []}
    type_key = normalize_type(consumer_type)
    safe_limit = max(1, min(100, int(limit)))
    type_clause = "AND t.consumer_type = :consumer_type" if type_key != "ALL" else ""
    params: dict[str, Any] = {
        "pattern": f"%{q}%",
        "prefix": f"{q}%",
        "exact": q,
        "limit": safe_limit,
    }
    if type_key != "ALL":
        params["consumer_type"] = type_key

    engine = _engine()
    with engine.connect() as conn:
        rows = conn.execute(text(f"""
            SELECT t.consumer_type,
                   t.consumer_key,
                   COUNT(*) AS observations,
                   COUNT(DISTINCT t.collection_id) AS checks,
                   COUNT(DISTINCT t.host) AS app_count,
                   ARRAY_AGG(DISTINCT t.host ORDER BY t.host) AS hosts,
                   AVG(t.cpu_pct) AS avg_cpu_pct,
                   MAX(t.cpu_pct) AS peak_cpu_pct,
                   MIN(t.collected_at) AS first_seen,
                   MAX(t.collected_at) AS last_seen
              FROM rundeck_top_consumers t
              JOIN rundeck_collections c ON c.collection_id = t.collection_id
             WHERE {_complete_collection_clause('c')}
               AND t.consumer_type IN ('JOB', 'PROGRAM')
               AND t.consumer_key ILIKE :pattern
               {type_clause}
             GROUP BY t.consumer_type, t.consumer_key
             ORDER BY CASE
                        WHEN UPPER(t.consumer_key) = UPPER(:exact) THEN 0
                        WHEN t.consumer_key ILIKE :prefix THEN 1
                        ELSE 2
                      END,
                      MAX(t.collected_at) DESC,
                      MAX(t.cpu_pct) DESC NULLS LAST
             LIMIT :limit
        """), params).mappings().all()

    items = []
    for row in rows:
        item = dict(row)
        item["observations"] = int(item.get("observations") or 0)
        item["checks"] = int(item.get("checks") or 0)
        item["app_count"] = int(item.get("app_count") or 0)
        item["avg_cpu_pct"] = _number(item.get("avg_cpu_pct"), 1)
        item["peak_cpu_pct"] = _number(item.get("peak_cpu_pct"), 1)
        items.append(item)
    return {"query": q, "type": type_key, "items": items}


def workload_summary(
    consumer_key: str,
    consumer_type: str,
    range_key: str = "24h",
    host: str | None = None,
) -> dict:
    key = str(consumer_key or "").strip()
    if not key:
        raise ValueError("job is required")
    type_key = normalize_type(consumer_type)
    if type_key == "ALL":
        raise ValueError("type must be JOB or PROGRAM for workload detail")
    config = range_config(range_key)
    host_value = str(host or "").strip().upper() or None
    host_clause = "AND t.host = :host" if host_value else ""

    engine = _engine()
    with engine.connect() as conn:
        end = _anchor_time(conn) + timedelta(microseconds=1)
        start = end - timedelta(hours=config["hours"])
        params: dict[str, Any] = {
            "start": start,
            "end": end,
            "consumer_key": key,
            "consumer_type": type_key,
        }
        if host_value:
            params["host"] = host_value
        row = conn.execute(text(f"""
            SELECT COUNT(*) AS observations,
                   COUNT(DISTINCT t.collection_id) AS checks,
                   COUNT(DISTINCT t.host) AS app_count,
                   ARRAY_AGG(DISTINCT t.host ORDER BY t.host) AS hosts,
                   AVG(t.cpu_pct) AS avg_cpu_pct,
                   MAX(t.cpu_pct) AS peak_cpu_pct,
                   AVG(NULLIF(COALESCE(t.details->>'total_pss_gb', t.details->>'pss_gb'), '')::double precision) AS avg_pss_gb,
                   MAX(NULLIF(COALESCE(t.details->>'total_pss_gb', t.details->>'pss_gb'), '')::double precision) AS peak_pss_gb,
                   AVG(NULLIF(t.details->>'process_count', '')::double precision) AS avg_processes,
                   MAX(NULLIF(t.details->>'process_count', '')::double precision) AS max_processes,
                   COUNT(DISTINCT t.collection_id) FILTER (WHERE COALESCE(h.wp_critical, 0) > 0) AS critical_wp_checks,
                   MAX(COALESCE(h.wp_critical, 0)) AS max_critical_wp,
                   MIN(t.collected_at) AS first_seen,
                   MAX(t.collected_at) AS last_seen
              FROM rundeck_top_consumers t
              JOIN rundeck_collections c ON c.collection_id = t.collection_id
              LEFT JOIN rundeck_host_metrics h
                ON h.collection_id = t.collection_id AND h.host = t.host
             WHERE {_complete_collection_clause('c')}
               AND t.collected_at >= :start
               AND t.collected_at < :end
               AND t.consumer_key = :consumer_key
               AND t.consumer_type = :consumer_type
               {host_clause}
        """), params).mappings().one()

    summary = dict(row)
    for field in ("observations", "checks", "app_count", "critical_wp_checks", "max_critical_wp"):
        summary[field] = int(summary.get(field) or 0)
    for field, digits in (
        ("avg_cpu_pct", 1), ("peak_cpu_pct", 1), ("avg_pss_gb", 2),
        ("peak_pss_gb", 2), ("avg_processes", 1), ("max_processes", 0),
    ):
        summary[field] = _number(summary.get(field), digits)
    return {
        "consumer_key": key,
        "consumer_type": type_key,
        "host": host_value,
        "range": config["key"],
        "bucket": config["bucket"],
        "window_start": start,
        "window_end": end,
        **summary,
        "note": "Historical observations are supporting evidence; they do not identify root cause by themselves.",
    }


def workload_trend(
    consumer_key: str,
    consumer_type: str,
    range_key: str = "24h",
    host: str | None = None,
) -> dict:
    key = str(consumer_key or "").strip()
    if not key:
        raise ValueError("job is required")
    type_key = normalize_type(consumer_type)
    if type_key == "ALL":
        raise ValueError("type must be JOB or PROGRAM for workload detail")
    config = range_config(range_key)
    host_value = str(host or "").strip().upper() or None
    host_clause = "AND t.host = :host" if host_value else ""

    engine = _engine()
    with engine.connect() as conn:
        end = _anchor_time(conn) + timedelta(microseconds=1)
        start = end - timedelta(hours=config["hours"])
        params: dict[str, Any] = {
            "start": start,
            "end": end,
            "consumer_key": key,
            "consumer_type": type_key,
            "bucket_seconds": config["bucket_seconds"],
        }
        if host_value:
            params["host"] = host_value
        rows = conn.execute(text(f"""
            SELECT to_timestamp(
                     FLOOR(EXTRACT(EPOCH FROM t.collected_at) / :bucket_seconds) * :bucket_seconds
                   ) AS bucket,
                   COUNT(*) AS observations,
                   COUNT(DISTINCT t.collection_id) AS checks,
                   AVG(t.cpu_pct) AS avg_cpu_pct,
                   MAX(t.cpu_pct) AS peak_cpu_pct,
                   AVG(NULLIF(COALESCE(t.details->>'total_pss_gb', t.details->>'pss_gb'), '')::double precision) AS avg_pss_gb,
                   MAX(NULLIF(COALESCE(t.details->>'total_pss_gb', t.details->>'pss_gb'), '')::double precision) AS peak_pss_gb,
                   AVG(NULLIF(t.details->>'process_count', '')::double precision) AS avg_processes,
                   MAX(NULLIF(t.details->>'process_count', '')::double precision) AS max_processes,
                   MAX(COALESCE(h.wp_critical, 0)) AS max_critical_wp,
                   COUNT(DISTINCT t.collection_id) FILTER (WHERE COALESCE(h.wp_critical, 0) > 0) AS critical_wp_checks
              FROM rundeck_top_consumers t
              JOIN rundeck_collections c ON c.collection_id = t.collection_id
              LEFT JOIN rundeck_host_metrics h
                ON h.collection_id = t.collection_id AND h.host = t.host
             WHERE {_complete_collection_clause('c')}
               AND t.collected_at >= :start
               AND t.collected_at < :end
               AND t.consumer_key = :consumer_key
               AND t.consumer_type = :consumer_type
               {host_clause}
             GROUP BY bucket
             ORDER BY bucket ASC
        """), params).mappings().all()

    items = []
    for row in rows:
        item = dict(row)
        item["observations"] = int(item.get("observations") or 0)
        item["checks"] = int(item.get("checks") or 0)
        item["max_critical_wp"] = int(item.get("max_critical_wp") or 0)
        item["critical_wp_checks"] = int(item.get("critical_wp_checks") or 0)
        for field, digits in (
            ("avg_cpu_pct", 1), ("peak_cpu_pct", 1), ("avg_pss_gb", 2),
            ("peak_pss_gb", 2), ("avg_processes", 1), ("max_processes", 0),
        ):
            item[field] = _number(item.get(field), digits)
        items.append(item)
    return {
        "consumer_key": key,
        "consumer_type": type_key,
        "host": host_value,
        "range": config["key"],
        "bucket": config["bucket"],
        "bucket_seconds": config["bucket_seconds"],
        "window_start": start,
        "window_end": end,
        "items": items,
    }

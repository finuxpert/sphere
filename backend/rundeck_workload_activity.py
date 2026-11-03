"""Read-only observed SAP workload and WP-type history from retained RCA-WP rows.

These are observed active identities / WP snapshots, NEVER SM37 executions,
full instance WP capacity, response-time, or Busy/Free utilization.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from threading import Lock
from time import monotonic

from sqlalchemy import text

from backend.db.session import get_engine
from backend.rundeck_evaluation import (
    _anchor_collection,
    _complete_collection_clause,
)

RANGES = {"6h": timedelta(hours=6), "24h": timedelta(hours=24)}
_CACHE_TTL_SECONDS = 90
_ACTIVITY_CACHE: dict[tuple[str, str, str], tuple[float, dict]] = {}
_CACHE_LOCK = Lock()
WP_TYPES = ("DIA", "BTC", "UPD", "ENQ", "OTHER")


def normalize_activity_row(row: dict) -> dict:
    """Preserve unavailable evidence as null rather than fabricated zero."""
    at = row.get("sampled_at")
    if not isinstance(at, datetime):
        raise ValueError("Activity collection has no verified timestamp")
    sources = int(row.get("source_rows") or 0)
    wp_rows = int(row.get("wp_count") or 0)
    jobs = int(row.get("jobs") or 0) if sources else None
    programs = int(row.get("programs") or 0) if sources else None
    wp = ({key: int(row.get(key.lower()) or 0) for key in WP_TYPES}
          if wp_rows > 0 else None)
    if wp is not None and sum(wp.values()) != wp_rows:
        raise ValueError("WP type counts do not match deduplicated observed WP count")
    return {
        "collection_id": str(row["collection_id"]),
        "collected_at": at.isoformat(),
        "jobs": jobs,
        "programs": programs,
        "source_rows": sources,
        "wp": wp,
        "observed_wp": wp_rows if wp is not None else None,
    }


def workload_activity_trends(range_key: str = "24h", *,
                            now: datetime | None = None) -> dict:
    if range_key not in RANGES:
        raise ValueError("Range must be 6h or 24h")
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    engine = get_engine()
    if engine is None:
        raise RuntimeError("PostgreSQL history is not enabled")
    with engine.connect() as conn:
        anchor, anchor_id = _anchor_collection(conn)
        end = min(anchor.astimezone(timezone.utc), current) + timedelta(microseconds=1)
        start = end - RANGES[range_key]
        # A full retained projection is available for current DEV snapshots.
        # Avoid the evaluation UNION+NOT EXISTS source: it forces a historical
        # anti-join for every chart refresh and makes JSON expansion expensive.
        has_observations = bool(conn.execute(text(
            "SELECT to_regclass('public.rundeck_workload_observations') IS NOT NULL"
        )).scalar())
        relation = ("rundeck_workload_observations" if has_observations
                    else "rundeck_top_consumers")
        coverage = ("ALL_OBSERVED_ACTIVE_WORKLOADS" if has_observations
                    else "TOP_CONSUMERS_ONLY")
        # Repeat identical chart requests for one collector anchor from cache.
        cache_key = (range_key, anchor_id, relation)
        cached = _ACTIVITY_CACHE.get(cache_key)
        if cached and monotonic() - cached[0] < _CACHE_TTL_SECONDS:
            return cached[1]
        # Cap database work; never leave the UI spinning on a blocked query.
        conn.execute(text("SET LOCAL statement_timeout = '12000ms'"))
        rows = conn.execute(text(f"""
            WITH sampled AS (
                SELECT c.collection_id,
                       COALESCE(c.finished_at, c.started_at) AS sampled_at
                FROM rundeck_collections c
                WHERE {_complete_collection_clause('c')}
                  AND COALESCE(c.finished_at, c.started_at) >= :start
                  AND COALESCE(c.finished_at, c.started_at) < :end
            ),
            observed AS (
                SELECT o.collection_id, o.host, o.consumer_type,
                       o.consumer_key, o.details
                FROM {relation} o
                JOIN sampled c ON c.collection_id = o.collection_id
                WHERE o.collected_at >= :start AND o.collected_at < :end
                  AND o.consumer_type IN ('JOB', 'PROGRAM', 'PROCESS')
            ),
            workloads AS (
                SELECT collection_id,
                       COUNT(DISTINCT (consumer_type, consumer_key))
                         FILTER (WHERE consumer_type = 'JOB') AS jobs,
                       COUNT(DISTINCT (consumer_type, consumer_key))
                         FILTER (WHERE consumer_type = 'PROGRAM') AS programs,
                       COUNT(*) FILTER (
                         WHERE consumer_type IN ('JOB', 'PROGRAM')
                       ) AS source_rows
                FROM observed
                GROUP BY collection_id
            ),
            raw_wp AS (
                SELECT o.collection_id,
                       o.host,
                       COALESCE(
                         NULLIF(BTRIM(signal.item->>'wp'), ''),
                         CASE WHEN NULLIF(BTRIM(signal.item->>'pid'), '') IS NOT NULL
                              THEN 'PID:' || BTRIM(signal.item->>'pid')
                              ELSE NULL END
                       ) AS wp_id,
                       UPPER(COALESCE(NULLIF(BTRIM(signal.item->>'wp_type'), ''), 'OTHER'))
                         AS raw_type
                FROM observed o
                CROSS JOIN LATERAL jsonb_array_elements(
                    CASE WHEN jsonb_typeof(o.details->'wp_signals') = 'array'
                         THEN o.details->'wp_signals'
                         ELSE '[]'::jsonb END
                ) AS signal(item)
            ),
            distinct_wp AS (
                SELECT collection_id, host, wp_id,
                       CASE
                         WHEN COUNT(DISTINCT raw_type) = 1 THEN
                           CASE WHEN MIN(raw_type) IN ('DIA', 'BTC', 'ENQ')
                                   THEN MIN(raw_type)
                                WHEN MIN(raw_type) IN ('UPD','UP2') THEN 'UPD'
                                ELSE 'OTHER' END
                         ELSE 'OTHER'
                       END AS wp_type
                FROM raw_wp
                WHERE wp_id IS NOT NULL AND wp_id <> ''
                GROUP BY collection_id, host, wp_id
            ),
            wp_totals AS (
                SELECT collection_id, COUNT(*) AS wp_count,
                       COUNT(*) FILTER (WHERE wp_type='DIA') AS dia,
                       COUNT(*) FILTER (WHERE wp_type='BTC') AS btc,
                       COUNT(*) FILTER (WHERE wp_type='UPD') AS upd,
                       COUNT(*) FILTER (WHERE wp_type='ENQ') AS enq,
                       COUNT(*) FILTER (WHERE wp_type='OTHER') AS other
                FROM distinct_wp
                GROUP BY collection_id
            )
            SELECT c.collection_id, c.sampled_at,
                   a.jobs, a.programs, a.source_rows,
                   w.wp_count, w.dia, w.btc, w.upd, w.enq, w.other
            FROM sampled c
            LEFT JOIN workloads a ON a.collection_id = c.collection_id
            LEFT JOIN wp_totals w ON w.collection_id = c.collection_id
            ORDER BY c.sampled_at, c.collection_id
        """), {"start": start, "end": end}).mappings().all()
    points = [normalize_activity_row(dict(row)) for row in rows]
    result = {
        "range": range_key,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "source": "RCA-WP retained complete collections",
        "coverage_scope": coverage,
        "collection_anchor": anchor_id,
        "semantics": {
            "activity": "Distinct JOB/PROGRAM names observed across APP1-APP5 per collection, not job runs",
            "work_process": "Distinct WP IDs per APP and collection from recorded wp_signals; not total WP capacity or utilization",
            "missing": "A collection without respective observations returns null, not zero",
        },
        "complete_checks": len(points),
        "activity_checks": sum(p["jobs"] is not None for p in points),
        "wp_checks": sum(p["wp"] is not None for p in points),
        "items": points,
    }
    with _CACHE_LOCK:
        # Cache only verified completed results; retain at most eight anchors/ranges.
        _ACTIVITY_CACHE[cache_key] = (monotonic(), result)
        while len(_ACTIVITY_CACHE) > 8:
            _ACTIVITY_CACHE.pop(next(iter(_ACTIVITY_CACHE)))
    return result

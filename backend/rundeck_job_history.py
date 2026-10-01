"""Read-only SAP job history queries for Rundeck-backed RCA."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import text

from backend.db.session import get_engine


def _source_relation(conn) -> tuple[str, str]:
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


def current_sap_jobs(collection_id: str, limit: int = 50, host: str | None = None) -> dict:
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")

    host_value = str(host or "").strip().upper() or None
    host_clause = "AND t.host = :host" if host_value else ""
    params = {"collection_id": collection_id, "limit": limit}
    if host_value:
        params["host"] = host_value

    with engine.connect() as conn:
        source, coverage_scope = _source_relation(conn)
        total = int(conn.execute(text(f"""
            SELECT COUNT(*)
              FROM {source} t
             WHERE t.collection_id = :collection_id
               AND t.consumer_type IN ('JOB', 'PROGRAM')
               {host_clause}
        """), params).scalar() or 0)
        rows = conn.execute(text(f"""
            SELECT t.collection_id,
                   c.execution_id,
                   t.collected_at,
                   t.host,
                   t.consumer_type,
                   t.consumer_key,
                   t.rank,
                   t.cpu_pct,
                   t.ram_pct,
                   t.details
              FROM {source} t
              LEFT JOIN rundeck_collections c
                ON c.collection_id = t.collection_id
             WHERE t.collection_id = :collection_id
               AND t.consumer_type IN ('JOB', 'PROGRAM')
               {host_clause}
             ORDER BY t.cpu_pct DESC NULLS LAST,
                      t.ram_pct DESC NULLS LAST,
                      t.host ASC,
                      t.rank ASC NULLS LAST
             LIMIT :limit
        """), params).mappings().all()
        return {
            "collection_id": collection_id,
            "host": host_value,
            "coverage_scope": coverage_scope,
            "total": total,
            "items": [dict(row) for row in rows],
        }


def sap_job_history(
    consumer_key: str,
    since: datetime,
    host: str | None = None,
    consumer_type: str | None = None,
    limit: int = 200,
) -> dict:
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")

    conditions = ["t.collected_at >= :since", "t.consumer_key = :consumer_key"]
    params: dict = {
        "since": since,
        "consumer_key": consumer_key,
        "limit": limit,
    }
    if host:
        conditions.append("t.host = :host")
        params["host"] = host.upper()
    if consumer_type:
        conditions.append("t.consumer_type = :consumer_type")
        params["consumer_type"] = consumer_type.upper()

    where_sql = " AND ".join(conditions)

    with engine.connect() as conn:
        source, coverage_scope = _source_relation(conn)
        summary_row = conn.execute(text(f"""
            SELECT COUNT(DISTINCT t.collection_id) AS checks,
                   MIN(t.collected_at) AS first_seen,
                   MAX(t.collected_at) AS last_seen,
                   AVG(t.cpu_pct) AS avg_cpu_pct,
                   MAX(t.cpu_pct) AS peak_cpu_pct,
                   AVG(t.ram_pct) AS avg_ram_pct,
                   MAX(t.ram_pct) AS peak_ram_pct,
                   COUNT(DISTINCT t.host) AS server_count
              FROM {source} t
             WHERE {where_sql}
        """), params).mappings().one()

        rows = conn.execute(text(f"""
            SELECT t.collection_id,
                   c.execution_id,
                   t.collected_at,
                   t.host,
                   t.consumer_type,
                   t.consumer_key,
                   t.rank,
                   t.cpu_pct,
                   t.ram_pct,
                   t.details,
                   h.wp_critical AS host_wp_critical
              FROM {source} t
              LEFT JOIN rundeck_collections c
                ON c.collection_id = t.collection_id
              LEFT JOIN rundeck_host_metrics h
                ON h.collection_id = t.collection_id
               AND h.host = t.host
             WHERE {where_sql}
             ORDER BY t.collected_at DESC, t.host ASC
             LIMIT :limit
        """), params)
        items = [dict(row._mapping) for row in rows]

    summary = dict(summary_row)
    return {
        "consumer_key": consumer_key,
        "consumer_type": consumer_type.upper() if consumer_type else (items[0]["consumer_type"] if items else None),
        "host": host.upper() if host else None,
        "checks": int(summary.get("checks") or 0),
        "first_seen": summary.get("first_seen"),
        "last_seen": summary.get("last_seen"),
        "avg_cpu_pct": float(summary["avg_cpu_pct"]) if summary.get("avg_cpu_pct") is not None else None,
        "peak_cpu_pct": float(summary["peak_cpu_pct"]) if summary.get("peak_cpu_pct") is not None else None,
        "avg_ram_pct": float(summary["avg_ram_pct"]) if summary.get("avg_ram_pct") is not None else None,
        "peak_ram_pct": float(summary["peak_ram_pct"]) if summary.get("peak_ram_pct") is not None else None,
        "server_count": int(summary.get("server_count") or 0),
        "coverage_scope": coverage_scope,
        "items": items,
    }

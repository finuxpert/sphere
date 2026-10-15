"""Exact historical investigation from stored SAP host, workload and alert observations."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import text

from backend.db.session import get_engine
from backend.rundeck_job_history import _source_relation

HOST_CAP, WORKLOAD_CAP, ALERT_CAP = 300, 300, 100


def saved_window_observations(start: datetime, end: datetime) -> dict:
    """[start, end): never use latest collection or fill missing intervals."""
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")
    bounds = {"start": start, "end": end}
    with engine.connect() as conn:
        hosts = [dict(row) for row in conn.execute(text("""
            SELECT collection_id, collected_at, host, cpu_pct, ram_pct,
                   io_wait_pct, load_1, wp_critical
              FROM rundeck_host_metrics
             WHERE collected_at >= :start AND collected_at < :end
             ORDER BY collected_at ASC, host ASC
             LIMIT :limit
        """), {**bounds, "limit": HOST_CAP + 1}).mappings().all()]
        source, scope = _source_relation(conn)
        workloads = [dict(row) for row in conn.execute(text(f"""
            SELECT t.collection_id, t.collected_at, t.host,
                   t.consumer_type, t.consumer_key, t.cpu_pct, t.ram_pct, t.details
              FROM {source} t
             WHERE t.collected_at >= :start AND t.collected_at < :end
               AND t.consumer_type IN ('JOB', 'PROGRAM')
             ORDER BY t.collected_at ASC, t.host ASC,
                      t.cpu_pct DESC NULLS LAST
             LIMIT :limit
        """), {**bounds, "limit": WORKLOAD_CAP + 1}).mappings().all()]
        alerts = [dict(row) for row in conn.execute(text("""
            SELECT collection_id, collected_at, host, code, severity, message
              FROM rundeck_alerts
             WHERE collected_at >= :start AND collected_at < :end
             ORDER BY collected_at ASC
             LIMIT :limit
        """), {**bounds, "limit": ALERT_CAP + 1}).mappings().all()]
    return {
        "start": start, "end": end, "end_exclusive": True,
        "host_samples": hosts[:HOST_CAP],
        "workloads": workloads[:WORKLOAD_CAP],
        "alerts": alerts[:ALERT_CAP],
        "limited": {
            "host_samples": len(hosts) > HOST_CAP,
            "workloads": len(workloads) > WORKLOAD_CAP,
            "alerts": len(alerts) > ALERT_CAP,
        },
        "workload_coverage": scope,
        "note": "Saved observations only. Missing samples do not imply NORMAL or DOWN. Workload CPU can exceed 100% (multi-core). SAP job execution status requires SM37.",
    }

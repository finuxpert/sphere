"""Persist all observed SAP Job/Program workload rows from retained RCA-WP snapshots.

This projection intentionally differs from ``rundeck_top_consumers``. Top consumers
remain a bounded performance ranking, while this table retains every JOB/PROGRAM
consumer observed in the already-collected WP snapshot. No additional SAP or Rundeck
collection command is introduced here.
"""
from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy import text

from backend.db.session import db_enabled, get_engine
from backend.rundeck_consumers import parse_top_consumers

# parse_top_consumers accepts an explicit depth without the environment cap. A very
# high bound lets us reuse the canonical aggregation/parser while retaining every
# grouped consumer present in the snapshot. PROCESS rows are filtered out below.
_ALL_GROUPS_DEPTH = 1_000_000
_VALID_TYPES = {"JOB", "PROGRAM"}


def parse_workload_observations(raw: bytes, fallback_time: datetime | None = None) -> list[dict]:
    rows = parse_top_consumers(raw, fallback_time=fallback_time, top_per_host=_ALL_GROUPS_DEPTH)
    output: list[dict] = []
    for row in rows:
        if row.get("consumer_type") not in _VALID_TYPES:
            continue
        details = dict(row.get("details") or {})
        details.pop("persisted_rank_limit", None)
        details["observation_scope"] = "ALL_OBSERVED_ACTIVE_WORKLOADS"
        details["performance_rank"] = int(row.get("rank") or 0) or None
        output.append({
            "host": row.get("host"),
            "collected_at": row.get("collected_at"),
            "consumer_type": row.get("consumer_type"),
            "consumer_key": row.get("consumer_key"),
            "cpu_pct": row.get("cpu_pct"),
            "ram_pct": row.get("ram_pct"),
            "details": details,
        })
    return output


def workload_observation_table_available() -> bool:
    engine = get_engine()
    if engine is None:
        return False
    with engine.connect() as conn:
        return bool(conn.execute(text(
            "SELECT to_regclass('public.rundeck_workload_observations') IS NOT NULL"
        )).scalar())


def persist_workload_observations(
    collection_id: str,
    raw: bytes,
    fallback_time: datetime | None = None,
) -> int:
    if not db_enabled():
        return 0
    engine = get_engine()
    if engine is None:
        return 0

    rows = parse_workload_observations(raw, fallback_time=fallback_time)
    with engine.begin() as conn:
        table_ready = conn.execute(text(
            "SELECT to_regclass('public.rundeck_workload_observations') IS NOT NULL"
        )).scalar()
        if not table_ready:
            raise RuntimeError("rundeck_workload_observations migration is not applied")

        for row in rows:
            conn.execute(text("""
                INSERT INTO rundeck_workload_observations (
                  collection_id, collected_at, host, consumer_type, consumer_key,
                  cpu_pct, ram_pct, details
                ) VALUES (
                  :collection_id, :collected_at, :host, :consumer_type, :consumer_key,
                  :cpu_pct, :ram_pct, CAST(:details AS jsonb)
                )
                ON CONFLICT (collection_id, host, collected_at, consumer_type, consumer_key)
                DO UPDATE SET
                  cpu_pct=EXCLUDED.cpu_pct,
                  ram_pct=EXCLUDED.ram_pct,
                  details=EXCLUDED.details
            """), {
                **row,
                "collection_id": collection_id,
                "details": json.dumps(row["details"]),
            })
    return len(rows)

"""Read-only API for dedicated infrastructure telemetry."""
from __future__ import annotations
import json
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text
from backend.db.session import get_engine
from backend.rundeck_infra_store import ROOT, collections

router = APIRouter(prefix="/infra", tags=["Infrastructure"])

def _latest_manifest():
    rows = collections()
    return rows[0] if rows else None

def _engine():
    engine = get_engine()
    if engine is None:
        raise HTTPException(503, "Infrastructure database history is not enabled")
    return engine

@router.get("/latest")
def latest():
    row = _latest_manifest()
    if not row:
        raise HTTPException(404, "No infrastructure collection available")
    state = ROOT / "poller.json"
    return {**row, "poller": json.loads(state.read_text()) if state.exists() else None}

@router.get("/hosts")
def hosts():
    engine = _engine()
    with engine.connect() as conn:
        rows = conn.execute(text("""
          SELECT DISTINCT ON (host) host, collection_id, snapshot_ts, sample_seconds, status
          FROM rundeck_infra_collections WHERE status='READY'
          ORDER BY host, snapshot_ts DESC
        """))
        return {"items":[dict(row._mapping) for row in rows]}

@router.get("/history")
def history(days:int=Query(7,ge=1,le=90), limit:int=Query(1000,ge=1,le=10000)):
    since=datetime.now(timezone.utc)-timedelta(days=days)
    engine=_engine()
    with engine.connect() as conn:
        rows=conn.execute(text("""
          SELECT collection_id,execution_id,host,status,snapshot_ts,sample_seconds
          FROM rundeck_infra_collections WHERE snapshot_ts>=:since ORDER BY snapshot_ts DESC LIMIT :limit
        """),{"since":since,"limit":limit})
        return {"items":[dict(row._mapping) for row in rows]}

@router.get("/filesystems")
def filesystems(host:str|None=None, primary_only:bool=True):
    engine=_engine()
    clause="AND f.host=:host" if host else ""
    primary="AND f.is_primary=true" if primary_only else ""
    params={"host":host} if host else {}
    with engine.connect() as conn:
        rows=conn.execute(text(f"""
          SELECT f.collection_id,f.host,f.collected_at,f.device,f.mount_point,f.fstype,
                 f.used_pct,f.total_bytes,f.avail_bytes,f.is_primary
          FROM rundeck_infra_filesystems f
          JOIN (SELECT host,MAX(collected_at) ts FROM rundeck_infra_filesystems GROUP BY host) x
            ON x.host=f.host AND x.ts=f.collected_at
          WHERE 1=1 {clause} {primary}
          ORDER BY f.host,f.used_pct DESC NULLS LAST,f.mount_point
        """),params)
        return {"items":[dict(row._mapping) for row in rows]}

def _samples(kind, host=None):
    engine=_engine()
    clause="AND s.host=:host" if host else ""
    params={"host":host,"kind":kind}
    with engine.connect() as conn:
        rows=conn.execute(text(f"""
          SELECT s.collection_id,s.host,s.collected_at,s.sample_key,s.metrics
          FROM rundeck_infra_samples s
          JOIN (SELECT host,kind,MAX(collected_at) ts FROM rundeck_infra_samples WHERE kind=:kind GROUP BY host,kind) x
            ON x.host=s.host AND x.ts=s.collected_at AND x.kind=s.kind
          WHERE s.kind=:kind {clause} ORDER BY s.host,s.sample_key
        """),params)
        return {"items":[dict(row._mapping) for row in rows]}

@router.get("/storage")
def storage(host:str|None=None):
    return _samples("storage",host)

@router.get("/network")
def network(host:str|None=None):
    return _samples("network",host)

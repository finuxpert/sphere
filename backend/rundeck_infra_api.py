"""Read-only API for dedicated infrastructure telemetry."""
from __future__ import annotations
import json
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text
from backend.db.session import get_engine
from backend.rundeck_infra_store import ROOT, collections

router = APIRouter(prefix="/infra", tags=["Infrastructure"])

def _source_for_host(host):
    value = str(host or "").upper()
    if value.endswith("QAPPDC"):
        return "AOQ"
    if value.endswith("PAPPDC"):
        return "AOP PROD"
    return "OTHER"

def _poller_state(source=None):
    path = ROOT / ("poller-aop-prod.json" if source == "aop-prod" else "poller.json")
    return json.loads(path.read_text()) if path.exists() else None

def _latest_manifest(source=None):
    rows = collections()
    if source == "aoq":
        rows = [row for row in rows if _source_for_host(row.get("host")) == "AOQ"]
    elif source == "aop-prod":
        rows = [row for row in rows if _source_for_host(row.get("host")) == "AOP PROD"]
    return rows[0] if rows else None

def _engine():
    engine = get_engine()
    if engine is None:
        raise HTTPException(503, "Infrastructure database history is not enabled")
    return engine

@router.get("/latest")
def latest(source: str | None = Query(None, pattern="^(aoq|aop-prod)$")):
    row = _latest_manifest(source)
    if not row:
        raise HTTPException(404, "No infrastructure collection available")
    source_label = _source_for_host(row.get("host"))
    poller_source = source or ("aop-prod" if source_label == "AOP PROD" else "aoq")
    return {
        **row,
        "source": source_label,
        "poller": _poller_state(poller_source),
    }

@router.get("/hosts")
def hosts():
    engine = _engine()
    with engine.connect() as conn:
        rows = conn.execute(text("""
          SELECT DISTINCT ON (host) host, collection_id, snapshot_ts, sample_seconds, status
          FROM rundeck_infra_collections WHERE status='READY'
          ORDER BY host, snapshot_ts DESC
        """))
        items=[dict(row._mapping) for row in rows]
        for item in items:
            item["source"]=_source_for_host(item.get("host"))
        return {"items":items}

@router.get("/history")
def history(days:int=Query(7,ge=1,le=90), limit:int=Query(1000,ge=1,le=10000)):
    since=datetime.now(timezone.utc)-timedelta(days=days)
    engine=_engine()
    with engine.connect() as conn:
        rows=conn.execute(text("""
          SELECT collection_id,execution_id,host,status,snapshot_ts,sample_seconds
          FROM rundeck_infra_collections WHERE snapshot_ts>=:since ORDER BY snapshot_ts DESC LIMIT :limit
        """),{"since":since,"limit":limit})
        items=[dict(row._mapping) for row in rows]
        for item in items:
            item["source"]=_source_for_host(item.get("host"))
        return {"items":items}

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


RANGE_HOURS = {"1h": 1, "6h": 6, "24h": 24, "7d": 168, "30d": 720}

@router.get("/trend")
def trend(
    range_key: str = Query("6h", alias="range", pattern="^(1h|6h|24h|7d|30d)$"),
    metric: str = Query("filesystem", pattern="^(filesystem|network|storage)$"),
    host: str | None = Query(None, max_length=120),
):
    since = datetime.now(timezone.utc) - timedelta(hours=RANGE_HOURS[range_key])
    engine = _engine()
    params = {"since": since}
    host_clause = ""
    if host:
        host_clause = "AND host=:host"
        params["host"] = host

    with engine.connect() as conn:
        if metric == "filesystem":
            rows = conn.execute(text(f"""
              SELECT host,collected_at,mount_point AS series_key,used_pct AS value,
                     NULL::double precision AS value2
              FROM rundeck_infra_filesystems
              WHERE collected_at>=:since AND is_primary=true {host_clause}
              ORDER BY collected_at,host,mount_point
            """), params)
        elif metric == "network":
            rows = conn.execute(text(f"""
              SELECT host,collected_at,sample_key AS series_key,
                     NULLIF(metrics->>'rx_mbps','')::double precision AS value,
                     NULLIF(metrics->>'tx_mbps','')::double precision AS value2,
                     COALESCE(NULLIF(metrics->>'rx_dropped_delta','')::double precision,0)
                       + COALESCE(NULLIF(metrics->>'tx_dropped_delta','')::double precision,0) AS drop_delta,
                     COALESCE(NULLIF(metrics->>'rx_errors_delta','')::double precision,0)
                       + COALESCE(NULLIF(metrics->>'tx_errors_delta','')::double precision,0) AS error_delta
              FROM rundeck_infra_samples
              WHERE collected_at>=:since AND kind='network' {host_clause}
              ORDER BY collected_at,host,sample_key
            """), params)
        else:
            rows = conn.execute(text(f"""
              SELECT host,collected_at,
                     COALESCE(NULLIF(metrics->>'mount',''),sample_key) AS series_key,
                     NULLIF(metrics->>'util_pct','')::double precision AS value,
                     NULLIF(metrics->>'write_iops','')::double precision AS value2,
                     NULLIF(metrics->>'write_mbps','')::double precision AS write_mbps,
                     NULLIF(metrics->>'read_iops','')::double precision AS read_iops,
                     NULLIF(metrics->>'read_mbps','')::double precision AS read_mbps,
                     CASE
                       WHEN NULLIF(metrics->>'util_pct','')::double precision > 100 THEN 'SOURCE_OVER_100'
                       ELSE 'OK'
                     END AS quality_flag
              FROM rundeck_infra_samples
              WHERE collected_at>=:since AND kind='storage' {host_clause}
              ORDER BY collected_at,host,series_key
            """), params)
        items = [dict(row._mapping) for row in rows]
    first_observed_at = min((item.get("collected_at") for item in items if item.get("collected_at")), default=None)
    last_observed_at = max((item.get("collected_at") for item in items if item.get("collected_at")), default=None)
    return {
        "range": range_key,
        "metric": metric,
        "since": since,
        "first_observed_at": first_observed_at,
        "last_observed_at": last_observed_at,
        "items": items,
    }


# Month-scoped filesystem evidence, intentionally separate from latest snapshots.
# Mount-category mapping must be explicit: do not infer "SAP Archive" from names.
_STORAGE_CATEGORIES = ("File System OS", "FS SAP Archive", "Archive INTF", "INTF")

def _monthly_storage_mapping():
    """JSON: {"File System OS":{"host":"AOPH1PAPPDC","mount":"/"}, ...}.

    A real host+mount pair is required for every mapped category to avoid
    arbitrary host selection when several APP servers share the same mount.
    """
    import os
    raw = os.environ.get("SPHERE_MONTHLY_STORAGE_MOUNTS", "{}")
    try:
        config = json.loads(raw)
    except (ValueError, TypeError) as error:
        raise HTTPException(503, "Invalid monthly storage mount mapping") from error
    if not isinstance(config, dict):
        raise HTTPException(503, "Monthly storage mount mapping must be a JSON object")
    return config


def _storage_used_bytes(row):
    """Recover actual df used_kb from saved raw collector fields, never estimate
    used as total minus available (filesystem reserve blocks make that wrong)."""
    details = row.get("details") or {}
    if not isinstance(details, dict):
        return None
    for key in ("used_bytes",):
        try:
            if details.get(key) is not None:
                n = int(details[key])
                return n if n >= 0 else None
        except (ValueError, TypeError):
            return None
    raw = details.get("_positional") or []
    if raw and str(raw[0]).lower() == "filesystem":
        raw = raw[1:]
    if len(raw) >= 6:
        try:
            kb = int(raw[3])
            return kb * 1024 if kb >= 0 else None
        except (ValueError, TypeError):
            return None
    return None


def monthly_storage_evidence(month: str, conn, mapping: dict):
    from zoneinfo import ZoneInfo
    import re
    if not re.fullmatch(r"20\d{2}-(0[1-9]|1[0-2])", str(month or "")):
        raise ValueError("month must be YYYY-MM")
    year, mon = map(int, month.split("-"))
    wib = ZoneInfo("Asia/Jakarta")
    start = datetime(year, mon, 1, tzinfo=wib).astimezone(timezone.utc)
    end = datetime(year + (mon == 12), mon % 12 + 1, 1, tzinfo=wib).astimezone(timezone.utc)
    if start > datetime.now(timezone.utc):
        raise ValueError("Future reporting month is unavailable")
    # Restrict query to the reported month and committed READY samples.
    rows = conn.execute(text("""
       SELECT f.host, f.mount_point, f.collected_at, f.device, f.fstype,
              f.total_bytes, f.avail_bytes, f.used_pct, f.details
       FROM rundeck_infra_filesystems f
       JOIN rundeck_infra_collections c ON c.collection_id=f.collection_id
       WHERE c.status='READY' AND f.collected_at>=:start AND f.collected_at<:end
         AND c.snapshot_ts>=:start AND c.snapshot_ts<:end
       ORDER BY f.collected_at DESC, f.host, f.mount_point
    """), {"start": start, "end": end}).mappings().all()
    observed = {}
    for row in rows:
        key = (str(row["host"]).upper(), str(row["mount_point"]))
        if key not in observed:
            observed[key] = dict(row)
    result = []
    for category in _STORAGE_CATEGORIES:
        target = mapping.get(category)
        host = str(target.get("host") or "").upper() if isinstance(target, dict) else ""
        mount = str(target.get("mount") or "") if isinstance(target, dict) else ""
        source = observed.get((host, mount)) if host and mount else None
        total = source.get("total_bytes") if source else None
        free = source.get("avail_bytes") if source else None
        used = _storage_used_bytes(source) if source else None
        pct = source.get("used_pct") if source else None
        complete = all(isinstance(n, (int, float)) and n >= 0
                       for n in (total, free, used, pct)) and total > 0 and used <= total
        result.append({
            "category": category,
            "status": "COLLECTED" if complete else "NOT_COLLECTED",
            "host": host or None, "mount_point": mount or None,
            "total_bytes": total if complete else None,
            "used_bytes": used if complete else None,
            "free_bytes": free if complete else None,
            "used_pct": pct if complete else None,
            "sample_at": source.get("collected_at") if source and complete else None,
            "source": "rundeck_infra_filesystems",
        })
    return {"month": month, "timezone": "Asia/Jakarta",
            "source": "rundeck_infra_filesystems", "items": result}


@router.get("/monthly-storage")
def monthly_storage(month: str = Query(..., pattern=r"^20\d{2}-(0[1-9]|1[0-2])$")):
    engine = _engine()
    try:
        with engine.connect() as conn:
            return monthly_storage_evidence(month, conn, _monthly_storage_mapping())
    except ValueError as error:
        raise HTTPException(422, str(error)) from error

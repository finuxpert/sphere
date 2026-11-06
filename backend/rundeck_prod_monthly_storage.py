"""Monthly storage evidence for PROD report compatibility. Read-only."""
from __future__ import annotations
import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text
from backend.db.session import get_engine

router = APIRouter(prefix="/infra", tags=["Read-only PROD reporting"])

def _engine():
    engine = get_engine()
    if engine is None:
        raise HTTPException(503, "Infrastructure database history is not enabled")
    return engine

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



def _storage_explicit_available_bytes(row):
    """Return source-observed df Available, never legacy Total minus Used.

    The old positional filesystem collector stored only size, used, Use%
    and mount. Its database avail_bytes may be computed by the parser and
    cannot be presented as real df Available. New collector lines retain
    avail_kb=<df column 5> (or explicit byte variants) in JSON details.
    """
    details = row.get("details") or {}
    if not isinstance(details, dict):
        return None
    for key, factor in (("avail_bytes", 1), ("available_bytes", 1),
                        ("avail_kb", 1024), ("available_kb", 1024)):
        raw = details.get(key)
        if raw is None:
            continue
        try:
            n = int(raw)
        except (ValueError, TypeError):
            return None
        return n * factor if n >= 0 else None
    return None

def monthly_storage_evidence(month: str, conn, mapping: dict, week_start: str | None = None, start_date: str | None = None, end_date: str | None = None):
    """Report only independently verified, month-scoped infrastructure samples.

    Preserve the difference between absent mapping, no historical samples, a
    missing mapped mount and partial source data. No current-month fallback.
    """
    from zoneinfo import ZoneInfo
    import re
    if not re.fullmatch(r"20\d{2}-(0[1-9]|1[0-2])", str(month or "")):
        raise ValueError("month must be YYYY-MM")
    year, mon = map(int, month.split("-"))
    wib = ZoneInfo("Asia/Jakarta")
    start = datetime(year, mon, 1, tzinfo=wib).astimezone(timezone.utc)
    end = datetime(year + (mon == 12), mon % 12 + 1, 1, tzinfo=wib).astimezone(timezone.utc)
    if bool(start_date) != bool(end_date) or (week_start and start_date):
        raise ValueError("Custom dates must be paired and cannot be combined with week_start")
    if start_date:
        from backend.rundeck_prod_compat_evaluation import calendar_custom_bounds
        if not start_date.startswith(month + "-"):
            raise ValueError("Selected month must match custom range start")
        start, end, _previous_start = calendar_custom_bounds(start_date, end_date)
    elif week_start:
        from backend.rundeck_prod_compat_evaluation import calendar_week_bounds
        if not week_start.startswith(month + "-"):
            raise ValueError("Week start must belong to selected month")
        start, end, _previous_start = calendar_week_bounds(week_start)
    if start > datetime.now(timezone.utc):
        raise ValueError("Future reporting period is unavailable")
    # Only READY collection records in the same exact WIB month.
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
    mapped_count = 0
    for category in _STORAGE_CATEGORIES:
        target = mapping.get(category)
        host = str(target.get("host") or "").strip().upper() if isinstance(target, dict) else ""
        mount = str(target.get("mount") or "").strip() if isinstance(target, dict) else ""
        configured = bool(host and mount)
        if configured:
            mapped_count += 1
        source = observed.get((host, mount)) if configured else None
        total = source.get("total_bytes") if source else None
        free = _storage_explicit_available_bytes(source) if source else None
        used = _storage_used_bytes(source) if source else None
        pct = source.get("used_pct") if source else None
        complete = (source is not None and
                    all(isinstance(n, (int, float)) and n >= 0
                        for n in (total, used, pct)) and
                    total > 0 and used <= total and 0 <= pct <= 100)
        observed_available = (isinstance(free, (int, float)) and
                              0 <= free <= total) if complete else False
        if complete:
            reason = None
        elif not configured:
            reason = "MAPPING_NOT_CONFIGURED"
        elif not rows:
            reason = "NO_CUSTOM_INFRA_HISTORY" if start_date else "NO_WEEKLY_INFRA_HISTORY" if week_start else "NO_MONTHLY_INFRA_HISTORY"
        elif not source:
            reason = "MAPPED_MOUNT_NOT_COLLECTED"
        else:
            reason = "INCOMPLETE_FILESYSTEM_FIELDS"
        result.append({
            "category": category,
            "status": "COLLECTED" if complete else "NOT_COLLECTED",
            "reason": reason,
            "host": host or None, "mount_point": mount or None,
            "total_bytes": total if complete else None,
            "used_bytes": used if complete else None,
            "free_bytes": free if observed_available else None,
            "availability_source": "EXPLICIT" if observed_available else "NOT_RETAINED",
            "used_pct": pct if complete else None,
            "sample_at": source.get("collected_at") if source and complete else None,
            "source": "rundeck_infra_filesystems",
        })
    return {
        "month": month,
        "week_start": week_start,
        "start_date": start_date, "end_date": end_date,
        "period": "custom" if start_date else "week" if week_start else "month",
        "timezone": "Asia/Jakarta",
        "source": "rundeck_infra_filesystems",
        "source_rows": len(rows),
        "distinct_mounts": len(observed),
        "configured_categories": mapped_count,
        "items": result,
    }


@router.get("/monthly-storage")
def monthly_storage(month: str = Query(..., pattern=r"^20\d{2}-(0[1-9]|1[0-2])$"),
    week_start: str | None = Query(None, pattern=r"^20[0-9]{2}-[0-9]{2}-[0-9]{2}$"),
    start_date: str | None = Query(None, pattern=r"^20[0-9]{2}-[0-9]{2}-[0-9]{2}$"),
    end_date: str | None = Query(None, pattern=r"^20[0-9]{2}-[0-9]{2}-[0-9]{2}$"),
):
    engine = _engine()
    try:
        with engine.connect() as conn:
            return monthly_storage_evidence(month, conn, _monthly_storage_mapping(), week_start=week_start, start_date=start_date, end_date=end_date)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error

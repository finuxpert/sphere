"""Isolated PROD compatibility routes for the approved DEV frontend.
Read-only APIs only; existing PROD endpoints and scheduler remain unchanged.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
from fastapi import APIRouter, HTTPException, Query
from backend import rundeck_api_core as _core
from backend.rundeck_monitoring import RETENTION_DAYS
from backend.rundeck_prod_compat_evaluation import evaluation_report, monthly_host_preview
from backend.rundeck_prod_trends_compat import (
    resolve_range, previous_calendar_month, trend_series_bundle, validate_custom_window,
)
from backend.rundeck_time_window import saved_window_observations
from backend.rundeck_workload_activity import workload_activity_trends
from backend.rundeck_top_consumers import top_consumers_window

router = APIRouter(tags=["Read-only PROD compatibility"])
_latest_ready = _core._latest_ready
STALE_MINUTES = _core.STALE_MINUTES

def _parse_custom_timestamp(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError("Invalid custom timestamp") from None
    if parsed.tzinfo is None:
        raise ValueError("Custom timestamp requires timezone offset")
    return parsed

@router.get("/history/window")
def history_window_endpoint(
    from_at: str = Query(..., max_length=64),
    to_at: str = Query(..., max_length=64),
):
    try:
        since, until = validate_custom_window(_parse_custom_timestamp(from_at), _parse_custom_timestamp(to_at))
        return saved_window_observations(since, until)
    except ValueError as error:
        raise HTTPException(400, str(error)) from None
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Custom window evidence unavailable: {type(error).__name__}") from None

@router.get("/history/workload/activity")
def workload_activity_endpoint(
    range_key: str = Query("24h", alias="range", pattern="^(6h|24h)$"),
):
    try:
        return workload_activity_trends(range_key=range_key)
    except ValueError as error:
        raise HTTPException(400, str(error)) from None
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Workload activity unavailable: {type(error).__name__}") from None

@router.get("/evaluation/top-consumers")
def evaluation_top_consumers_endpoint(
    range_key: str = Query("24h", alias="range", pattern="^(30m|1h|6h|24h|custom)$"),
    from_at: str | None = Query(None, max_length=64),
    to_at: str | None = Query(None, max_length=64),
):
    try:
        return top_consumers_window(range_key, from_at=from_at, to_at=to_at)
    except ValueError as error:
        raise HTTPException(400, str(error)) from None
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Top consumers unavailable: {type(error).__name__}") from None

@router.get("/evaluation/workloads/monthly")
def monthly_workload_evaluation(
    month: str = Query(..., pattern=r"^20[0-9]{2}-(0[1-9]|1[0-2])$"),
    week_start: str | None = Query(None, pattern=r"^20[0-9]{2}-[0-9]{2}-[0-9]{2}$"),
    start_date: str | None = Query(None, pattern=r"^20[0-9]{2}-[0-9]{2}-[0-9]{2}$"),
    end_date: str | None = Query(None, pattern=r"^20[0-9]{2}-[0-9]{2}-[0-9]{2}$"),
    consumer_type: str = Query("ALL", alias="type", pattern="^(ALL|JOB|PROGRAM)$"),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0, le=100000),
    q: str = Query("", max_length=512),
    health: str = Query("ALL", pattern="^(ALL|REVIEW|ATTENTION|NORMAL|UNKNOWN)$"),
    pressure: str = Query("ALL", pattern="^(ALL|CPU|RAM|WP)$"),
    flag: str = Query("ALL", pattern="^(ALL|HIGH_CPU|HIGH_MEMORY|RECURRING)$"),
):
    """Calendar-month workload observations for the SPHERE-only manual Basis report."""
    try:
        return evaluation_report(
            period="custom" if start_date or end_date else "week" if week_start else "month", consumer_type=consumer_type, limit=limit,
            offset=offset, query=q, health=health, month=month, pressure=pressure, flag=flag,
            week_start=week_start, start_date=start_date, end_date=end_date,
        )
    except ValueError as error:
        raise HTTPException(400, str(error)) from None
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Monthly performance evaluation unavailable: {type(error).__name__}") from None

@router.get("/evaluation/workloads/monthly/hosts")
def monthly_workload_hosts(
    month: str = Query(..., pattern=r"^20[0-9]{2}-(0[1-9]|1[0-2])$"),
    week_start: str | None = Query(None, pattern=r"^20[0-9]{2}-[0-9]{2}-[0-9]{2}$"),
    start_date: str | None = Query(None, pattern=r"^20[0-9]{2}-[0-9]{2}-[0-9]{2}$"),
    end_date: str | None = Query(None, pattern=r"^20[0-9]{2}-[0-9]{2}-[0-9]{2}$"),
):
    """Read-only, host-only summary; does not claim workload evaluations are ready."""
    try:
        return monthly_host_preview(month, week_start=week_start, start_date=start_date, end_date=end_date)
    except ValueError as error:
        raise HTTPException(400, str(error)) from None
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Monthly host summary unavailable: {type(error).__name__}") from None

@router.get("/history/trends")
def history_trend_bundle(
    metrics: str = Query("cpu,ram,wp", min_length=3, max_length=40),
    range_key: str = Query("24h", alias="range", pattern="^(custom|30m|1h|3h|6h|24h|7d|30d|90d|180d|last_month)$"),
    bucket: str = Query("auto", pattern="^(auto|10m|30m|1h|6h|1d)$"),
    from_at: str | None = Query(None, max_length=64),
    to_at: str | None = Query(None, max_length=64),
):
    """Share a single host-metric SQL scan across selected chart panels."""
    try:
        metric_keys = metrics.split(",")
        if (not 1 <= len(metric_keys) <= 4
                or len(set(metric_keys)) != len(metric_keys)
                or any(key not in {"cpu", "ram", "wp", "load", "iowait", "swap"} for key in metric_keys)):
            raise ValueError("metrics must list 1-4 unique host metrics")
        range_config = resolve_range(range_key)
        until = None
        if range_key == "custom":
            if not from_at or not to_at or bucket != "auto":
                raise ValueError("Custom requires from_at, to_at and bucket=auto")
            since, until = validate_custom_window(
                datetime.fromisoformat(from_at.replace("Z", "+00:00")),
                datetime.fromisoformat(to_at.replace("Z", "+00:00")),
            )
        else:
            if from_at or to_at:
                raise ValueError("Explicit dates require range=custom")
            if range_key == "last_month":
                since, until = previous_calendar_month()
            else:
                since = datetime.now(timezone.utc) - timedelta(hours=range_config["hours"])
        series = trend_series_bundle(since, range_key, bucket, metric_keys, until=until)
        latest_row = _latest_ready()
        for value in series.values():
            value.update({
                "timezone": "Asia/Jakarta",
                "requested_window_start": since,
                "requested_window_end": until or datetime.now(timezone.utc),
                "configured_retention_days": RETENTION_DAYS,
                "requested_days": round(((until or datetime.now(timezone.utc)) - since).total_seconds() / 86400, 2),
                "latest_collection_at": (latest_row or {}).get("finished_at"),
                "stale_after_minutes": STALE_MINUTES,
                "collection_cadence_seconds": max(60, int(os.getenv("SPHERE_COLLECTION_CADENCE_SECONDS", "600"))),
            })
        return {"series": series, "metrics": metric_keys}
    except ValueError as error:
        raise HTTPException(400, str(error)) from None
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Trend bundle unavailable: {type(error).__name__}") from None

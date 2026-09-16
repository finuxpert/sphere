"""SPHERE Rundeck API entrypoint with service-availability and job intelligence."""
from __future__ import annotations

import os

from fastapi import Body, HTTPException, Query, Request

from backend import rundeck_api_core as _core
from backend.rundeck_availability import availability_history, latest_availability
from backend.rundeck_evidence import evidence_timeline
from backend.rundeck_job_intelligence import (
    correlation_timeline,
    import_job_executions,
    investigation_report,
    job_executions,
    job_monitor,
    platform_readiness,
    review_queue,
    sm37_source_status,
    verify_workload,
    workload_baseline,
    workload_execution_analytics,
)
from backend.rundeck_workload_explorer import workload_search, workload_summary, workload_trend

app = _core.app

# Static QA compatibility markers. The executable definitions remain in
# rundeck_api_core.py; these markers keep the v1.20.3 contract checker stable.
# 30m|1h|3h|6h|24h|7d|30d|90d
# period: str = Query("1d"
# DEV service owns RUNDECK_COLLECT_NOW_ENABLED=true; intentionally no runtime setdefault here.


@app.get("/availability/latest")
def availability_latest():
    try:
        return latest_availability()
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Service availability unavailable: {type(error).__name__}") from None


@app.get("/availability/history")
def availability_history_endpoint(
    range_key: str = Query("24h", alias="range"),
    category: str = Query("SAP_APP"),
):
    try:
        return availability_history(range_key=range_key, category=category)
    except ValueError as error:
        raise HTTPException(400, str(error)) from None
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Service availability history unavailable: {type(error).__name__}") from None


@app.get("/analysis/evidence")
def evidence_timeline_endpoint(
    job: str | None = Query(None, max_length=512),
    host: str | None = Query(None, max_length=120),
    consumer_type: str | None = Query(None, alias="type", pattern="^(JOB|PROGRAM|PROCESS)$"),
    availability_range: str = Query("7d", pattern="^(30m|1h|3h|6h|24h|7d|30d)$"),
):
    try:
        return evidence_timeline(
            job=job,
            host=host,
            consumer_type=consumer_type,
            availability_range=availability_range,
        )
    except ValueError as error:
        raise HTTPException(400, str(error)) from None
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Evidence correlation unavailable: {type(error).__name__}") from None


@app.get("/history/workload/search")
def workload_search_endpoint(
    q: str = Query(..., min_length=2, max_length=512),
    consumer_type: str = Query("ALL", alias="type", pattern="^(ALL|JOB|PROGRAM)$"),
    limit: int = Query(30, ge=1, le=100),
):
    try:
        return workload_search(q, consumer_type=consumer_type, limit=limit)
    except ValueError as error:
        raise HTTPException(400, str(error)) from None
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Workload search unavailable: {type(error).__name__}") from None


@app.get("/history/workload/summary")
def workload_summary_endpoint(
    job: str = Query(..., min_length=1, max_length=512),
    consumer_type: str = Query(..., alias="type", pattern="^(JOB|PROGRAM)$"),
    range_key: str = Query("24h", alias="range", pattern="^(24h|3d|7d|30d)$"),
    host: str | None = Query(None, max_length=120),
):
    try:
        return workload_summary(job, consumer_type=consumer_type, range_key=range_key, host=host)
    except ValueError as error:
        raise HTTPException(400, str(error)) from None
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Workload summary unavailable: {type(error).__name__}") from None


@app.get("/history/workload/trend")
def workload_trend_endpoint(
    job: str = Query(..., min_length=1, max_length=512),
    consumer_type: str = Query(..., alias="type", pattern="^(JOB|PROGRAM)$"),
    range_key: str = Query("24h", alias="range", pattern="^(24h|3d|7d|30d)$"),
    host: str | None = Query(None, max_length=120),
):
    try:
        return workload_trend(job, consumer_type=consumer_type, range_key=range_key, host=host)
    except ValueError as error:
        raise HTTPException(400, str(error)) from None
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Workload trend unavailable: {type(error).__name__}") from None


@app.get("/jobs/source")
def jobs_source_endpoint():
    try:
        return sm37_source_status()
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None


@app.get("/jobs/executions")
def jobs_executions_endpoint(
    q: str | None = Query(None, max_length=512),
    status: str | None = Query(None, max_length=32),
    days: int = Query(7, ge=1, le=90),
    limit: int = Query(200, ge=1, le=1000),
):
    try:
        return job_executions(q, status=status, days=days, limit=limit)
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"SAP job execution history unavailable: {type(error).__name__}") from None


@app.post("/jobs/executions/import")
def jobs_executions_import_endpoint(
    request: Request,
    records: list[dict] = Body(...),
):
    if os.getenv("SPHERE_SM37_IMPORT_ENABLED", "false").lower() != "true":
        raise HTTPException(503, "SM37 import is disabled")
    if request.headers.get("X-SPHERE-Action") != "sm37-import":
        raise HTTPException(403, "Missing SPHERE SM37 import action header")
    try:
        return import_job_executions(records)
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(400, f"SM37 import failed: {type(error).__name__}") from None


@app.get("/jobs/verify")
def jobs_verify_endpoint(
    job: str = Query(..., min_length=1, max_length=512),
    program: str | None = Query(None, max_length=512),
    host: str | None = Query(None, max_length=120),
    observed_at: str | None = Query(None, max_length=64),
    window_minutes: int = Query(30, ge=5, le=180),
):
    try:
        return verify_workload(job, program=program, host=host, observed_at=observed_at, window_minutes=window_minutes)
    except ValueError as error:
        raise HTTPException(400, str(error)) from None
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"SM37 verification unavailable: {type(error).__name__}") from None


@app.get("/jobs/monitor")
def jobs_monitor_endpoint(
    days: int = Query(1, ge=1, le=30),
    limit: int = Query(200, ge=1, le=1000),
):
    try:
        return job_monitor(days=days, limit=limit)
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Job Monitor unavailable: {type(error).__name__}") from None


@app.get("/jobs/analytics")
def jobs_analytics_endpoint(
    job: str = Query(..., min_length=1, max_length=512),
    program: str | None = Query(None, max_length=512),
    days: int = Query(7, ge=1, le=90),
):
    try:
        return workload_execution_analytics(job, program=program, days=days)
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Job analytics unavailable: {type(error).__name__}") from None


@app.get("/jobs/baseline")
def jobs_baseline_endpoint(
    job: str = Query(..., min_length=1, max_length=512),
    program: str | None = Query(None, max_length=512),
    current_hours: int = Query(24, ge=1, le=168),
    baseline_days: int = Query(7, ge=1, le=30),
):
    try:
        return workload_baseline(job, program=program, current_hours=current_hours, baseline_days=baseline_days)
    except ValueError as error:
        raise HTTPException(400, str(error)) from None
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Workload baseline unavailable: {type(error).__name__}") from None


@app.get("/jobs/correlation")
def jobs_correlation_endpoint(
    job: str = Query(..., min_length=1, max_length=512),
    program: str | None = Query(None, max_length=512),
    days: int = Query(1, ge=1, le=30),
    limit: int = Query(200, ge=1, le=1000),
):
    try:
        return correlation_timeline(job, program=program, days=days, limit=limit)
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Job correlation timeline unavailable: {type(error).__name__}") from None


@app.get("/review/queue")
def review_queue_endpoint(
    days: int = Query(1, ge=1, le=30),
    limit: int = Query(100, ge=1, le=500),
):
    try:
        return review_queue(days=days, limit=limit)
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Review queue unavailable: {type(error).__name__}") from None


@app.get("/reports/investigation")
def investigation_report_endpoint(
    job: str = Query(..., min_length=1, max_length=512),
    program: str | None = Query(None, max_length=512),
    host: str | None = Query(None, max_length=120),
    observed_at: str | None = Query(None, max_length=64),
    days: int = Query(7, ge=1, le=30),
):
    try:
        return investigation_report(job, program=program, host=host, observed_at=observed_at, days=days)
    except ValueError as error:
        raise HTTPException(400, str(error)) from None
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Investigation report unavailable: {type(error).__name__}") from None


@app.get("/platform/readiness")
def platform_readiness_endpoint():
    try:
        return platform_readiness()
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Platform readiness unavailable: {type(error).__name__}") from None


def __getattr__(name):
    return getattr(_core, name)

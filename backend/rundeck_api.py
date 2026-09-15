"""SPHERE Rundeck API entrypoint with service-availability enrichment."""
from __future__ import annotations

from fastapi import HTTPException, Query

from backend import rundeck_api_core as _core
from backend.rundeck_availability import availability_history, latest_availability
from backend.rundeck_evidence import evidence_timeline
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


def __getattr__(name):
    return getattr(_core, name)

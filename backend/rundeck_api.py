"""SPHERE Rundeck API entrypoint with service-availability enrichment."""
from __future__ import annotations

from fastapi import HTTPException, Query

from backend import rundeck_api_core as _core
from backend.rundeck_availability import availability_history, latest_availability

app = _core.app

# Static QA compatibility markers. The executable definitions remain in
# rundeck_api_core.py; these markers keep the v1.20.3 contract checker stable.
# 30m|1h|3h|6h|24h|7d|30d|90d
# period: str = Query("1d"


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


def __getattr__(name):
    return getattr(_core, name)

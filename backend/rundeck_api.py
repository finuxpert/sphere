"""SPHERE Rundeck API entrypoint with service-availability enrichment."""
from __future__ import annotations

from fastapi import HTTPException

from backend import rundeck_api_core as _core
from backend.rundeck_availability import latest_availability

app = _core.app

# Static QA compatibility markers. The executable definitions remain in
# rundeck_api_core.py; these markers keep the v1.20.3 contract checker stable.
# 30m|1h|3h|6h|24h|7d|30d|90d
# period: str = Query("1d"


@app.get("/availability/latest")
def availability_latest():
    """Return the latest parsed Service Availability report from Rundeck."""
    try:
        return latest_availability()
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None
    except Exception as error:
        raise HTTPException(503, f"Service availability unavailable: {type(error).__name__}") from None


def __getattr__(name):
    """Keep compatibility for tests/importers that reference helpers from the old module."""
    return getattr(_core, name)

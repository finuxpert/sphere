"""Prometheus exposition for SPHERE collector reliability signals."""
from __future__ import annotations
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from prometheus_client import CollectorRegistry, Gauge, generate_latest
from prometheus_client.exposition import CONTENT_TYPE_LATEST
from backend.rundeck_store import collections


def _json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text()) if path.is_file() else {}
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def _parse(value) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def render_metrics(root: Path):
    registry = CollectorRegistry(auto_describe=True)
    age_g = Gauge("sphere_collection_age_seconds", "Age of latest READY collection", registry=registry)
    stale_g = Gauge("sphere_collector_stale", "1 when latest collection is stale", registry=registry)
    running_g = Gauge("sphere_rundeck_execution_running_seconds", "Current collector execution duration", registry=registry)
    stuck_g = Gauge("sphere_rundeck_execution_stuck", "1 when watchdog reports stuck collector", registry=registry)
    abort_g = Gauge("sphere_watchdog_auto_abort_total", "Persisted watchdog auto-abort count", registry=registry)
    success_g = Gauge("sphere_ingestion_success_total", "Persisted successful ingestion count", registry=registry)
    failure_g = Gauge("sphere_ingestion_failure_total", "Persisted ingestion failure count", registry=registry)
    latest = next((row for row in collections(root) if row.get("status") == "READY"), None)
    finished = _parse((latest or {}).get("finished_at"))
    age = max(0, int((datetime.now(timezone.utc) - finished.astimezone(timezone.utc)).total_seconds())) if finished else 0
    stale_after = max(1, int(os.getenv("RUNDECK_STALE_MINUTES", "20"))) * 60
    watchdog = _json(root / "watchdog.json"); stats = _json(root / "poller-stats.json")
    status = str(watchdog.get("status") or "").upper()
    age_g.set(age); stale_g.set(1 if finished is None or age >= stale_after else 0)
    running_g.set(float(watchdog.get("running_duration_seconds") or 0))
    stuck_g.set(1 if status in {"WARNING", "CRITICAL", "RECOVERY_FAILED", "ERROR"} else 0)
    abort_g.set(int(watchdog.get("auto_abort_total") or 0))
    success_g.set(int(stats.get("success_total") or 0)); failure_g.set(int(stats.get("failure_total") or 0))
    return generate_latest(registry), CONTENT_TYPE_LATEST

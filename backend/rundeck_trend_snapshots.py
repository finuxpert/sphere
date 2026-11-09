"""Opt-in DEV-only historical trend snapshots. Reads never mutate PostgreSQL.

A separate worker precomputes expensive 90D/180D history; the API reads only
recent atomic snapshots, falling back to the existing source-backed SQL.
Short/live and custom windows are deliberately excluded.
"""
from __future__ import annotations

import gzip
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi.encoders import jsonable_encoder
from sqlalchemy.engine import make_url

SCHEMA = 1
CONTRACT = "SPHERE_HISTORICAL_TRENDS_V1"
DEFAULT_DIR = "/var/lib/sphere/trend-snapshots-dev"
RANGES = frozenset({"90d", "180d"})
METRICS = frozenset({"cpu,ram,wp", "network_rx", "network_tx"})
MAX_COMPRESSED_BYTES = 5 * 1024 * 1024
MAX_JSON_BYTES = 12 * 1024 * 1024


def enabled() -> bool:
    if os.getenv("SPHERE_TREND_SNAPSHOT_DEV", "").strip().lower() != "true":
        return False
    if os.getenv("DB_MODE", "file").strip().lower() not in {"db", "hybrid"}:
        return False
    try:
        return make_url(os.getenv("DATABASE_URL", "")).database == "sphere_rundeck_dev"
    except Exception:
        return False


def _path(range_key: str, metric_key: str) -> Path:
    if range_key not in RANGES or metric_key not in METRICS:
        raise ValueError("Unsupported historical snapshot scope")
    label = "host-cpu-ram-wp" if metric_key == "cpu,ram,wp" else metric_key
    return Path(os.getenv("SPHERE_TREND_SNAPSHOT_DIR", DEFAULT_DIR)) / (
        f"trend-{range_key}-{label}-v{SCHEMA}.json.gz"
    )


def _valid(payload: object, range_key: str, metric_key: str) -> bool:
    if not isinstance(payload, dict):
        return False
    if metric_key == "cpu,ram,wp":
        return (payload.get("metrics") == ["cpu", "ram", "wp"]
                and isinstance(payload.get("series"), dict)
                and all(isinstance(payload["series"].get(metric), dict)
                        and payload["series"][metric].get("metric") == metric
                        and payload["series"][metric].get("range") == range_key
                        and payload["series"][metric].get("bucket") == "1d"
                        and isinstance(payload["series"][metric].get("items"), list)
                        for metric in ("cpu", "ram", "wp")))
    return (payload.get("metric") == metric_key
            and payload.get("range") == range_key
            and payload.get("bucket") == "1d"
            and isinstance(payload.get("items"), list))


def load(range_key: str, metric_key: str) -> tuple[dict, dict] | None:
    """Read only a recent validated DEV snapshot; never use in worker mode."""
    if not enabled() or os.getenv("SPHERE_TREND_SNAPSHOT_WORKER") == "true":
        return None
    try:
        path = _path(range_key, metric_key)
        if not path.is_file() or path.stat().st_size > MAX_COMPRESSED_BYTES:
            return None
        with gzip.open(path, "rb") as fh:
            raw = fh.read(MAX_JSON_BYTES + 1)
        if len(raw) > MAX_JSON_BYTES:
            return None
        envelope = json.loads(raw)
        meta, payload = envelope["meta"], envelope["payload"]
        if (not isinstance(meta, dict)
                or meta.get("schema") != SCHEMA
                or meta.get("contract") != CONTRACT
                or meta.get("range") != range_key
                or meta.get("metric") != metric_key
                or not _valid(payload, range_key, metric_key)):
            return None
        generated = datetime.fromisoformat(meta["generated_at"].replace("Z", "+00:00"))
        if generated.tzinfo is None:
            return None
        age = (datetime.now(timezone.utc) - generated).total_seconds()
        max_age = max(60, min(1800, int(
            os.getenv("SPHERE_TREND_SNAPSHOT_MAX_AGE_SECONDS", "390")
        )))
        if age < -30 or age > max_age:
            return None
        return payload, {
            "status": "FRESH",
            "generated_at": meta["generated_at"],
            "age_seconds": round(max(age, 0), 1),
            "source": "SERVER_PRECOMPUTE",
        }
    except (OSError, ValueError, KeyError, TypeError, UnicodeError, EOFError,
            gzip.BadGzipFile, OverflowError):
        return None


def save(range_key: str, metric_key: str, payload: dict) -> Path:
    """Atomic write restricted to a DEV worker with explicit database guard."""
    if not enabled() or os.getenv("SPHERE_TREND_SNAPSHOT_WORKER") != "true":
        raise RuntimeError("Refusing historical snapshot write outside DEV worker")
    if not _valid(payload, range_key, metric_key):
        raise ValueError("Invalid or incomplete historical trend contract")
    path = _path(range_key, metric_key)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
    meta = {
        "schema": SCHEMA, "contract": CONTRACT,
        "range": range_key, "metric": metric_key,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    raw = json.dumps(
        {"meta": meta, "payload": jsonable_encoder(payload)},
        ensure_ascii=False, separators=(",", ":"), allow_nan=False,
    ).encode("utf-8")
    if len(raw) > MAX_JSON_BYTES:
        raise ValueError("Historical snapshot exceeds safety limit")
    compressed = gzip.compress(raw, compresslevel=4)
    if len(compressed) > MAX_COMPRESSED_BYTES:
        raise ValueError("Compressed historical snapshot exceeds safety limit")
    fd, temporary = tempfile.mkstemp(prefix=".sphere-trend-", suffix=".tmp", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as out:
            out.write(compressed)
            out.flush()
            os.fsync(out.fileno())
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return path

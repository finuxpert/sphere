"""DEV-only on-disk full-population calendar report snapshots.

Only the separate precompute worker writes files; FastAPI reads them under a
read-only systemd sandbox. No table, migration or production service changes.
"""
from __future__ import annotations

import gzip
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy.engine import make_url

SCHEMA = 1
CONTRACT = "SPHERE_CALENDAR_REPORT_V1"
DEFAULT_DIR = "/var/lib/sphere/report-snapshots-dev"
MAX_COMPRESSED_BYTES = 20 * 1024 * 1024
MAX_JSON_BYTES = 80 * 1024 * 1024


def enabled() -> bool:
    if os.getenv("SPHERE_REPORT_SNAPSHOT_DEV", "").strip().lower() != "true":
        return False
    if os.getenv("DB_MODE", "file").strip().lower() not in {"db", "hybrid"}:
        return False
    try:
        return make_url(os.getenv("DATABASE_URL", "")).database == "sphere_rundeck_dev"
    except Exception:
        return False


def scope_label(period: str, month: str, week_start: str | None = None) -> str:
    if period == "month" and re.fullmatch(r"20\d{2}-(0[1-9]|1[0-2])", month or ""):
        return month
    if period == "week" and re.fullmatch(r"20\d{2}-\d{2}-\d{2}", week_start or ""):
        date = datetime.fromisoformat(week_start)
        if date.weekday() != 0 or not week_start.startswith(month + "-"):
            raise ValueError("Invalid WIB reporting week")
        return week_start
    raise ValueError("Only validated calendar months and weeks are supported")


def strategy_name(split_distinct: bool) -> str:
    return "split_distinct" if split_distinct else "baseline"


def _path(period: str, label: str, strategy: str) -> Path:
    if period not in {"month", "week"} or strategy not in {"split_distinct", "baseline"}:
        raise ValueError("Invalid snapshot scope or SQL strategy")
    month = label[:7]
    scope_label(period, month, label if period == "week" else None)
    return Path(os.getenv("SPHERE_REPORT_SNAPSHOT_DIR", DEFAULT_DIR)) / (
        f"{period}-{label}-{strategy}-v{SCHEMA}.json.gz"
    )


def load(
    period: str, label: str, strategy: str, anchor: str, *,
    allow_stale: bool = True,
) -> tuple[dict[str, Any], dict[str, Any]] | None:
    """Return valid snapshot + explicit freshness metadata, or fail closed to SQL.

    An out-of-date snapshot may be shown for a bounded time, but never silently:
    callers must expose metadata.status=STALE and the actual data timestamp.
    """
    if not enabled():
        return None
    try:
        path = _path(period, label, strategy)
        if not path.is_file() or path.stat().st_size > MAX_COMPRESSED_BYTES:
            return None
        with gzip.open(path, "rb") as fh:
            raw = fh.read(MAX_JSON_BYTES + 1)
        if len(raw) > MAX_JSON_BYTES:
            return None
        envelope = json.loads(raw)
        meta = envelope["meta"]
        report = envelope["report"]
        if not isinstance(meta, dict) or not isinstance(report, dict):
            return None
        if (
            meta.get("schema") != SCHEMA
            or meta.get("contract") != CONTRACT
            or meta.get("period") != period
            or meta.get("label") != label
            or meta.get("strategy") != strategy
            or not isinstance(meta.get("anchor"), str)
            or report.get("period") != period
            or report.get("month") != label[:7]
            or (period == "week" and report.get("week_start") != label)
            or not isinstance(report.get("items"), list)
            or not isinstance(report.get("summary"), dict)
        ):
            return None
        saved_at = datetime.fromisoformat(meta["generated_at"].replace("Z", "+00:00"))
        if saved_at.tzinfo is None:
            return None
        age = (datetime.now(timezone.utc) - saved_at).total_seconds()
        if age < -300:
            return None
        status = "FRESH" if meta["anchor"] == anchor else "STALE"
        if status == "STALE":
            max_stale = max(60, min(86400, int(
                os.getenv("SPHERE_REPORT_SNAPSHOT_MAX_STALE_SECONDS", "3600")
            )))
            if not allow_stale or age > max_stale:
                return None
        freshness = {
            "status": status,
            "generated_at": meta["generated_at"],
            "source_anchor": meta["anchor"],
            "current_anchor": anchor,
            "age_seconds": round(max(0, age), 1),
        }
        return report, freshness
    except (OSError, ValueError, KeyError, TypeError, UnicodeError, EOFError, gzip.BadGzipFile, OverflowError):
        return None


def save(period: str, label: str, strategy: str, anchor: str, report: dict) -> Path:
    """Atomic, permission-restricted write. Only called by the DEV worker."""
    if not enabled() or os.getenv("SPHERE_REPORT_SNAPSHOT_WORKER") != "true":
        raise RuntimeError("Refusing snapshot write outside the opted-in DEV worker")
    path = _path(period, label, strategy)
    if report.get("period") != period or report.get("month") != label[:7]:
        raise ValueError("Report period mismatch")
    if period == "week" and report.get("week_start") != label:
        raise ValueError("Report week mismatch")
    if not isinstance(report.get("items"), list):
        raise ValueError("Report is not a full evaluated population")
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
    meta = {
        "schema": SCHEMA,
        "contract": CONTRACT,
        "period": period,
        "label": label,
        "strategy": strategy,
        "anchor": anchor,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    blob = json.dumps(
        {"meta": meta, "report": jsonable_encoder(report)},
        ensure_ascii=False, separators=(",", ":"), allow_nan=False,
    ).encode("utf-8")
    if len(blob) > MAX_JSON_BYTES:
        raise ValueError("Snapshot exceeds safety limit")
    compressed = gzip.compress(blob, compresslevel=5)
    if len(compressed) > MAX_COMPRESSED_BYTES:
        raise ValueError("Compressed snapshot exceeds safety limit")
    fd, temp = tempfile.mkstemp(prefix=".sphere-", suffix=".tmp", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(compressed)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    return path

"""Restore historical WP-error projections exclusively from SPHERE's saved raw collections.

Dry run by default. Run from the isolated Rundeck DEV checkout, never from PROD:
  python -m backend.backfill_monthly_wp_errors --month 2026-09
  python -m backend.backfill_monthly_wp_errors --month 2026-09 --apply --confirm-dev

No SSH, SAP transaction, ST22 import, fabricated event, or migration is performed.
Existing workload observations are upserted using their original snapshot keys.
Restart the DEV API after backfill to invalidate the in-process monthly cache.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from urllib.parse import parse_qsl, urlsplit

from sqlalchemy import text
from backend.db.session import DATABASE_URL, DB_MODE, get_engine

from backend.rundeck_store import ROOT
from backend.rundeck_workload_observations import (
    parse_workload_observations,
    persist_workload_observations,
    workload_observation_table_available,
)

WIB = ZoneInfo("Asia/Jakarta")


def in_month(value: datetime, start: datetime, end: datetime) -> bool:
    if value.tzinfo is None:
        return False
    return start <= value.astimezone(WIB) < end


def _parse_timestamp(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value or "").replace("Z", "+00:00"))
    except ValueError:
        return None


def recoverable_archive(root: Path, manifest: dict) -> bytes | None:
    """Read retained bytes only inside the configured archive; enforce checksum."""
    relative = manifest.get("raw_path")
    if not relative or manifest.get("status") != "READY" or manifest.get("database_status") != "STORED":
        return None
    root = root.resolve()
    source = (root / relative).resolve()
    if not source.is_relative_to(root / "archive") or not source.is_file():
        return None
    payload = gzip.decompress(source.read_bytes()) if source.suffix == ".gz" else source.read_bytes()
    if hashlib.sha256(payload).hexdigest() != manifest.get("checksum"):
        raise ValueError(f"Raw checksum mismatch: {manifest.get('collection_id')}")
    if b"## RCA-WP-V2.2-BEGIN" not in payload:
        return None
    return payload


def _validate_dev_database() -> None:
    """Require the exact local DEV PostgreSQL role, name and socket/loopback target."""
    if DB_MODE not in {"db", "hybrid"}:
        raise RuntimeError("DEV DB_MODE must be db or hybrid; no writes performed")
    try:
        uri = urlsplit(DATABASE_URL)
        params = parse_qsl(uri.query, keep_blank_values=True, strict_parsing=True)
        target_valid = (
            uri.scheme in {"postgresql", "postgresql+psycopg"}
            and uri.username == "sphere" and uri.password is None
            and uri.path in {"/sphere_rundeck_dev", "/sphere-rundeck-dev"}
            and not uri.fragment
            and (
                (uri.hostname is None and uri.port is None and len(params) == 1
                 and params[0] in {("host", "/var/run/postgresql"), ("host", "/run/postgresql")})
                or (uri.hostname in {"localhost", "127.0.0.1", "::1"}
                    and uri.port in {None, 5432} and not params)
            )
        )
    except (ValueError, TypeError):
        target_valid = False
    if not target_valid:
        raise RuntimeError("Only exact local sphere_rundeck_dev PostgreSQL target is approved")
    engine = get_engine()
    if engine is None:
        raise RuntimeError("DEV database engine is unavailable")
    with engine.connect() as conn:
        database, role = conn.execute(text("SELECT current_database(), current_user")).one()
    if database not in {"sphere_rundeck_dev", "sphere-rundeck-dev"} or role != "sphere":
        raise RuntimeError("Database identity is not the approved DEV target")


def backfill(
    month: str,
    root: Path,
    apply: bool = False,
    *,
    batch_offset: int = 0,
    batch_size: int | None = None,
) -> dict:
    try:
        start = datetime.strptime(month, "%Y-%m").replace(tzinfo=WIB)
    except ValueError as exc:
        raise ValueError("month must be YYYY-MM") from exc
    end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    if batch_offset < 0 or (batch_size is not None and not 1 <= batch_size <= 500):
        raise ValueError("batch_offset must be >= 0; batch_size must be 1..500")
    if apply:
        if batch_size is None:
            raise RuntimeError("Apply requires an explicit --batch-size <= 500")
        _validate_dev_database()
        if not workload_observation_table_available():
            raise RuntimeError("DEV workload observation table is unavailable; no writes performed")
    eligible = []
    for path in sorted((root / "manifests").glob("rundeck-*.json")):
        manifest = json.loads(path.read_text())
        # Collection end can fall just beyond midnight; allow a one-day margin.
        timestamp = _parse_timestamp(manifest.get("finished_at") or manifest.get("started_at"))
        if timestamp and (start - timedelta(days=1) <= timestamp.astimezone(WIB)
                          < end + timedelta(days=1)):
            eligible.append((path, manifest))
    total = len(eligible)
    selected = eligible[batch_offset: batch_offset + batch_size] if batch_size else eligible[batch_offset:]
    counts = {"eligible_manifests": len(selected), "eligible_total": total,
              "batch_offset": batch_offset, "batch_size": batch_size,
              "next_offset": min(batch_offset + len(selected), total),
              "archives_read": 0, "snapshots_in_month": 0,
              "error_only_process_rows": 0, "upserted_rows": 0, "skipped": 0}
    for path, manifest in selected:
        raw = recoverable_archive(root, manifest)
        if raw is None:
            counts["skipped"] += 1
            continue
        counts["archives_read"] += 1
        rows = parse_workload_observations(raw)
        scoped_rows = [row for row in rows if in_month(row["collected_at"], start, end)]
        if not scoped_rows:
            continue
        counts["snapshots_in_month"] += 1
        counts["error_only_process_rows"] += sum(
            row["details"].get("observation_scope") == "WP_ERROR_ONLY" for row in scoped_rows
        )
        if apply:
            # Parser projection is deterministic; ON CONFLICT makes retries idempotent.
            counts["upserted_rows"] += persist_workload_observations(
                manifest["collection_id"], raw, scoped_rows=scoped_rows
            )
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--month", required=True)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--apply", action="store_true", help="Write idempotent projection rows")
    parser.add_argument("--confirm-dev", action="store_true", help="Require exact local DEV DB identity")
    parser.add_argument("--batch-offset", type=int, default=0, help="Index of first eligible manifest")
    parser.add_argument("--batch-size", type=int, help="Maximum eligible manifests in this run (1..500)")
    args = parser.parse_args()
    if args.apply:
        checkout = Path("/root/rundeck-sphere-dev").resolve()
        runtime = Path("/opt/sphere-rundeck-dev/current").resolve()
        if not args.confirm_dev or Path.cwd().resolve() not in {checkout, runtime}:
            parser.error("--apply requires --confirm-dev from the DEV checkout or active DEV release")
    print(json.dumps({"month": args.month, "mode": "APPLY" if args.apply else "DRY_RUN",
                      **backfill(args.month, args.root, args.apply,
                                 batch_offset=args.batch_offset, batch_size=args.batch_size)}, indent=2))


if __name__ == "__main__":
    main()

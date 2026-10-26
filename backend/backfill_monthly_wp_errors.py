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


def backfill(month: str, root: Path, apply: bool = False) -> dict:
    try:
        start = datetime.strptime(month, "%Y-%m").replace(tzinfo=WIB)
    except ValueError as exc:
        raise ValueError("month must be YYYY-MM") from exc
    end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    if apply and not workload_observation_table_available():
        raise RuntimeError("DEV workload observation table is unavailable; no writes performed")
    counts = {"eligible_manifests": 0, "archives_read": 0, "snapshots_in_month": 0,
              "error_only_process_rows": 0, "upserted_rows": 0, "skipped": 0}
    for path in sorted((root / "manifests").glob("rundeck-*.json")):
        manifest = json.loads(path.read_text())
        # Collection end can fall just beyond midnight; allow a one-day margin.
        timestamp = _parse_timestamp(manifest.get("finished_at") or manifest.get("started_at"))
        if not timestamp or not (start - timedelta(days=1) <= timestamp.astimezone(WIB)
                                 < end + timedelta(days=1)):
            continue
        counts["eligible_manifests"] += 1
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
                manifest["collection_id"], raw
            )
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--month", required=True)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--apply", action="store_true", help="Write idempotent projection rows")
    parser.add_argument("--confirm-dev", action="store_true", help="Confirm DEV-only DB context")
    args = parser.parse_args()
    if args.apply and (not args.confirm_dev or Path.cwd().resolve().name != "rundeck-sphere-dev"):
        parser.error("--apply requires --confirm-dev from /root/rundeck-sphere-dev")
    print(json.dumps({"month": args.month, "mode": "APPLY" if args.apply else "DRY_RUN",
                      **backfill(args.month, args.root, args.apply)}, indent=2))


if __name__ == "__main__":
    main()

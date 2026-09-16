#!/usr/bin/env python3
"""Import authoritative SM37 execution export into SPHERE.

Accepted input:
- JSON array of execution objects
- JSON object with an ``items`` array
- CSV with columns such as job_name, job_count, step_no, program, variant,
  status, scheduled_by, server, started_at, ended_at, client.

This importer does not scrape or infer SM37 data. The supplied file must originate from
an approved SAP extraction/export path.
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

from backend.rundeck_job_intelligence import import_job_executions


def load_records(path: Path) -> list[dict]:
    if path.suffix.lower() == ".csv":
        with path.open(newline="", encoding="utf-8-sig") as stream:
            return [dict(row) for row in csv.DictReader(stream)]
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("items"), list):
        return payload["items"]
    raise SystemExit("Input must be a JSON array/object with items, or CSV")


def main() -> None:
    parser = argparse.ArgumentParser(description="Import approved SM37 execution export into SPHERE")
    parser.add_argument("file", type=Path)
    parser.add_argument("--source", default="SM37")
    parser.add_argument("--apply", action="store_true", help="write to PostgreSQL; default is validation-only")
    args = parser.parse_args()
    records = load_records(args.file)
    valid = [row for row in records if (row.get("job_name") or row.get("job")) and (row.get("started_at") or row.get("start_time"))]
    print(f"SOURCE={args.source}")
    print(f"RECORDS={len(records)}")
    print(f"VALID_RECORDS={len(valid)}")
    if not args.apply:
        print("MODE=DRY-RUN")
        print("NO DATABASE CHANGES MADE. Re-run with --apply after validating the export source and count.")
        return
    result = import_job_executions(valid, source=args.source)
    print(json.dumps(result, default=str, indent=2))


if __name__ == "__main__":
    main()

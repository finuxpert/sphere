"""Opt-in DEV worker: prepare 90D/180D/365D historical trends outside FastAPI.

This worker does not change database schema or write SQL. A recent snapshot is
read by the existing API only when the explicit DEV flag is enabled.
"""
from __future__ import annotations

import argparse
import fcntl
import os
import sys
import time
from pathlib import Path

from backend import rundeck_trend_snapshots as snapshots

SCOPES = [
    (range_key, metric_key)
    for range_key in ("90d", "180d", "365d")
    for metric_key in ("cpu,ram,wp", "network_rx", "network_tx")
]


def build(range_key: str, metric_key: str) -> str:
    if range_key not in snapshots.RANGES or metric_key not in snapshots.METRICS:
        raise ValueError("Invalid historical trend scope")
    # Only import the FastAPI route module in the worker process. The snapshot
    # loader refuses worker reads, forcing a source-backed recomputation.
    from backend import rundeck_api_core as api

    started = time.monotonic()
    if metric_key == "cpu,ram,wp":
        payload = api.history_trend_bundle(
            metrics=metric_key, range_key=range_key, bucket="auto",
            from_at=None, to_at=None,
        )
    else:
        payload = api.history_trend(
            range_key=range_key, bucket="auto", metric=metric_key,
            from_at=None, to_at=None,
        )
    path = snapshots.save(range_key, metric_key, payload)
    return (f"BUILT range={range_key} metric={metric_key} "
            f"seconds={time.monotonic()-started:.2f} bytes={path.stat().st_size}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", action="store_true", help="Show scopes without changes")
    parser.add_argument("--only", action="append", metavar="180d:network_rx")
    args = parser.parse_args()
    scopes = SCOPES
    if args.only:
        scopes = []
        for item in args.only:
            range_key, separator, metric_key = item.partition(":")
            if not separator or (range_key, metric_key) not in SCOPES:
                parser.error("Unsupported scope; use e.g. 180d:network_rx")
            scopes.append((range_key, metric_key))
    if args.plan:
        for range_key, metric_key in scopes:
            print(f"PRECOMPUTE_PLAN range={range_key} metric={metric_key}", flush=True)
        print("FINAL=PASS PLAN_ONLY=TRUE")
        return 0

    if not snapshots.enabled() or os.getenv("SPHERE_TREND_SNAPSHOT_WORKER") != "true":
        raise SystemExit("REFUSED: explicit DEV DB and worker snapshot flags required")
    folder = Path(os.getenv("SPHERE_TREND_SNAPSHOT_DIR", snapshots.DEFAULT_DIR))
    folder.mkdir(mode=0o750, parents=True, exist_ok=True)
    os.umask(0o077)
    with (folder / ".worker.lock").open("a+b") as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("FINAL=PASS ALREADY_RUNNING=TRUE")
            return 0
        failures = 0
        for range_key, metric_key in scopes:
            try:
                status = build(range_key, metric_key)
                print(f"PRECOMPUTE {status}", flush=True)
            except Exception as error:
                failures += 1
                print(f"PRECOMPUTE_ERROR range={range_key} metric={metric_key} "
                      f"type={type(error).__name__}", flush=True)
        print(f"FINAL={'PASS' if not failures else 'FAIL'} "
              f"failures={failures} db_writes=NONE", flush=True)
        return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())

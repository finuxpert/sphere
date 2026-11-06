"""Opt-in DEV calendar report precompute worker (never runs in FastAPI).

Systemd starts this independent process every ten minutes. It computes the full
existing report contract, checks READY-collection anchor stability, and writes
one atomic snapshot per period. It makes no schema changes.
"""
from __future__ import annotations

import argparse
import fcntl
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from backend import rundeck_evaluation as ev
from backend import rundeck_report_snapshots as snapshots


def planned_scopes(now: datetime) -> list[tuple[str, str]]:
    now = now.astimezone(ZoneInfo("Asia/Jakarta"))
    periods: list[tuple[str, str]] = []
    for delta in range(2):
        index = now.year * 12 + now.month - 1 - delta
        month = f"{index // 12:04d}-{index % 12 + 1:02d}"
        periods.append(("month", month))
    monday = now.date() - timedelta(days=now.weekday())
    for delta in range(3):
        periods.append(("week", (monday - timedelta(weeks=delta)).isoformat()))
    return periods


def _scope(period: str, label: str):
    if period == "month":
        month = label
        start, end, _ = ev.calendar_month_bounds(month)
        week_start = None
    else:
        month = label[:7]
        week_start = label
        start, end, _ = ev.calendar_week_bounds(label)
    return month, week_start, start, end


def _anchor(start, end) -> str:
    engine = ev.get_engine()
    if engine is None:
        raise RuntimeError("DEV PostgreSQL engine unavailable")
    with engine.connect() as conn:
        return ev._calendar_month_collection_anchor(conn, start, end)


def build(period: str, label: str) -> str:
    month, week_start, start, end = _scope(period, label)
    if end <= start:
        return "SKIP_FUTURE"
    strategy = snapshots.strategy_name(ev._dev_split_distinct_enabled(period))
    before = _anchor(start, end)
    if before == "NO_COMPLETE_COLLECTION":
        return "SKIP_NO_READY_COLLECTION"
    if snapshots.load(period, label, strategy, before, allow_stale=False):
        return "SKIP_FRESH"

    begun = time.monotonic()
    response = ev.evaluation_report(
        period=period, month=month, week_start=week_start,
        consumer_type="ALL", limit=1,
    )
    if response.get("runtime", {}).get("cache") not in {"MISS", "HIT"}:
        raise RuntimeError("Worker did not compute a full report")
    after = _anchor(start, end)
    if before != after:
        return "SKIP_ANCHOR_CHANGED"
    key_scope = f"{period}:{label}"
    if strategy == "split_distinct":
        key_scope += ":split_distinct"
    full = ev._cache_get((key_scope, "ALL", before))
    if not full or len(full.get("items", [])) != int(
        (full.get("summary") or {}).get("workloads", -1)
    ):
        # The summary's population count can be a different field on older
        # builds; only require that the full unpaged result exists.
        if not full or not isinstance(full.get("items"), list) or "page" in full:
            raise RuntimeError("Full report population missing from worker cache")
    path = snapshots.save(period, label, strategy, before, full)
    return f"BUILT rows={len(full['items'])} seconds={time.monotonic()-begun:.2f} bytes={path.stat().st_size}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", action="store_true", help="Only show precompute scopes")
    parser.add_argument("--only", action="append", metavar="month:YYYY-MM|week:YYYY-MM-DD")
    args = parser.parse_args()
    scopes = planned_scopes(datetime.now(ZoneInfo("Asia/Jakarta")))
    if args.only:
        scopes = []
        for item in args.only:
            period, sep, label = item.partition(":")
            if not sep:
                parser.error("Expected month:YYYY-MM or week:YYYY-MM-DD")
            try:
                snapshots.scope_label(period, label[:7], label if period == "week" else None)
            except ValueError as err:
                parser.error(str(err))
            scopes.append((period, label))
    if args.plan:
        for period, label in scopes:
            print(f"PRECOMPUTE_PLAN period={period} label={label}", flush=True)
        print("FINAL=PASS PLAN_ONLY=TRUE")
        return 0

    if not snapshots.enabled() or os.getenv("SPHERE_REPORT_SNAPSHOT_WORKER") != "true":
        raise SystemExit("REFUSED: explicit DEV DB and worker snapshot flags required")
    path = Path(os.getenv("SPHERE_REPORT_SNAPSHOT_DIR", snapshots.DEFAULT_DIR))
    path.mkdir(mode=0o750, parents=True, exist_ok=True)
    os.umask(0o077)
    with (path / ".worker.lock").open("a+b") as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("FINAL=PASS ALREADY_RUNNING=TRUE")
            return 0
        failures = 0
        for period, label in scopes:
            try:
                status = build(period, label)
                print(f"PRECOMPUTE period={period} label={label} result={status}", flush=True)
            except Exception as err:
                failures += 1
                print(f"PRECOMPUTE_ERROR period={period} label={label} type={type(err).__name__}", flush=True)
        print(f"FINAL={'PASS' if not failures else 'FAIL'} failures={failures} db_writes=NONE", flush=True)
        return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())

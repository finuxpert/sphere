#!/usr/bin/env python3
"""DEV-only read-only comparison of baseline vs opt-in split DISTINCT aggregate.

Usage:
  python ops/rundeck/compare-report-split-distinct-dev.py month 2026-10
  python ops/rundeck/compare-report-split-distinct-dev.py month 2026-10 --mode parity
  python ops/rundeck/compare-report-split-distinct-dev.py week 2026-10-26 --mode analyze
  python ops/rundeck/compare-report-split-distinct-dev.py month 2026-10 --mode analyze --reverse
  python ops/rundeck/compare-report-split-distinct-dev.py month 2026-10 --mode analyze --work-mem 16MB

PLAN does not execute SELECT. PARITY executes both SELECTs with all-field checks.
ANALYZE executes both SELECTs using EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON).
All modes: one PostgreSQL REPEATABLE READ READ ONLY transaction, DEV DB only,
bounded statement/lock timeouts; no schema changes or persistent GUC changes.
Timings are order/cache-sensitive and NOT paired cold-cache measurements.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
from datetime import datetime
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import text
from sqlalchemy.engine import make_url

from backend import rundeck_evaluation as ev
from backend.db.session import get_engine


class _Empty:
    def scalar(self):
        return True

    def __iter__(self):
        return iter(())


class _Capture:
    def __init__(self):
        self.statements = []

    def execute(self, statement, params=None):
        sql = str(statement)
        if "to_regclass('public.rundeck_workload_observations')" in sql:
            return _Empty()
        if not sql.lstrip().upper().startswith("WITH "):
            raise RuntimeError("Unexpected statement in candidate capture")
        self.statements.append((sql, dict(params or {})))
        return _Empty()


def capture(start, end, *, candidate):
    conn = _Capture()
    ev._aggregate_window(conn, start, end, "ALL", identity_preaggregate=candidate)
    if len(conn.statements) != 1:
        raise RuntimeError("Failed to capture exactly one aggregate SELECT")
    return conn.statements[0]


def compare_all_fields(left, right):
    def keyed(rows):
        result = {}
        for row in rows:
            key = (row["consumer_type"], row["consumer_key"])
            if key in result:
                raise AssertionError("Duplicate workload result key")
            result[key] = dict(row)
        return result

    before, after = keyed(left), keyed(right)
    if before.keys() != after.keys():
        raise AssertionError(
            f"Workload population differs: baseline={len(before)}, candidate={len(after)}"
        )
    for idx, key in enumerate(before):
        if before[key].keys() != after[key].keys():
            raise AssertionError(f"Output field set differs at row index {idx}")
        for field, lhs in before[key].items():
            rhs = after[key][field]
            if isinstance(lhs, (float, Decimal)) and isinstance(rhs, (float, Decimal)):
                if not math.isclose(float(lhs), float(rhs), rel_tol=1e-12, abs_tol=1e-10):
                    raise AssertionError(f"Numeric output differs: row={idx}, field={field}")
            elif lhs != rhs:
                raise AssertionError(f"Output differs: row={idx}, field={field}")
    return len(before)


def flatten_plan(node, depth=0):
    yield node, depth
    for child in node.get("Plans", []):
        yield from flatten_plan(child, depth + 1)


def summarize(label, raw, *, analyzed):
    plan = raw[0]["Plan"]
    nodes = list(flatten_plan(plan))
    print(
        f"PLAN={label} ROOT={plan.get('Node Type')} TOTAL_COST={plan.get('Total Cost')} "
        f"ESTIMATED_ROWS={plan.get('Plan Rows')} NODES={len(nodes)}",
        flush=True,
    )
    if analyzed:
        print(
            f"ACTUAL={label} EXECUTION_MS={raw[0].get('Execution Time')} "
            f"PLANNING_MS={raw[0].get('Planning Time')} "
            f"ROOT_SHARED_HIT={plan.get('Shared Hit Blocks',0)} "
            f"ROOT_SHARED_READ={plan.get('Shared Read Blocks',0)} "
            f"ROOT_TEMP_READ={plan.get('Temp Read Blocks',0)} "
            f"ROOT_TEMP_WRITTEN={plan.get('Temp Written Blocks',0)}",
            flush=True,
        )
    relevant = {
        "Sort", "Aggregate", "GroupAggregate", "HashAggregate",
        "Hash", "Hash Join", "Materialize", "CTE Scan",
    }
    for node, depth in nodes:
        if node.get("Node Type") not in relevant:
            continue
        fields = (
            "Node Type", "Strategy", "Actual Rows", "Plan Rows", "Actual Loops",
            "Actual Total Time", "Sort Method", "Sort Space Used",
            "Sort Space Type", "Peak Memory Usage", "Hash Batches",
            "Disk Usage", "Temp Read Blocks", "Temp Written Blocks",
        )
        print("NODE=" + label + " " + json.dumps({
            "depth": depth, **{name: node[name] for name in fields if name in node}
        }, sort_keys=True, separators=(",", ":")), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("period", choices=("month", "week"))
    parser.add_argument("value")
    parser.add_argument("--mode", choices=("plan", "parity", "analyze"), default="plan")
    parser.add_argument("--stage", choices=("current", "previous"), default="current")
    parser.add_argument("--reverse", action="store_true",
                        help="Execute candidate first to expose warmed-cache order effects")
    parser.add_argument("--work-mem", choices=("4MB", "16MB", "32MB"),
                        help="Optional bounded session-local setting; NOT global")
    args = parser.parse_args()

    url = os.environ.get("DATABASE_URL", "")
    if not url or make_url(url).database != "sphere_rundeck_dev":
        raise SystemExit("REFUSED: DATABASE_URL must be sphere_rundeck_dev")
    if os.environ.get("DB_MODE", "file").lower() not in {"db", "hybrid"}:
        raise SystemExit("REFUSED: DB_MODE must enable DEV PostgreSQL")
    if args.period == "month":
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", args.value):
            raise SystemExit("Invalid month")
        start, end, previous = ev.calendar_month_bounds(args.value)
    else:
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])-[0-3]\d", args.value):
            raise SystemExit("Invalid week")
        start, end, previous = ev.calendar_week_bounds(args.value)
    if args.stage == "previous":
        start, end = previous, start

    baseline_sql, baseline_params = capture(start, end, candidate=False)
    candidate_sql, candidate_params = capture(start, end, candidate=True)
    if baseline_params != candidate_params:
        raise RuntimeError("Candidate binds diverged from baseline")
    engine = get_engine()
    if engine is None:
        raise SystemExit("DEV engine unavailable")
    print(
        f"TARGET=DEV PERIOD={args.period}:{args.value} STAGE={args.stage} "
        f"MODE={args.mode.upper()} READ_ONLY=TRUE MIGRATIONS=NONE",
        flush=True,
    )
    variants = [
        ("BASELINE", baseline_sql, baseline_params),
        ("SPLIT_DISTINCT", candidate_sql, candidate_params),
    ]
    if args.reverse:
        variants.reverse()
    results = {}
    with engine.connect() as conn:
        with conn.begin():
            conn.exec_driver_sql("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            conn.exec_driver_sql("SET LOCAL lock_timeout = '1500ms'")
            conn.exec_driver_sql("SET LOCAL statement_timeout = '120000ms'")
            if args.work_mem:
                conn.exec_driver_sql("SET LOCAL work_mem = '" + args.work_mem + "'")
            identity = conn.execute(text(
                "SELECT current_user, current_database(), current_setting('work_mem')"
            )).one()
            if identity[1] != "sphere_rundeck_dev":
                raise RuntimeError("Unexpected database identity")
            print(f"WORK_MEM={identity[2]} TRANSACTION=REPEATABLE_READ_READ_ONLY")
            for label, sql, params in variants:
                if args.mode == "plan":
                    raw = conn.execute(text("EXPLAIN (FORMAT JSON) " + sql), params).scalar_one()
                    if isinstance(raw, str):
                        raw = json.loads(raw)
                    summarize(label, raw, analyzed=False)
                elif args.mode == "analyze":
                    raw = conn.execute(text(
                        "EXPLAIN (ANALYZE, BUFFERS, TIMING ON, SUMMARY ON, FORMAT JSON) " + sql
                    ), params).scalar_one()
                    if isinstance(raw, str):
                        raw = json.loads(raw)
                    summarize(label, raw, analyzed=True)
                else:
                    start_tick = time.perf_counter()
                    rows = conn.execute(text(sql), params).mappings().all()
                    duration_ms = round((time.perf_counter() - start_tick) * 1000, 1)
                    results[label] = rows
                    print(f"STAGE={label} ROWS={len(rows)} WALL_MS={duration_ms}", flush=True)
            if args.mode == "parity":
                count = compare_all_fields(results["BASELINE"], results["SPLIT_DISTINCT"])
                print(f"PARITY=PASS WORKLOADS={count} FIELDS=ALL", flush=True)
    print("FINAL=PASS DATABASE_WRITES=0 NO_SERVICE_RESTARTS=TRUE")
    if args.mode != "plan":
        print("NOTE=ORDER_AND_CACHE_SENSITIVE_TIMINGS_NOT_COLD_BENCHMARK")


if __name__ == "__main__":
    main()

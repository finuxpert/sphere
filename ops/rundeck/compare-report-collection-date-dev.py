#!/usr/bin/env python3
"""Read-only DEV planner A/B for COALESCE collection-date vs indexable OR.

Run against an isolated source checkout as the OS user `sphere` (peer auth):
  python ops/rundeck/compare-report-collection-date-dev.py month 2026-10
  python ops/rundeck/compare-report-collection-date-dev.py week 2026-10-26 --stage current
  python ops/rundeck/compare-report-collection-date-dev.py month 2026-10 --stage current --run parity

Default is EXPLAIN plan-only; parity executes two full SELECT queries on one
repeatable-read, read-only snapshot. Results are an A/B *experiment*, NOT an
automatic code change or a controlled cold-cache benchmark. Never edits DB.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
from decimal import Decimal
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend import rundeck_evaluation as ev
from backend.db.session import get_engine


class _NoRows:
    def scalar(self):
        return True

    def __iter__(self):
        return iter(())


class _Capture:
    def __init__(self):
        self.queries = []

    def execute(self, statement, params=None):
        query = str(statement)
        if "to_regclass('public.rundeck_workload_observations')" in query:
            return _NoRows()
        if not query.lstrip().upper().startswith("WITH "):
            raise ValueError("Unexpected report SQL during capture")
        self.queries.append((query, dict(params or {})))
        return _NoRows()


DATE_PREDICATE = re.compile(
    r"COALESCE\(c\.finished_at,\s*c\.started_at\)\s*>=\s*:start\s+"
    r"AND\s+COALESCE\(c\.finished_at,\s*c\.started_at\)\s*<\s*:end",
    re.IGNORECASE,
)


def rewrite_collection_date(sql: str) -> str:
    """Expose existing finished_at index without changing COALESCE semantics.

    Important: if finished_at is nonnull, started_at is *never* the fallback,
    even when finished_at is outside the period. The IS NULL guard is required.
    """
    rewritten, count = DATE_PREDICATE.subn(
        "((c.finished_at >= :start AND c.finished_at < :end) "
        "OR (c.finished_at IS NULL AND c.started_at >= :start AND c.started_at < :end))",
        sql,
    )
    if count != 1:
        raise ValueError(f"Expected exactly one collection-date filter; found {count}")
    return rewritten


def capture(stage, start, end):
    probe = _Capture()
    if stage == "historical":
        ev._historical_baseline(probe, end, "ALL")
    else:
        ev._aggregate_window(probe, start, end, "ALL")
    if len(probe.queries) != 1:
        raise RuntimeError(f"Unexpected SQL query count for {stage}: {len(probe.queries)}")
    return probe.queries[0]


def plan_nodes(plan):
    nodes = []
    def visit(node):
        nodes.append(node)
        for child in node.get("Plans", []):
            visit(child)
    visit(plan)
    return nodes


def plan_summary(plan):
    nodes = plan_nodes(plan)
    c_nodes = [n for n in nodes if n.get("Relation Name") == "rundeck_collections"]
    biggest = max(c_nodes, key=lambda n: n.get("Plan Rows", 0), default={})
    append = max((n.get("Plan Rows", 0) for n in nodes if n.get("Node Type") == "Append"), default=0)
    return {
        "plan_total_cost": plan.get("Total Cost"),
        "estimated_collection_rows": biggest.get("Plan Rows"),
        "collection_access": biggest.get("Node Type"),
        "collection_index": biggest.get("Index Name", ""),
        "estimated_append_rows": append,
        "nested_loops": sum(n.get("Node Type") == "Nested Loop" for n in nodes),
        "seq_scans": sum(n.get("Node Type") == "Seq Scan" for n in nodes),
    }


def keyed(rows):
    values = {}
    for row in rows:
        row = dict(row)
        key = (row["consumer_type"], row["consumer_key"])
        if key in values:
            raise AssertionError(f"Duplicate output identity {key}")
        values[key] = row
    return values


def verify_equal(original, candidate):
    left, right = keyed(original), keyed(candidate)
    if left.keys() != right.keys():
        raise AssertionError(f"Population differs: before={len(left)}, after={len(right)}")
    for key in left:
        if left[key].keys() != right[key].keys():
            raise AssertionError(f"Columns differ for {key}")
        for field, a in left[key].items():
            b = right[key][field]
            if isinstance(a, (float, Decimal)) and isinstance(b, (float, Decimal)):
                if not math.isclose(float(a), float(b), rel_tol=1e-12, abs_tol=1e-10):
                    raise AssertionError(f"Field {field} differs for {key}")
            elif a != b:
                raise AssertionError(f"Field {field} differs for {key}")
    return len(left)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("period", choices=("month", "week"))
    parser.add_argument("value")
    parser.add_argument("--stage", choices=("current", "previous", "historical"), default="current")
    parser.add_argument("--run", choices=("plan", "parity"), default="plan")
    args = parser.parse_args()

    db_url = os.getenv("DATABASE_URL", "")
    if not db_url or make_url(db_url).database != "sphere_rundeck_dev":
        raise SystemExit("REFUSED: DATABASE_URL must point to sphere_rundeck_dev")
    if os.getenv("DB_MODE", "file").lower() not in {"db", "hybrid"}:
        raise SystemExit("REFUSED: DB_MODE must be db or hybrid")
    if args.period == "month":
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", args.value):
            raise SystemExit("Invalid monthly period")
        start, end, previous = ev.calendar_month_bounds(args.value)
    else:
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])-[0-3]\d", args.value):
            raise SystemExit("Invalid weekly period")
        start, end, previous = ev.calendar_week_bounds(args.value)

    if args.stage == "previous":
        start, end = previous, start
    elif args.stage == "historical":
        # Historical anchor is the report's start, not its end.
        end = start
    sql, params = capture(args.stage, start, end)
    rewritten = rewrite_collection_date(sql)
    engine = get_engine()
    if engine is None:
        raise SystemExit("DEV engine unavailable")
    print(
        f"TARGET=DEV PERIOD={args.period}:{args.value} STAGE={args.stage} "
        f"MODE={args.run.upper()} READ_ONLY=TRUE DB_MIGRATION=NONE",
        flush=True,
    )
    with engine.connect() as conn:
        with conn.begin():
            conn.exec_driver_sql("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            conn.exec_driver_sql("SET LOCAL lock_timeout = '1500ms'")
            conn.exec_driver_sql("SET LOCAL statement_timeout = '90000ms'")
            if args.run == "plan":
                for label, query in (("COALESCE", sql), ("INDEXABLE_OR", rewritten)):
                    raw = conn.execute(text("EXPLAIN (FORMAT JSON) " + query), params).scalar_one()
                    if isinstance(raw, str):
                        raw = json.loads(raw)
                    summary = plan_summary(raw[0]["Plan"])
                    print(f"PLAN={label} {json.dumps(summary, sort_keys=True)}", flush=True)
                print("PLAN_CAPTURE=PASS SQL_NOT_EXECUTED=TRUE", flush=True)
            else:
                records = {}
                for label, query in (("COALESCE", sql), ("INDEXABLE_OR", rewritten)):
                    tick = time.perf_counter()
                    records[label] = conn.execute(text(query), params).mappings().all()
                    print(
                        f"QUERY={label} DURATION_MS={round((time.perf_counter()-tick)*1000)} "
                        f"WORKLOADS={len(records[label])}",
                        flush=True,
                    )
                n = verify_equal(records["COALESCE"], records["INDEXABLE_OR"])
                print(
                    f"PARITY=PASS WORKLOADS={n} TIMINGS_NOT_COLD_BENCHMARK=TRUE "
                    f"DB_WRITES=0", flush=True,
                )


if __name__ == "__main__":
    main()

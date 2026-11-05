#!/usr/bin/env python3
"""Read-only DEV-only execution-plan diagnosis of existing SPHERE report SQL.

Examples:
  python ops/rundeck/profile-report-actual-dev.py month 2026-10 --stage current
  python ops/rundeck/profile-report-actual-dev.py month 2026-10 --stage current --analyze
  python ops/rundeck/profile-report-actual-dev.py week 2026-10-26 --stage historical

Plan-only (default) compares current planner settings with session-only
enable_nestloop=off. --analyze executes exactly ONE baseline SELECT and uses
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON). It is opt-in due to query load,
bounded by statement_timeout. No SQL text, workload identities or DB credentials
are printed. No changes to application code, schema, statistics, or services.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import text
from sqlalchemy.engine import make_url

from backend import rundeck_evaluation as ev
from backend.rundeck_monthly_pressure import monthly_pressure_observations
from backend.db.session import get_engine


class _EmptyRows:
    def scalar(self):
        return True

    def mappings(self):
        return self

    def all(self):
        return []

    def __iter__(self):
        return iter(())


class _Capture:
    def __init__(self):
        self.statements = []

    def execute(self, query, params=None):
        sql = str(query)
        if "to_regclass('public.rundeck_workload_observations')" in sql:
            return _EmptyRows()
        if not re.match(r"\s*(WITH|SELECT)\b", sql, re.IGNORECASE):
            raise RuntimeError("Unexpected SQL captured")
        self.statements.append((sql, dict(params or {})))
        return _EmptyRows()


def capture(stage, start, end, previous):
    """Capture existing SQL unchanged; never add mock/sampling/limit clauses."""
    probe = _Capture()
    if stage == "current":
        ev._aggregate_window(probe, start, end, "ALL")
    elif stage == "previous":
        ev._aggregate_window(probe, previous, start, "ALL")
    elif stage == "historical":
        ev._historical_baseline(probe, start, "ALL")
    elif stage == "pressure":
        source, _ = ev._workload_source_relation(
            probe, window=("start", "end"), job_program_only=True,
        )
        monthly_pressure_observations(
            probe, start, end, source, ev._complete_collection_clause("c"),
        )
        if len(probe.statements) != 2:
            raise RuntimeError("Pressure capture changed shape")
        return probe.statements[-1]
    else:
        raise ValueError("Unknown report SQL stage")
    if len(probe.statements) != 1:
        raise RuntimeError("Aggregate capture changed shape")
    return probe.statements[0]


def rows_of_nodes(node, depth=0):
    """Return sanitized plan node summaries, including measured per-loop data."""
    item = {
        "node": node.get("Node Type"),
        "relation": node.get("Relation Name", ""),
        "index": node.get("Index Name", ""),
        "depth": depth,
        "estimated_rows_per_loop": node.get("Plan Rows"),
    }
    if "Actual Rows" in node:
        loops = node.get("Actual Loops", 0)
        item.update({
            "actual_rows_per_loop": node.get("Actual Rows", 0),
            "actual_loops": loops,
            "inclusive_ms_per_loop": node.get("Actual Total Time"),
            "inclusive_ms_all_loops_approx": round(
                (node.get("Actual Total Time", 0) or 0) * loops, 2
            ),
        })
    for name in ("Shared Hit Blocks", "Shared Read Blocks",
                 "Temp Read Blocks", "Temp Written Blocks"):
        if name in node:
            item[name.lower().replace(" ", "_")] = node[name]
    yield item
    for child in node.get("Plans", []):
        yield from rows_of_nodes(child, depth + 1)


def summarize(raw, *, analyze, label):
    plan = raw[0]["Plan"]
    nodes = list(rows_of_nodes(plan))
    collections = [node for node in nodes if node["relation"] == "rundeck_collections"]
    print(
        f"PLAN={label} ROOT_NODE={plan.get('Node Type')} "
        f"COST={plan.get('Total Cost')} "
        f"NODES={len(nodes)} NESTED_LOOPS={sum(n['node']=='Nested Loop' for n in nodes)} "
        f"COLLECTION_ESTIMATE={max((n['estimated_rows_per_loop'] for n in collections),default=0)} "
        f"COLLECTION_ACCESS={','.join(sorted(set(n['node'] for n in collections)))}",
        flush=True,
    )
    if analyze:
        print(
            f"EXECUTION_MS={raw[0].get('Execution Time')} "
            f"PLANNING_MS={raw[0].get('Planning Time')} "
            f"ROOT_BUFFERS_HIT={plan.get('Shared Hit Blocks',0)} "
            f"ROOT_BUFFERS_READ={plan.get('Shared Read Blocks',0)}",
            flush=True,
        )
        candidates = sorted(
            nodes, key=lambda n: n.get("inclusive_ms_all_loops_approx", 0),
            reverse=True,
        )[:20]
    else:
        candidates = sorted(
            nodes, key=lambda n: n.get("estimated_rows_per_loop") or 0,
            reverse=True,
        )[:12]
    for idx, node in enumerate(candidates, 1):
        print(
            f"NODE_RANK={idx} {json.dumps(node, sort_keys=True, separators=(',',':'))}",
            flush=True,
        )
    # Inclusive node timings overlap with children; do not sum across nodes.


def validate_environment():
    url = os.environ.get("DATABASE_URL", "")
    if not url or make_url(url).database != "sphere_rundeck_dev":
        raise SystemExit("REFUSED: DATABASE_URL must be sphere_rundeck_dev")
    if os.environ.get("DB_MODE", "file").lower() not in {"db", "hybrid"}:
        raise SystemExit("REFUSED: DB_MODE must enable DEV PostgreSQL")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("period", choices=("month", "week"))
    parser.add_argument("value")
    parser.add_argument("--stage", choices=("current", "previous", "historical", "pressure"),
                        default="current")
    parser.add_argument("--analyze", action="store_true",
                        help="Execute exactly one baseline SELECT in read-only EXPLAIN ANALYZE")
    args = parser.parse_args()
    validate_environment()
    if args.period == "month":
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", args.value):
            raise SystemExit("Invalid month")
        start, end, previous = ev.calendar_month_bounds(args.value)
    else:
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])-[0-3]\d", args.value):
            raise SystemExit("Invalid week")
        start, end, previous = ev.calendar_week_bounds(args.value)
    sql, params = capture(args.stage, start, end, previous)
    engine = get_engine()
    if engine is None:
        raise SystemExit("DEV database engine disabled")
    mode = "ANALYZE_READ_ONLY" if args.analyze else "PLAN_ONLY"
    print(f"TARGET=DEV PERIOD={args.period}:{args.value} STAGE={args.stage} MODE={mode}",
          flush=True)
    with engine.connect() as conn:
        with conn.begin():
            conn.exec_driver_sql("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            conn.exec_driver_sql("SET LOCAL lock_timeout = '1500ms'")
            conn.exec_driver_sql("SET LOCAL statement_timeout = '90000ms'")
            identity = conn.execute(text("SELECT current_user, current_database()")).one()
            if identity[1] != "sphere_rundeck_dev":
                raise RuntimeError("Session connected to unexpected DB")
            if args.analyze:
                # Execution only when explicitly requested; no DML is included.
                query = "EXPLAIN (ANALYZE, BUFFERS, TIMING ON, SUMMARY ON, FORMAT JSON) " + sql
                raw = conn.execute(text(query), params).scalar_one()
                if isinstance(raw, str):
                    raw = json.loads(raw)
                summarize(raw, analyze=True, label="BASELINE_ACTUAL")
            else:
                for name, override in (("BASELINE", False), ("NO_NESTLOOP_PLAN", True)):
                    if override:
                        conn.exec_driver_sql("SET LOCAL enable_nestloop = off")
                    raw = conn.execute(text("EXPLAIN (FORMAT JSON) " + sql), params).scalar_one()
                    if isinstance(raw, str):
                        raw = json.loads(raw)
                    summarize(raw, analyze=False, label=name)
                    if override:
                        conn.exec_driver_sql("SET LOCAL enable_nestloop = on")
                print("PLAN_CAPTURE=PASS SQL_NOT_EXECUTED=TRUE", flush=True)
    print("FINAL=PASS NO_WRITES=TRUE NO_MIGRATIONS=TRUE", flush=True)


if __name__ == "__main__":
    main()

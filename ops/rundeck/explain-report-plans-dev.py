#!/usr/bin/env python3
"""Read-only PostgreSQL EXPLAIN for exact DEV report aggregate SQL.

Usage from checkout, with DEV database environment loaded by the operator:
  /opt/sphere-rundeck-dev/venv/bin/python ops/rundeck/explain-report-plans-dev.py month 2026-10
  /opt/sphere-rundeck-dev/venv/bin/python ops/rundeck/explain-report-plans-dev.py week 2026-10-26

This script never runs EXPLAIN ANALYZE and never executes the report SQL itself.
"""
from __future__ import annotations

import os
import re
import sys
from datetime import datetime
from pathlib import Path

# Accept only explicitly scoped DEV. Never read a PROD DB connection accidentally.
def _validate_target() -> None:
    url = os.getenv("DATABASE_URL", "")
    if not url or "sphere_rundeck_dev" not in url.split("?", 1)[0]:
        raise RuntimeError("DEV database URL not configured; expected sphere_rundeck_dev")
    if os.getenv("DB_MODE", "file").lower() not in {"db", "hybrid"}:
        raise RuntimeError("DB_MODE must enable DEV PostgreSQL")


class EmptyResult:
    def __init__(self, scalar_value=None):
        self.scalar_value = scalar_value

    def scalar(self):
        return self.scalar_value

    def mappings(self):
        return self

    def all(self):
        return []

    def __iter__(self):
        return iter(())


class SQLCapture:
    def __init__(self):
        self.queries = []

    def execute(self, statement, params=None):
        sql = str(statement)
        if "to_regclass('public.rundeck_workload_observations')" in sql:
            return EmptyResult(True)
        if not re.match(r"\s*(WITH|SELECT)\b", sql, re.IGNORECASE):
            raise RuntimeError("Capture rejected unexpected SQL")
        self.queries.append((sql, params or {}))
        return EmptyResult()


def _summarize_plan(plan):
    nodes = []
    def walk(node):
        nodes.append({
            "type": node.get("Node Type", "?"),
            "relation": node.get("Relation Name", ""),
            "index": node.get("Index Name", ""),
            "rows": node.get("Plan Rows", 0),
            "cost": node.get("Total Cost", 0),
        })
        for child in node.get("Plans", []):
            walk(child)
    walk(plan)
    for item in sorted(nodes, key=lambda n: float(n["cost"]), reverse=True)[:18]:
        print("NODE=%s RELATION=%s INDEX=%s EST_ROWS=%s COST=%s" % (
            item["type"], item["relation"], item["index"], item["rows"], item["cost"],
        ))
    print("PLAN_TOTAL_NODES=%d" % len(nodes))
    print("PLAN_SEQ_SCANS=%d" % sum(n["type"] == "Seq Scan" for n in nodes))


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: explain-report-plans-dev.py month YYYY-MM | week YYYY-MM-DD", file=sys.stderr)
        return 2
    period, value = sys.argv[1:]
    _validate_target()
    from sqlalchemy import text
    from backend import rundeck_evaluation as evaluation
    from backend.rundeck_monthly_pressure import monthly_pressure_observations
    from backend.db.session import get_engine

    if period == "month":
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", value):
            raise ValueError("Invalid month")
        start, end, previous = evaluation.calendar_month_bounds(value)
    elif period == "week":
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])-[0-3]\d", value):
            raise ValueError("Invalid week")
        start, end, previous = evaluation.calendar_week_bounds(value)
    else:
        raise ValueError("Invalid period")

    probe = SQLCapture()
    evaluation._aggregate_window(probe, start, end, "ALL")
    evaluation._aggregate_window(probe, previous, start, "ALL")
    source, _scope = evaluation._workload_source_relation(probe)
    monthly_pressure_observations(
        probe, start, end, source,
        evaluation._complete_collection_clause("c"), include_correlation=True,
    )
    # Two aggregates, host samples, and costly correlation (last query).
    if len(probe.queries) != 4:
        raise RuntimeError("Unexpected query structure: got %d statements" % len(probe.queries))
    names = ("current_aggregate", "previous_aggregate", "host_pressure", "pressure_correlation")
    engine = get_engine()
    if engine is None:
        raise RuntimeError("DEV database connection disabled")

    print("PLAN_ONLY=TRUE SCOPE=%s:%s NO_ANALYZE=TRUE NO_WRITES=TRUE" % (period, value))
    with engine.connect() as conn:
        with conn.begin():
            conn.exec_driver_sql("SET TRANSACTION READ ONLY")
            conn.exec_driver_sql("SET LOCAL statement_timeout = '6000ms'")
            for name, (sql, params) in zip(names, probe.queries):
                if name == "host_pressure":
                    continue
                print("\n=== PLAN %s ===" % name)
                # PostgreSQL only estimates the plan. SELECT is never executed.
                row = conn.execute(text("EXPLAIN (FORMAT JSON) " + sql), params).scalar_one()
                _summarize_plan(row[0]["Plan"])
    print("PLAN_CAPTURE=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

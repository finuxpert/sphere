#!/usr/bin/env python3
"""Compare unpruned and READY-prefiltered aggregate SQL on DEV, read-only.

Examples (from a DEV checkout with the DEV database environment loaded):
  python ops/rundeck/compare-report-source-pruning-dev.py month 2026-10
  python ops/rundeck/compare-report-source-pruning-dev.py week 2026-10-26

This is an exact population/output parity test, NOT a cold-cache benchmark:
the second query benefits from warmed PostgreSQL/OS buffers.
"""
from __future__ import annotations

import math
import os
import sys
import time
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import text
from sqlalchemy.engine import make_url

from backend import rundeck_evaluation as ev
from backend.db.session import get_engine


class _NoRows:
    def __init__(self, observed: bool):
        self.observed = observed

    def scalar(self):
        return self.observed

    def __iter__(self):
        return iter(())


class _Capture:
    def __init__(self, observed: bool):
        self.observed = observed
        self.statements = []

    def execute(self, statement, params=None):
        sql = str(statement)
        if "to_regclass('public.rundeck_workload_observations')" in sql:
            return _NoRows(self.observed)
        if not sql.lstrip().upper().startswith("WITH "):
            raise RuntimeError("Unexpected statement during SQL capture")
        self.statements.append((sql, dict(params or {})))
        return _NoRows(self.observed)


def _capture(stage, args, observed, optimized):
    probe = _Capture(observed)
    source_builder = ev._workload_source_relation

    def source_for_mode(conn, **kwargs):
        kwargs["ready_collections_only"] = optimized
        return source_builder(conn, **kwargs)

    with patch.object(ev, "_workload_source_relation", side_effect=source_for_mode):
        if stage == "historical_baseline":
            ev._historical_baseline(probe, args[1], "ALL")
        else:
            ev._aggregate_window(probe, args[0], args[1], "ALL")
    if len(probe.statements) != 1:
        raise RuntimeError(f"Expected one SQL statement for {stage}")
    return probe.statements[0]


def _indexed(rows):
    index = {}
    for row in rows:
        key = (row["consumer_type"], row["consumer_key"])
        if key in index:
            raise AssertionError("Duplicate workload output key")
        index[key] = dict(row)
    return index


def _assert_same(before, after, stage):
    old = _indexed(before)
    new = _indexed(after)
    if old.keys() != new.keys():
        raise AssertionError(
            f"{stage}: workload population differs, "
            f"old={len(old)} new={len(new)}"
        )
    for key in old:
        if old[key].keys() != new[key].keys():
            raise AssertionError(f"{stage}: output columns differ for {key!r}")
        for field, lhs in old[key].items():
            rhs = new[key][field]
            if isinstance(lhs, (float, Decimal)) and isinstance(rhs, (float, Decimal)):
                if not math.isclose(float(lhs), float(rhs), rel_tol=1e-12, abs_tol=1e-10):
                    raise AssertionError(f"{stage}: {field} differs for {key!r}")
            elif lhs != rhs:
                raise AssertionError(f"{stage}: {field} differs for {key!r}")
    return len(old)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: compare-report-source-pruning-dev.py month YYYY-MM | week YYYY-MM-DD")
    period, value = sys.argv[1:]
    url = os.getenv("DATABASE_URL", "")
    if not url or make_url(url).database != "sphere_rundeck_dev":
        raise SystemExit("Refusing connection: DATABASE_URL must target sphere_rundeck_dev")
    if os.getenv("DB_MODE", "file").lower() not in {"db", "hybrid"}:
        raise SystemExit("Refusing connection: DB_MODE must be db or hybrid")
    if period == "month":
        start, end, previous = ev.calendar_month_bounds(value)
    elif period == "week":
        start, end, previous = ev.calendar_week_bounds(value)
    else:
        raise SystemExit("Period must be month or week")

    engine = get_engine()
    if engine is None:
        raise SystemExit("DEV engine unavailable")
    windows = [
        ("current_aggregate", (start, end)),
        ("previous_aggregate", (previous, start)),
        ("historical_baseline", (start, start)),
    ]
    print(f"PARITY_SCOPE={period}:{value} DB=DEV MODE=REPEATABLE_READ_READ_ONLY")
    with engine.connect() as conn:
        with conn.begin():
            conn.exec_driver_sql("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            conn.exec_driver_sql("SET LOCAL statement_timeout = '120s'")
            observed = bool(conn.execute(text(
                "SELECT to_regclass('public.rundeck_workload_observations') IS NOT NULL"
            )).scalar())
            for stage, args in windows:
                baseline_sql, baseline_params = _capture(stage, args, observed, optimized=False)
                candidate_sql, candidate_params = _capture(stage, args, observed, optimized=True)
                tick = time.perf_counter()
                baseline = conn.execute(text(baseline_sql), baseline_params).mappings().all()
                baseline_ms = round((time.perf_counter() - tick) * 1000)
                tick = time.perf_counter()
                candidate = conn.execute(text(candidate_sql), candidate_params).mappings().all()
                candidate_ms = round((time.perf_counter() - tick) * 1000)
                population = _assert_same(baseline, candidate, stage)
                print(
                    f"STAGE={stage} PARITY=PASS WORKLOADS={population} "
                    f"BASELINE_MS={baseline_ms} CANDIDATE_MS={candidate_ms} "
                    "TIMINGS_NOT_COLD_BENCHMARK=TRUE"
                )
    print("FINAL=PASS OUTPUT_PARITY=PASS DATABASE_WRITES=0")


if __name__ == "__main__":
    main()

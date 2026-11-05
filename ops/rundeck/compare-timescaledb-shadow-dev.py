#!/usr/bin/env python3
"""Isolated 7-day PostgreSQL vs TimescaleDB workload shadow-table POC, DEV only.

Modes:
  inspect: READ ONLY preflight, no writes (default)
  create: --confirm-dev creates two isolated POC schemas and copies exact same
          historical source snapshot into regular PG and empty-first hypertable
  bench: READ ONLY; executes exact report SQL from PR #94 (baseline/split-distinct)
         with the workload source pointed to either POC table
  cleanup: --confirm-dev --confirm-drop removes only both fixed POC schemas

No live-table DDL, migrations, extension changes, service restarts, retention,
compression, scheduler changes, or production database writes.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import pwd
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import psycopg
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[2]
DB = "sphere_rundeck_dev"
PG_SCHEMA = "sphere_ts_poc_pg"
TS_SCHEMA = "sphere_ts_poc_ts"
TABLE = "rundeck_workload_observations"
DATA_DIR = "/var/lib/postgresql/18/main"
START = datetime(2026, 10, 26, tzinfo=ZoneInfo("Asia/Jakarta"))
END = START + timedelta(days=7)
MAX_ROWS = 250_000
MIN_FREE_GIB = 8
MIN_REMAINING_GIB = 6
SCHEMAS = (PG_SCHEMA, TS_SCHEMA)
TABLE_REF = {s: f"{s}.{TABLE}" for s in SCHEMAS}


def emit(**fields):
    print(json.dumps(fields, sort_keys=True, default=str, separators=(",", ":")), flush=True)


def check_identity(cur):
    if pwd.getpwuid(os.geteuid()).pw_name != "postgres":
        raise RuntimeError("REFUSED: OS user must be postgres")
    cur.execute("""
        SELECT current_database(), current_user, inet_server_addr() IS NULL,
               EXISTS (SELECT 1 FROM pg_extension WHERE extname='timescaledb')
    """)
    db, role, local_socket, extension = cur.fetchone()
    if db != DB or role != "postgres" or not local_socket or not extension:
        raise RuntimeError("REFUSED: requires local DEV database with TimescaleDB")


def free_gib():
    fs = os.statvfs(DATA_DIR)
    return round(fs.f_bavail * fs.f_frsize / (1024 ** 3), 2)


def source_rows(cur):
    cur.execute(
        "SELECT count(*) FROM public.rundeck_workload_observations "
        "WHERE collected_at >= %s AND collected_at < %s", (START, END)
    )
    return int(cur.fetchone()[0])


def existing_schemas(cur):
    cur.execute("SELECT nspname FROM pg_namespace WHERE nspname = ANY(%s)",
                (list(SCHEMAS),))
    return sorted(row[0] for row in cur.fetchall())


def check_disk():
    available = free_gib()
    if available < MIN_FREE_GIB:
        raise RuntimeError("REFUSED: insufficient disk free space for bounded POC")
    return available


def inspect(cur):
    check_identity(cur)
    names = existing_schemas(cur)
    emit(mode="INSPECT", database=DB, extension="timescaledb",
         pg18_cluster="LOCAL", expected_max_rows=MAX_ROWS,
         observed_week_rows=source_rows(cur),
         week_start_wib=START.isoformat(), week_end_wib=END.isoformat(),
         disk_free_gib=free_gib(), schemas_present=names,
         data_writes=0)


def create(cur, conn):
    check_identity(cur)
    if existing_schemas(cur):
        raise RuntimeError("REFUSED: POC schema already present; no overwrite")
    before_free = check_disk()
    rows = source_rows(cur)
    if not 0 < rows <= MAX_ROWS:
        raise RuntimeError("REFUSED: source row count exceeds 7-day POC cap")

    with conn.transaction():
        cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
        cur.execute("SET LOCAL lock_timeout = '1500ms'")
        cur.execute("SET LOCAL statement_timeout = '180000ms'")
        cur.execute("SELECT pg_try_advisory_xact_lock(20261106, 195094)")
        if not cur.fetchone()[0]:
            raise RuntimeError("REFUSED: another POC create operation is running")
        if existing_schemas(cur):
            raise RuntimeError("REFUSED: POC schema appeared during setup")
        # Recheck source count under the same consistent snapshot used for both copies.
        rows = source_rows(cur)
        if not 0 < rows <= MAX_ROWS:
            raise RuntimeError("REFUSED: bounded row count changed")

        for schema in SCHEMAS:
            cur.execute(f'CREATE SCHEMA "{schema}"')
            # LIKE INCLUDING ALL preserves columns, checks, PK and indexes.
            # PostgreSQL LIKE does not copy FK constraints/triggers; production
            # collection FK behavior is intentionally out of scope for this POC.
            cur.execute(
                f'CREATE TABLE "{schema}"."{TABLE}" '
                f'(LIKE public."{TABLE}" INCLUDING ALL)'
            )

        # Convert ONLY the empty POC table. No migrate_data and no live-table lock.
        cur.execute(
            "SELECT * FROM create_hypertable("
            "%s::regclass, by_range('collected_at', INTERVAL '1 day'), "
            "create_default_indexes => FALSE, migrate_data => FALSE)",
            (TABLE_REF[TS_SCHEMA],)
        )
        if not cur.fetchone()[1]:
            raise RuntimeError("TimescaleDB POC hypertable was not created")

        counts = {}
        for schema in SCHEMAS:
            cur.execute(
                f'INSERT INTO "{schema}"."{TABLE}" '
                f'SELECT * FROM public."{TABLE}" '
                f'WHERE collected_at >= %s AND collected_at < %s',
                (START, END),
            )
            counts[schema] = cur.rowcount
            if cur.rowcount != rows:
                raise RuntimeError("REFUSED: copy count differs from source snapshot")
            if free_gib() < MIN_REMAINING_GIB:
                raise RuntimeError("REFUSED: POC exceeded reserved disk headroom")
        for l, r in ((PG_SCHEMA, TS_SCHEMA), (TS_SCHEMA, PG_SCHEMA)):
            cur.execute(
                f'SELECT count(*) FROM ('
                f'SELECT * FROM "{l}"."{TABLE}" '
                f'EXCEPT ALL SELECT * FROM "{r}"."{TABLE}"'
                f') difference'
            )
            if cur.fetchone()[0]:
                raise RuntimeError("REFUSED: source-copy data parity mismatch")

        for schema in SCHEMAS:
            cur.execute(f'ANALYZE "{schema}"."{TABLE}"')
        emit(mode="CREATE", database=DB, week_rows=rows,
             copies=counts, copy_parity="PASS", chunk_interval="1 day",
             free_before_gib=before_free, free_after_gib=free_gib(),
             source_unchanged=True, retention_policy="NONE",
             note="Schema creation transaction will commit only after validation")
    emit(final="PASS", mode="CREATE", original_tables_modified=False)


def capture_helpers():
    source = ROOT / "ops/rundeck/compare-report-split-distinct-dev.py"
    if not source.is_file():
        raise RuntimeError("PR #94 comparator unavailable in this source snapshot")
    spec = importlib.util.spec_from_file_location("sphere_report_parity_helper", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def query_variant(sql, schema):
    # Exactly two references in original UNION source: observed and NOT EXISTS.
    expected = "FROM rundeck_workload_observations wo"
    occurrences = sql.count(expected)
    if occurrences != 2:
        raise RuntimeError(f"REFUSED: report SQL structure changed; refs={occurrences}")
    updated = sql.replace(expected, f"FROM {TABLE_REF[schema]} wo")
    if expected in updated:
        raise RuntimeError("REFUSED: unresolved unqualified workload source")
    return updated


def psycopg_params(sql):
    # Convert SQLAlchemy bind notation to psycopg3 named binds (never f-string values).
    return re.sub(r"(?<!:):(start|end|consumer_type)\b", r"%(\1)s", sql)


def sql_for(helper, baseline, start, end):
    sql, params = helper.capture(start, end, candidate=not baseline)
    return sql, params


def walk_plan(plan):
    yield plan
    for child in plan.get("Plans", []):
        yield from walk_plan(child)


def bench(cur, conn, *, reverse=False, scope="week"):
    check_identity(cur)
    start = START if scope == "week" else START + timedelta(days=3)
    end = END if scope == "week" else start + timedelta(days=1)
    if existing_schemas(cur) != sorted(SCHEMAS):
        raise RuntimeError("REFUSED: create both POC schemas before benchmarking")
    cur.execute("""
        SELECT hypertable_schema, hypertable_name
          FROM timescaledb_information.hypertables
         WHERE hypertable_schema = %s AND hypertable_name = %s
    """, (TS_SCHEMA, TABLE))
    if len(cur.fetchall()) != 1:
        raise RuntimeError("REFUSED: expected shadow hypertable missing")

    helper = capture_helpers()
    experiments = []
    for baseline in (True, False):
        original, params = sql_for(helper, baseline, start, end)
        for schema in SCHEMAS:
            label = ("BASELINE" if baseline else "SPLIT_DISTINCT") + (
                "_PG" if schema == PG_SCHEMA else "_TS"
            )
            experiments.append((label, query_variant(original, schema), params))
    if reverse:
        experiments.reverse()
    source_count = source_rows(cur)
    cur.execute(f'SELECT count(*) FROM "{PG_SCHEMA}"."{TABLE}"')
    sample_rows = int(cur.fetchone()[0])
    if source_count != sample_rows or source_count > MAX_ROWS:
        raise RuntimeError("REFUSED: source snapshot no longer matches POC; rebuild later")

    results = {}
    with conn.transaction():
        cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        cur.execute("SET LOCAL lock_timeout = '1500ms'")
        cur.execute("SET LOCAL statement_timeout = '120000ms'")
        cur.execute("SET LOCAL work_mem = '4MB'")
        emit(mode="BENCH", period=("week:2026-10-26" if scope == "week"
                                   else "day:2026-10-29"),
             read_only=True, source_rows=sample_rows, reverse=reverse,
             note="sequential shared-cache timings, not cold-cache results")
        for label, raw_sql, params in experiments:
            sql = psycopg_params(raw_sql)
            with conn.cursor(row_factory=dict_row) as mapped:
                mapped.execute(sql, params)
                results[label] = mapped.fetchall()
            emit(parity_stage=label, workloads=len(results[label]))
        for label in ("BASELINE", "SPLIT_DISTINCT"):
            count = helper.compare_all_fields(results[label + "_PG"], results[label + "_TS"])
            emit(parity="PASS", compare=label + "_PG_VS_TS",
                 workloads=count, fields="ALL")
        for suffix in ("_PG", "_TS"):
            count = helper.compare_all_fields(
                results["BASELINE" + suffix], results["SPLIT_DISTINCT" + suffix]
            )
            emit(parity="PASS", compare="BASELINE_VS_SPLIT" + suffix,
                 workloads=count, fields="ALL")
        timings = {}
        for label, raw_sql, params in experiments:
            sql = psycopg_params(raw_sql)
            cur.execute("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql, params)
            plan_result = cur.fetchone()[0][0]
            plan = plan_result["Plan"]
            scan_nodes = [
                node.get("Node Type") for node in walk_plan(plan)
                if node.get("Node Type") in {"Seq Scan", "Index Scan", "Index Only Scan",
                                            "Bitmap Heap Scan", "ChunkAppend", "Custom Scan"}
            ]
            elapsed = round(float(plan_result["Execution Time"]), 3)
            timings[label] = elapsed
            emit(actual=label, execution_ms=elapsed,
                 shared_read=plan.get("Shared Read Blocks", 0),
                 shared_hit=plan.get("Shared Hit Blocks", 0),
                 temp_read=plan.get("Temp Read Blocks", 0),
                 temp_written=plan.get("Temp Written Blocks", 0),
                 scans=scan_nodes[:20])
        emit(final="PASS", read_only=True, all_field_parity="PASS",
             timings_ms=timings,
             note="POC 7-day result cannot predict full monthly runtime")


def cleanup(cur, conn):
    check_identity(cur)
    present = existing_schemas(cur)
    if not present:
        emit(mode="CLEANUP", removed=0)
        return
    if present != sorted(SCHEMAS):
        raise RuntimeError("REFUSED: incomplete POC schema pair; manual investigation")
    # Schema names are hardcoded and DROP is RESTRICT, never CASCADE.
    with conn.transaction():
        cur.execute("SET LOCAL lock_timeout = '1500ms'")
        cur.execute("SET LOCAL statement_timeout = '120000ms'")
        cur.execute("SELECT pg_try_advisory_xact_lock(20261106, 195094)")
        if not cur.fetchone()[0]:
            raise RuntimeError("REFUSED: POC lock unavailable")
        for schema in SCHEMAS:
            cur.execute(f'DROP TABLE "{schema}"."{TABLE}"')
            cur.execute(f'DROP SCHEMA "{schema}" RESTRICT')
    emit(final="PASS", mode="CLEANUP", removed=2, production_tables_modified=False)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("inspect", "create", "bench", "cleanup"),
                        default="inspect")
    parser.add_argument("--confirm-dev", action="store_true")
    parser.add_argument("--confirm-drop", action="store_true")
    parser.add_argument("--reverse", action="store_true")
    parser.add_argument("--scope", choices=("week", "day"), default="week",
                        help="Weekly report SQL or one-day window for chunk-pruning contrast")
    args = parser.parse_args(argv)
    if args.mode in {"create", "cleanup"} and not args.confirm_dev:
        parser.error("Writes require --confirm-dev")
    if args.mode == "cleanup" and not args.confirm_drop:
        parser.error("Cleanup requires --confirm-drop")
    if args.mode != "bench" and args.reverse:
        parser.error("--reverse is benchmark-only")
    if pwd.getpwuid(os.geteuid()).pw_name != "postgres":
        raise SystemExit("REFUSED: OS user must be postgres")
    try:
        with psycopg.connect(dbname=DB, user="postgres",
                            host="/var/run/postgresql",
                            autocommit=True, row_factory=dict_row) as conn:
            # Use a tuple-based cursor for strict fixed-column catalog results.
            with conn.cursor(row_factory=psycopg.rows.tuple_row) as cur:
                if args.mode == "inspect":
                    inspect(cur)
                elif args.mode == "create":
                    create(cur, conn)
                elif args.mode == "cleanup":
                    cleanup(cur, conn)
                else:
                    bench(cur, conn, reverse=args.reverse, scope=args.scope)
    except Exception as exc:
        emit(final="BLOCKED", mode=args.mode, error_type=type(exc).__name__,
             note="No modifications to original tables; POC transaction rolls back on failure")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

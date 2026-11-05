#!/usr/bin/env python3
"""Inspect/optionally enable TimescaleDB on SPHERE's DEV database only.

Default invocation is strictly read-only. The explicit --apply action creates
ONLY the TimescaleDB extension in sphere_rundeck_dev when it is already
installed and preloaded. It NEVER installs packages, modifies PostgreSQL
configuration, restarts services, migrates tables, or creates hypertables.

Read-only: runuser -u sphere -- /opt/sphere-rundeck-dev/venv/bin/python \
             ops/rundeck/timescaledb-dev-control.py
Activation: runuser -u postgres -- /opt/sphere-rundeck-dev/venv/bin/python \
             ops/rundeck/timescaledb-dev-control.py --apply --confirm-dev
"""
from __future__ import annotations

import argparse
import json
import os
import pwd
import sys
from pathlib import Path

DB_NAME = "sphere_rundeck_dev"
SOCKET = "/var/run/postgresql"
ALLOWED_TABLES = (
    "rundeck_host_metrics",
    "rundeck_top_consumers",
    "rundeck_workload_observations",
)


def is_preloaded(value: str) -> bool:
    return "timescaledb" in {
        part.strip().strip("'").strip('"').lower()
        for part in value.split(",")
    }


def classify(available: bool, installed: bool, preloaded: bool) -> str:
    if installed:
        return "ENABLED"
    if not available:
        return "PACKAGE_NOT_AVAILABLE"
    if not preloaded:
        return "NEEDS_POSTGRESQL_PRELOAD_AND_CONTROLLED_RESTART"
    return "READY_FOR_EXTENSION_CREATION"


def validate_identity(db: str, role: str, *, apply: bool, local_socket: bool) -> None:
    if db != DB_NAME:
        raise RuntimeError("REFUSED: unexpected database")
    if role != ("postgres" if apply else "sphere"):
        raise RuntimeError("REFUSED: unexpected database role")
    if not local_socket:
        raise RuntimeError("REFUSED: remote database connection")
    if pwd.getpwuid(os.geteuid()).pw_name != role:
        raise RuntimeError("REFUSED: unexpected operating system user")


def get_report(cur) -> dict:
    cur.execute("""
        SELECT current_database(), current_user,
               inet_server_addr() IS NULL,
               current_setting('server_version'),
               current_setting('shared_preload_libraries')
    """)
    db, role, local_socket, version, preload = cur.fetchone()
    cur.execute("""
        SELECT default_version
          FROM pg_available_extensions
         WHERE name='timescaledb'
    """)
    available = cur.fetchone()
    cur.execute("""
        SELECT extversion FROM pg_extension WHERE extname='timescaledb'
    """)
    installed = cur.fetchone()
    cur.execute("""
        SELECT relname, n_live_tup::bigint
          FROM pg_stat_user_tables
         WHERE schemaname='public'
           AND relname = ANY(%s)
         ORDER BY relname
    """, (list(ALLOWED_TABLES),))
    tables = [{"table": n, "estimated_rows": count} for n, count in cur.fetchall()]
    hypertables = []
    if installed:
        cur.execute("""
            SELECT hypertable_name
              FROM timescaledb_information.hypertables
             WHERE hypertable_schema='public'
             ORDER BY hypertable_name
        """)
        hypertables = [name for (name,) in cur.fetchall()]
    return {
        "database": db,
        "role": role,
        "local_socket": local_socket,
        "postgresql_version": version,
        "timescaledb_available_version": available[0] if available else None,
        "timescaledb_installed_version": installed[0] if installed else None,
        "timescaledb_preloaded": is_preloaded(preload),
        "extension_status": classify(bool(available), bool(installed), is_preloaded(preload)),
        "hypertables": hypertables,
        "tables": tables,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true",
                        help="Create extension only; no package install, restart or hypertable")
    parser.add_argument("--confirm-dev", action="store_true",
                        help="Mandatory when using --apply")
    args = parser.parse_args(argv)
    if args.apply and not args.confirm_dev:
        parser.error("--apply requires --confirm-dev")

    role = "postgres" if args.apply else "sphere"
    if pwd.getpwuid(os.geteuid()).pw_name != role:
        print("REFUSED: wrong OS user", file=sys.stderr)
        return 2

    import psycopg

    try:
        with psycopg.connect(dbname=DB_NAME, user=role, host=SOCKET) as conn:
            with conn.cursor() as cur:
                if not args.apply:
                    cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
                cur.execute("SET LOCAL statement_timeout = '5000ms'")
                cur.execute("SET LOCAL lock_timeout = '1000ms'")
                report = get_report(cur)
                validate_identity(
                    report["database"], report["role"], apply=args.apply,
                    local_socket=report["local_socket"],
                )
                if args.apply:
                    if report["extension_status"] == "ENABLED":
                        result = "ALREADY_ENABLED"
                    elif report["extension_status"] != "READY_FOR_EXTENSION_CREATION":
                        raise RuntimeError(
                            "REFUSED: TimescaleDB package/preload not ready; "
                            "do not restart PostgreSQL automatically"
                        )
                    else:
                        cur.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")
                        result = "EXTENSION_CREATED"
                    # The context commits only after the full transaction succeeds.
                    report = get_report(cur)
                    if report["extension_status"] != "ENABLED":
                        raise RuntimeError("REFUSED: extension activation was not confirmed")
                    report["activation"] = result
                else:
                    report["activation"] = "NONE_READ_ONLY"
        print(json.dumps(report, sort_keys=True, separators=(",", ":")))
        return 0
    except (Exception,) as exc:
        # No database/host details or credentials are exposed.
        print("TIMESCALE_DEV=BLOCKED TYPE=" + type(exc).__name__, file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

"""DEV split-distinct candidate: baseline contract and PostgreSQL parity fixtures.

Integration runs only against an isolated CI database named sphere_parity_ci.
Tables are created within a rolled-back transaction; never run against DEV/PROD.
"""
from __future__ import annotations

import json
import math
import os
import unittest
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from backend import rundeck_evaluation as evaluation


START = datetime(2026, 9, 30, 17, tzinfo=timezone.utc)
END = datetime(2026, 10, 31, 17, tzinfo=timezone.utc)


class _Rows:
    def scalar(self):
        return True

    def __iter__(self):
        return iter(())


class _Probe:
    def __init__(self):
        self.statements = []

    def execute(self, statement, params=None):
        sql = str(statement)
        self.statements.append((sql, params))
        return _Rows()


class SplitDistinctContractTests(unittest.TestCase):
    def test_opt_in_default_preserves_baseline_and_legacy_identity(self):
        default = _Probe()
        candidate = _Probe()
        evaluation._aggregate_window(default, START, END, "ALL")
        evaluation._aggregate_window(candidate, START, END, "ALL", identity_preaggregate=True)
        baseline_sql = default.statements[-1][0]
        candidate_sql = candidate.statements[-1][0]

        self.assertIn("COUNT(DISTINCT (tc.collection_id, tc.host))", baseline_sql)
        self.assertNotIn("input_rows AS MATERIALIZED", baseline_sql)
        self.assertIn("input_rows AS MATERIALIZED", candidate_sql)
        self.assertIn("collection_host_keys AS MATERIALIZED", candidate_sql)
        self.assertNotIn("COUNT(DISTINCT", candidate_sql)
        self.assertIn("BOOL_OR(critical_wp)", candidate_sql)
        self.assertIn("IS NOT DISTINCT FROM s.consumer_key", candidate_sql)
        for sql in (baseline_sql, candidate_sql):
            self.assertIn("NOT EXISTS", sql)
            self.assertIn("wo.collected_at = tc.collected_at", sql)
            self.assertIn("COALESCE(c.finished_at, c.started_at)", sql)
            self.assertIn("wo.collected_at >= :start", sql)
            self.assertIn("tc.collected_at < :end", sql)

    def test_consumer_type_parameters_unchanged(self):
        for consumer_type in ("ALL", "JOB", "PROGRAM"):
            with self.subTest(consumer_type=consumer_type):
                probe = _Probe()
                evaluation._aggregate_window(
                    probe, START, END, consumer_type, identity_preaggregate=True,
                )
                sql, params = probe.statements[-1]
                self.assertEqual(params["start"], START)
                self.assertEqual(params["end"], END)
                self.assertEqual(params.get("consumer_type"), (
                    consumer_type if consumer_type != "ALL" else None
                ))
                self.assertEqual(
                    "AND tc.consumer_type = :consumer_type" in sql,
                    consumer_type != "ALL",
                )


class SplitDistinctPostgresParityTests(unittest.TestCase):
    def test_all_aggregate_fields_match_with_real_postgres(self):
        url = os.environ.get("SPHERE_PG_PARITY_URL", "")
        if not url:
            self.skipTest("Isolated CI PostgreSQL URL not configured")
        if make_url(url).database != "sphere_parity_ci":
            self.fail("REFUSED: parity test is restricted to sphere_parity_ci")

        engine = create_engine(url)
        try:
            with engine.connect() as conn:
                transaction = conn.begin()
                try:
                    self._fixtures(conn)
                    for consumer_type in ("ALL", "JOB", "PROGRAM"):
                        with self.subTest(consumer_type=consumer_type):
                            baseline = evaluation._aggregate_window(conn, START, END, consumer_type)
                            optimized = evaluation._aggregate_window(
                                conn, START, END, consumer_type, identity_preaggregate=True,
                            )
                            self._assert_all_fields(baseline, optimized)
                            if consumer_type == "ALL":
                                by_key = {(r["consumer_type"], r["consumer_key"]): r for r in baseline}
                                self.assertEqual(by_key[("JOB", "K1")]["occurrences"], 3)
                                self.assertEqual(by_key[("JOB", "K1")]["critical_wp_checks"], 2)
                                self.assertEqual(by_key[("JOB", "K1")]["observations"], 5)
                                self.assertEqual(by_key[("JOB", "K1")]["host_observations"], 4)
                                self.assertIn(("PROGRAM", "P1"), by_key)
                                self.assertIn(("JOB", None), by_key)
                                self.assertNotIn(("JOB", "incomplete"), by_key)
                                self.assertNotIn(("JOB", "november"), by_key)
                finally:
                    transaction.rollback()  # Transactional DDL and fixture rows removed.
        finally:
            engine.dispose()

    @staticmethod
    def _assert_all_fields(baseline, optimized):
        a = {(r["consumer_type"], r["consumer_key"]): r for r in baseline}
        b = {(r["consumer_type"], r["consumer_key"]): r for r in optimized}
        assert a.keys() == b.keys(), "Workload population mismatch"
        for key in a:
            assert a[key].keys() == b[key].keys(), "Aggregate output fields changed"
            for field in a[key]:
                lhs, rhs = a[key][field], b[key][field]
                if isinstance(lhs, (float, Decimal)) and isinstance(rhs, (float, Decimal)):
                    assert math.isclose(float(lhs), float(rhs),
                                        rel_tol=1e-12, abs_tol=1e-10), (
                        f"Numeric aggregate differs: {field}"
                    )
                else:
                    assert lhs == rhs, f"Aggregate differs: {field}"

    @staticmethod
    def _fixtures(conn):
        conn.exec_driver_sql("""CREATE TABLE rundeck_collections (
          collection_id TEXT PRIMARY KEY, status TEXT, expected_host_count INTEGER,
          received_host_count INTEGER, finished_at TIMESTAMPTZ, started_at TIMESTAMPTZ
        )""")
        conn.exec_driver_sql("""CREATE TABLE rundeck_host_metrics (
          collection_id TEXT, host TEXT, wp_critical INTEGER, cpu_pct DOUBLE PRECISION
        )""")
        conn.exec_driver_sql("""CREATE TABLE rundeck_workload_observations (
          collection_id TEXT, collected_at TIMESTAMPTZ, host TEXT, consumer_type TEXT,
          consumer_key TEXT, cpu_pct DOUBLE PRECISION, ram_pct DOUBLE PRECISION, details JSONB
        )""")
        conn.exec_driver_sql("""CREATE TABLE rundeck_top_consumers (
          collection_id TEXT, collected_at TIMESTAMPTZ, host TEXT, consumer_type TEXT,
          consumer_key TEXT, rank INTEGER, cpu_pct DOUBLE PRECISION,
          ram_pct DOUBLE PRECISION, details JSONB
        )""")
        def dt(day, hour=10):
            return datetime(2026, 10, day, hour, tzinfo=timezone.utc)

        collections = [
            ("a", "READY", 2, 2, dt(15), None),
            ("b", "READY", 2, 2, dt(16), None),
            ("legacy", "READY", 2, 2, dt(17), None),
            ("partial", "READY", 2, 1, dt(18), None),
            ("nov", "READY", 2, 2, END, None),
            ("started", "READY", 1, 1, None, dt(11)),
            ("null-date", "READY", 1, 1, None, None),
        ]
        for cid, status, expected, received, finished, started in collections:
            conn.execute(text("""INSERT INTO rundeck_collections VALUES
                (:cid,:status,:expected,:received,:finished,:started)"""),
                dict(cid=cid, status=status, expected=expected, received=received,
                     finished=finished, started=started))

        for cid, host, wp, cpu in [
            ("a", "APP1", 3, 80), ("a", "APP2", 0, 60),
            ("b", "APP1", 0, 50), ("b", "APP2", 4, 90),
            ("legacy", "APP3", 2, 96), ("started", "APP1", 0, 33),
            ("partial", "APP1", 6, 99),
        ]:
            conn.execute(text("""INSERT INTO rundeck_host_metrics
                (collection_id,host,wp_critical,cpu_pct) VALUES (:cid,:host,:wp,:cpu)"""),
                dict(cid=cid, host=host, wp=wp, cpu=cpu))

        def insert(table, cid, host, typ, key, ts, cpu, *,
                   rank=2, pss="1.25", aggregate=False, process="3"):
            details = {
                "performance_rank": str(rank), "total_pss_gb": pss,
                "pss_gb": "0.25", "process_count": process,
                "resource_aggregation": "SUM_BY_CONSUMER" if aggregate else "OTHER",
            }
            vals = dict(cid=cid, ts=ts, host=host, typ=typ, key=key, cpu=cpu,
                        ram=10.0, details=json.dumps(details), rank=rank)
            if table == "rundeck_workload_observations":
                conn.execute(text("""INSERT INTO rundeck_workload_observations
                    VALUES (:cid,:ts,:host,:typ,:key,:cpu,:ram,CAST(:details AS JSONB))"""), vals)
            else:
                conn.execute(text("""INSERT INTO rundeck_top_consumers
                    VALUES (:cid,:ts,:host,:typ,:key,:rank,:cpu,:ram,CAST(:details AS JSONB))"""), vals)

        insert("rundeck_workload_observations", "a", "APP1", "JOB", "K1", dt(15), 90, aggregate=True)
        insert("rundeck_workload_observations", "a", "APP2", "JOB", "K1", dt(15), 80)
        insert("rundeck_workload_observations", "b", "APP1", "JOB", "K1", dt(16), 70, pss="", process="")
        insert("rundeck_workload_observations", "a", "APP1", "PROGRAM", "P1", dt(15), 32)
        insert("rundeck_workload_observations", "b", "APP1", "JOB", None, dt(16), 60)
        insert("rundeck_workload_observations", "a", "APP1", "PROCESS", "EXCLUDE", dt(15), 50)
        # Overlapping top-consumer identity is discarded; unmatched legacy is retained.
        insert("rundeck_top_consumers", "a", "APP1", "JOB", "K1", dt(15), 999)
        insert("rundeck_top_consumers", "legacy", "APP3", "JOB", "K1", dt(17), 33)
        insert("rundeck_top_consumers", "legacy", "APP3", "JOB", "K1", dt(17), 44)
        insert("rundeck_top_consumers", "started", "APP1", "JOB", "K2", dt(11), 55)
        insert("rundeck_top_consumers", "partial", "APP1", "JOB", "incomplete", dt(18), 200)
        insert("rundeck_top_consumers", "nov", "APP1", "JOB", "november", END, 200)
        insert("rundeck_top_consumers", "a", "APP1", "JOB", "null-date", None, 200)
        insert("rundeck_top_consumers", "b", None, "PROGRAM", "P2", dt(16), 8)


if __name__ == "__main__":
    unittest.main()

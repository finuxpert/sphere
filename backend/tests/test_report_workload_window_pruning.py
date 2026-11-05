"""Report source time-bound predicate regressions; keep all legacy rows."""
from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from backend import rundeck_evaluation as evaluation


class Result:
    def scalar(self):
        return True


class SourceProbe:
    def __init__(self):
        self.queries = []
    def execute(self, sql, params=None):
        self.queries.append((str(sql), params))
        return Result()


class TestWorkloadPeriodPruning(unittest.TestCase):
    def test_week_month_source_has_exact_range_on_both_union_arms(self):
        conn = SourceProbe()
        relation, scope = evaluation._workload_source_relation(
            conn, window=("start", "end"), job_program_only=True,
        )
        self.assertEqual(scope, "ALL_OBSERVED_ACTIVE_WORKLOADS")
        self.assertIn("wo.collected_at >= :start", relation)
        self.assertIn("wo.collected_at < :end", relation)
        self.assertIn("tc.collected_at >= :start", relation)
        self.assertIn("tc.collected_at < :end", relation)
        self.assertIn("WHERE wo.consumer_type IN ('JOB', 'PROGRAM')", relation)
        self.assertIn("tc.consumer_type IN ('JOB', 'PROGRAM')", relation)
        self.assertNotIn("'PROCESS'", relation)
        self.assertIn("UNION ALL", relation)
        self.assertIn("NOT EXISTS", relation)
        for attr in ("collection_id","collected_at","host","consumer_type","consumer_key"):
            self.assertIn(f"wo.{attr} = tc.{attr}", relation)
        self.assertEqual(len(conn.queries), 1)

    def test_recent_shift_uses_previous_start_and_evidence_preserves_process(self):
        conn = SourceProbe()
        shift, _ = evaluation._workload_source_relation(
            conn, window=("previous_start", "end"), job_program_only=True,
        )
        self.assertIn(":previous_start", shift)
        self.assertNotIn(">= :start", shift)
        error_source, _ = evaluation._workload_source_relation(
            conn, window=("start", "end"),
        )
        self.assertIn("'PROCESS'", error_source)
        self.assertIn("WHERE TRUE AND wo.collected_at >= :start", error_source)

    def test_unrecognized_sql_bindings_rejected(self):
        conn = SourceProbe()
        for pair in (("unsafe", "end"), ("start", "unsafe")):
            with self.assertRaises(ValueError):
                evaluation._workload_source_relation(conn, window=pair)

    def test_existing_aggregate_uses_bounded_source_without_changing_row_fields(self):
        class FakeConn(SourceProbe):
            def execute(self, sql, params=None):
                query = str(sql)
                self.queries.append((query, params))
                if "to_regclass('public.rundeck_workload_observations')" in query:
                    return Result()
                class Rows:
                    def __iter__(self):
                        return iter(())
                return Rows()
        conn = FakeConn()
        end = datetime(2026, 11, 1, tzinfo=timezone.utc)
        start = end - timedelta(days=7)
        rows = evaluation._aggregate_window(conn, start, end, "ALL")
        self.assertEqual(rows, [])
        q, params = conn.queries[1]
        self.assertIn("wo.collected_at >= :start", q)
        self.assertIn("tc.collected_at >= :start", q)
        self.assertEqual(params["start"], start)
        self.assertEqual(params["end"], end)
        for field in ("occurrences","observations","peak_cpu_pct","peak_pss_gb","critical_wp_checks"):
            self.assertIn("AS "+field, q)


if __name__ == "__main__":
    unittest.main()

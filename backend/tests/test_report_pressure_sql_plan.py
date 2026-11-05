"""Report SQL performance changes must preserve the observed evidence contract."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone

from backend.rundeck_monthly_pressure import monthly_pressure_observations


class FakeResult:
    def mappings(self):
        return self
    def all(self):
        return []


class CaptureConn:
    def __init__(self):
        self.queries = []
    def execute(self, query, params=None):
        self.queries.append((str(query), dict(params or {})))
        return FakeResult()


class TestReportPressureSargableJoin(unittest.TestCase):
    def test_correlation_timestamps_expose_indexed_range_and_preserve_all_filters(self):
        conn = CaptureConn()
        start = datetime(2026, 10, 25, 17, tzinfo=timezone.utc)
        end = datetime(2026, 11, 1, 17, tzinfo=timezone.utc)
        result = monthly_pressure_observations(
            conn, start, end, "rundeck_workload_observations",
            "c.status = 'READY'",
        )
        self.assertEqual(len(conn.queries), 2)
        sql, params = conn.queries[1]
        self.assertIn("tc.collection_id = hm.collection_id", sql.replace("hm.collection_id = tc.collection_id","tc.collection_id = hm.collection_id"))
        self.assertIn("hm.host = tc.host", sql)
        self.assertIn("hm.collected_at >= tc.collected_at - (:max_skew_seconds * INTERVAL '1 second')", sql)
        self.assertIn("hm.collected_at <= tc.collected_at + (:max_skew_seconds * INTERVAL '1 second')", sql)
        self.assertNotIn("ABS(EXTRACT(EPOCH", sql)
        self.assertIn("hm.collected_at >= :start AND hm.collected_at < :end", sql)
        self.assertEqual(params["max_skew_seconds"], 900)
        self.assertEqual(result["correlation"], {})

    def test_host_only_preview_still_skips_costly_workload_correlation(self):
        conn = CaptureConn()
        start = datetime(2026, 10, 25, 17, tzinfo=timezone.utc)
        end = datetime(2026, 11, 1, 17, tzinfo=timezone.utc)
        result = monthly_pressure_observations(
            conn, start, end, "rundeck_workload_observations",
            "c.status = 'READY'", include_correlation=False,
        )
        self.assertEqual(len(conn.queries), 1)
        self.assertEqual(result["correlation"], {})


if __name__ == "__main__":
    unittest.main()

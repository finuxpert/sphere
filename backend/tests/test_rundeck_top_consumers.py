"""Offline regression for short-window source-backed CPU and Memory rankings."""
from datetime import datetime, timedelta, timezone
import unittest
from unittest.mock import patch

from backend.rundeck_top_consumers import _bounds, _rank, top_consumers_window

NOW = datetime(2026, 11, 3, 8, 4, tzinfo=timezone.utc)
ANCHOR = datetime(2026, 11, 3, 8, 2, 17, tzinfo=timezone.utc)


class _Row:
    def __init__(self, mapping):
        self._mapping = mapping


class _Rows:
    def __init__(self, rows=None, count=None):
        self.rows = rows or []
        self.count = count

    def __iter__(self):
        return iter(_Row(item) for item in self.rows)

    def scalar_one(self):
        return self.count


class _Connection:
    def __init__(self, rows, count):
        self.rows = rows
        self.count = count
        self.queries = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, statement, params=None):
        statement = str(statement)
        self.queries.append((statement, params))
        if "SELECT tc.consumer_type" in statement:
            return _Rows(self.rows)
        if "SELECT COUNT(*) FROM rundeck_collections" in statement:
            return _Rows(count=self.count)
        raise AssertionError("Unexpected query: " + statement[:100])


class _Engine:
    def __init__(self, conn):
        self.conn = conn

    def connect(self):
        return self.conn


class TopConsumersTests(unittest.TestCase):
    def test_preset_is_anchored_to_last_complete_collection(self):
        start, end = _bounds("30m", None, None, anchor=ANCHOR, now=NOW)
        self.assertEqual(end, ANCHOR + timedelta(microseconds=1))
        self.assertEqual(end - start, timedelta(minutes=30))

    def test_custom_timestamp_is_wib_aware_and_bounded(self):
        start, end = _bounds("custom", "2026-11-03T14:30:00+07:00",
                             "2026-11-03T15:00:00+07:00", now=NOW)
        self.assertEqual(start.isoformat(), "2026-11-03T07:30:00+00:00")
        self.assertEqual(end.isoformat(), "2026-11-03T08:00:00+00:00")

        bad = (
            ("custom", "2026-11-03T14:30", "2026-11-03T15:00"),
            ("custom", "2026-11-03T14:30+07:00", "2026-11-03T14:31+07:00"),
            ("custom", "2026-11-02T12:00+07:00", "2026-11-03T15:00+07:00"),
            ("custom", "2026-11-03T14:30+07:00", "2026-11-04T16:00+07:00"),
            ("custom", "2026-11-03T15:00+07:00", "2026-11-03T14:30+07:00"),
            ("custom", None, "2026-11-03T14:30+07:00"),
            ("1h", "2026-11-03T14:30+07:00", "2026-11-03T15:00+07:00"),
            ("bogus", None, None),
        )
        for range_key, from_at, to_at in bad:
            with self.subTest(range=range_key, from_at=from_at, to_at=to_at):
                with self.assertRaises(ValueError):
                    _bounds(range_key, from_at, to_at, anchor=ANCHOR, now=NOW)

    def test_cpu_memory_are_ranked_independently_from_all_rows(self):
        rows = [
            {"consumer_type": "PROGRAM", "consumer_key": "ZCPU",
             "avg_cpu_pct": 122.0, "avg_pss_gb": 0.5,
             "observations": 3, "collection_checks": 3, "aggregate_observations": 3,
             "last_seen": ANCHOR},
            {"consumer_type": "JOB", "consumer_key": "ZMEM",
             "avg_cpu_pct": 48.0, "avg_pss_gb": 12.25,
             "observations": 2, "collection_checks": 2, "aggregate_observations": 2,
             "last_seen": ANCHOR},
            {"consumer_type": "PROGRAM", "consumer_key": "ZNULL",
             "avg_cpu_pct": None, "avg_pss_gb": None,
             "observations": 1, "collection_checks": 1, "aggregate_observations": 0,
             "last_seen": ANCHOR},
        ]
        connection = _Connection(rows, count=3)
        with patch("backend.rundeck_top_consumers.get_engine", return_value=_Engine(connection)), \
             patch("backend.rundeck_top_consumers._anchor_collection", return_value=(ANCHOR, "test-id")), \
             patch("backend.rundeck_top_consumers._workload_source_relation",
                   return_value=("rundeck_workload_observations", "ALL_OBSERVED_ACTIVE_WORKLOADS")):
            result = top_consumers_window("30m", now=NOW)
        self.assertEqual(result["complete_checks"], 3)
        self.assertEqual(result["observed_workloads"], 3)
        self.assertEqual(result["cpu"][0]["consumer_key"], "ZCPU")
        self.assertEqual(result["cpu"][0]["value"], 1.22)
        self.assertEqual(result["memory"][0]["consumer_key"], "ZMEM")
        self.assertEqual(result["memory"][0]["value"], 12.25)
        self.assertEqual(len(result["memory"]), 2)
        statement, params = connection.queries[0]
        self.assertIn("c.status = 'READY'", statement)
        self.assertIn("GROUP BY tc.consumer_type, tc.consumer_key", statement)
        self.assertIn("AVG(tc.cpu_pct)", statement)
        self.assertIn("total_pss_gb", statement)
        self.assertIn("tc.collected_at >= :start", statement)
        self.assertNotIn("LIMIT 10", statement)
        self.assertEqual(params["end"] - params["start"], timedelta(minutes=30))

    def test_zero_and_missing_values_do_not_become_fake_measurements(self):
        values = [
            {"consumer_type": "JOB", "consumer_key": "ONE", "avg_cpu_pct": 0,
             "observations": 1, "collection_checks": 1},
            {"consumer_type": "JOB", "consumer_key": "MISSING", "avg_cpu_pct": None,
             "observations": 1, "collection_checks": 1},
        ]
        output = _rank(values, "avg_cpu_pct")
        self.assertEqual(len(output), 1)
        self.assertEqual(output[0]["value"], 0)
        self.assertEqual(_rank([], "avg_pss_gb"), [])


if __name__ == "__main__":
    unittest.main()

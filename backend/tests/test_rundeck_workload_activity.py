"""Regression checks for existing RCA-WP workload and WP-type chart evidence."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest import TestCase
from unittest.mock import patch

from backend.rundeck_workload_activity import (
    WP_TYPES, _ACTIVITY_CACHE, normalize_activity_row, workload_activity_trends,
)

ANCHOR = datetime(2026, 11, 3, 8, 2, 17, tzinfo=timezone.utc)
NOW = ANCHOR + timedelta(minutes=1)


def _point(collection_id, at, *, jobs=7, programs=5, wp=None, sources=12):
    wp = wp or {"dia": 3, "btc": 2, "upd": 1, "enq": 0, "other": 0}
    return {
        "collection_id": collection_id, "sampled_at": at, "jobs": jobs,
        "programs": programs, "source_rows": sources, "wp_count": sum(wp.values()),
        **wp,
    }


class _Results:
    def __init__(self, rows, count=None):
        self.rows = rows
        self.count = count

    def mappings(self):
        return self

    def all(self):
        return self.rows

    def scalar(self):
        return self.count


class _Connection:
    def __init__(self, rows):
        self.rows = rows
        self.queries = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, statement, params=None):
        sql = str(statement)
        self.queries.append((sql, params))
        if "to_regclass" in sql:
            return _Results([],count=True)
        if "SET LOCAL statement_timeout" in sql:
            return _Results([])
        if "WITH sampled AS" in sql:
            return _Results(self.rows)
        raise AssertionError("Unexpected query: "+sql[:100])


class _Engine:
    def __init__(self, connection):
        self.connection = connection

    def connect(self):
        return self.connection


class WorkloadActivityTests(TestCase):
    def setUp(self):
        _ACTIVITY_CACHE.clear()

    def test_two_chart_series_share_only_complete_collection_history(self):
        conn = _Connection([
            _point("a", ANCHOR - timedelta(minutes=10)),
            _point("b", ANCHOR, jobs=3, programs=4,
                   wp={"dia": 1, "btc": 3, "upd": 0, "enq": 1, "other": 1},
                   sources=7),
        ])
        with patch("backend.rundeck_workload_activity.get_engine", return_value=_Engine(conn)), \
             patch("backend.rundeck_workload_activity._anchor_collection",
                   return_value=(ANCHOR, "b")), \
             patch("backend.rundeck_workload_activity._CACHE_TTL_SECONDS", 90):
            result = workload_activity_trends("6h", now=NOW)
        self.assertEqual(result["range"], "6h")
        self.assertEqual(result["complete_checks"], 2)
        self.assertEqual(result["activity_checks"], 2)
        self.assertEqual(result["wp_checks"], 2)
        self.assertEqual(result["items"][0]["jobs"], 7)
        self.assertEqual(result["items"][1]["programs"], 4)
        self.assertEqual(result["items"][1]["wp"]["ENQ"], 1)
        self.assertEqual(result["items"][1]["observed_wp"], 6)
        sql, params = conn.queries[-1]
        self.assertTrue(any('SET LOCAL statement_timeout' in q for q,_ in conn.queries))
        self.assertIn('FROM rundeck_workload_observations o', sql)
        self.assertNotIn('UNION ALL', sql)
        self.assertEqual(params["end"] - params["start"], timedelta(hours=6))
        self.assertIn("c.status = 'READY'", sql)
        self.assertIn("COUNT(DISTINCT (consumer_type, consumer_key))", sql)
        self.assertIn("jsonb_array_elements", sql)
        self.assertIn("GROUP BY collection_id, host, wp_id", sql)
        self.assertIn("o.consumer_type IN ('JOB', 'PROGRAM', 'PROCESS')", sql)
        self.assertNotIn("LIMIT 10", sql)

    def test_missing_observations_do_not_become_fake_zeroes(self):
        row = {
            "collection_id": "empty", "sampled_at": ANCHOR,
            "jobs": None, "programs": None, "source_rows": None,
            "wp_count": None, "dia": None, "btc": None,
            "upd": None, "enq": None, "other": None,
        }
        output = normalize_activity_row(row)
        self.assertIsNone(output["jobs"])
        self.assertIsNone(output["programs"])
        self.assertIsNone(output["wp"])
        self.assertIsNone(output["observed_wp"])

    def test_type_sum_is_strict_and_upd_up2_share_update_category(self):
        self.assertEqual(WP_TYPES, ("DIA", "BTC", "UPD", "ENQ", "OTHER"))
        with self.assertRaises(ValueError):
            normalize_activity_row({
                **_point("broken", ANCHOR),
                "wp_count": 99,
            })

    def test_range_guard_is_read_only(self):
        with self.assertRaises(ValueError):
            workload_activity_trends("30d", now=NOW)

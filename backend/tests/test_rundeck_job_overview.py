"""Source-preserving 24h SM37 aggregate tests; no live database required."""
from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.rundeck_job_intelligence import job_execution_overview


class _Result:
    def __init__(self, record=None, scalar_value=True):
        self.record = record
        self.scalar_value = scalar_value

    def scalar(self):
        return self.scalar_value

    def mappings(self):
        return self

    def one(self):
        return self.record


class _Connection:
    def __init__(self, record=None, exists=True):
        self.record = record
        self.exists = exists
        self.queries = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, statement, params=None):
        sql = str(statement)
        self.queries.append((sql, params))
        if "to_regclass" in sql:
            return _Result(scalar_value=self.exists)
        if "WITH execution_groups" in sql:
            return _Result(record=self.record)
        raise AssertionError("Unexpected query: " + sql[:80])


class _Engine:
    def __init__(self, connection):
        self.connection = connection

    def connect(self):
        return self.connection


class JobOverviewTests(unittest.TestCase):
    def test_aggregates_all_source_identities_without_list_limit(self):
        connection = _Connection({
            "executions": 12045,
            "unique_jobs": 257,
            "failed": 15,
            "completed": 12001,
            "durations": 11992,
            "avg_runtime_seconds": 485.45,
        })
        with patch("backend.rundeck_job_intelligence._engine", return_value=_Engine(connection)), \
             patch("backend.rundeck_job_intelligence.sm37_source_status", return_value={"authoritative": True}):
            overview = job_execution_overview(1)
        self.assertTrue(overview["complete"])
        self.assertEqual(overview["metrics"]["executions"], 12045)
        self.assertEqual(overview["metrics"]["failed"], 15)
        self.assertEqual(overview["metrics"]["avg_runtime_seconds"], 485.4)
        statement, params = connection.queries[-1]
        self.assertIn("GROUP BY source, client, job_name, job_count", statement)
        self.assertIn("started_at >= now()", statement)
        self.assertNotIn("LIMIT", statement)
        self.assertEqual(params["days"], 1)

    def test_empty_24h_window_does_not_fabricate_durations(self):
        connection = _Connection({
            "executions": 0, "unique_jobs": 0, "failed": 0,
            "completed": 0, "durations": 0, "avg_runtime_seconds": None,
        })
        with patch("backend.rundeck_job_intelligence._engine", return_value=_Engine(connection)), \
             patch("backend.rundeck_job_intelligence.sm37_source_status", return_value={"authoritative": False}):
            result = job_execution_overview(1)
        self.assertEqual(result["metrics"]["executions"], 0)
        self.assertIsNone(result["metrics"]["avg_runtime_seconds"])

    def test_missing_sm37_table_is_explicitly_unavailable(self):
        connection = _Connection(exists=False)
        with patch("backend.rundeck_job_intelligence._engine", return_value=_Engine(connection)), \
             patch("backend.rundeck_job_intelligence.sm37_source_status", return_value={"status": "MIGRATION_REQUIRED", "authoritative": False}):
            result = job_execution_overview(1)
        self.assertFalse(result["complete"])
        self.assertIsNone(result["metrics"])


if __name__ == "__main__":
    unittest.main()

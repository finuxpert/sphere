"""DEV-only runtime opt-in contract for split-DISTINCT report aggregates.

No DB access, runtime service restarts or environment-file modifications.
"""
from __future__ import annotations

import os
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from backend import rundeck_evaluation as ev

START = datetime(2026, 10, 1, tzinfo=timezone.utc)
END = datetime(2026, 11, 1, tzinfo=timezone.utc)
DEV_ENV = {
    "DATABASE_URL": "postgresql+psycopg://sphere:placeholder@localhost:5432/sphere_rundeck_dev",
    "DB_MODE": "db",
    "SPHERE_EVAL_SPLIT_DISTINCT_DEV": "true",
}
ROOT = Path(__file__).resolve().parents[2]


class SplitDistinctRuntimeFlagTests(unittest.TestCase):
    def test_explicit_dev_flag_only_for_calendar_windows(self):
        with patch.dict(os.environ, DEV_ENV, clear=True):
            for name in ("month", "week", "custom"):
                with self.subTest(period=name):
                    self.assertTrue(ev._dev_split_distinct_enabled(name))
            for name in ("1d", "7d", "30d", "whatever"):
                with self.subTest(period=name):
                    self.assertFalse(ev._dev_split_distinct_enabled(name))

    def test_disabled_unless_exact_flag_and_dev_db(self):
        scenarios = (
            {"SPHERE_EVAL_SPLIT_DISTINCT_DEV": "false"},
            {"SPHERE_EVAL_SPLIT_DISTINCT_DEV": "1"},
            {"SPHERE_EVAL_SPLIT_DISTINCT_DEV": ""},
            {"DATABASE_URL": "postgresql+psycopg://sphere:placeholder@localhost:5432/sphere"},
            {"DATABASE_URL": "postgresql+psycopg://sphere:placeholder@localhost:5432/postgres"},
            {"DATABASE_URL": ""},
            {"DB_MODE": "file"},
        )
        for override in scenarios:
            with self.subTest(override=override), patch.dict(
                os.environ, {**DEV_ENV, **override}, clear=True
            ):
                self.assertFalse(ev._dev_split_distinct_enabled("month"))

    def test_monthly_and_weekly_use_candidate_only_with_flag(self):
        rows = [{"consumer_key": "ZJOB"}]
        with patch.dict(os.environ, DEV_ENV, clear=True):
            with patch.object(ev, "_aggregate_window", return_value=rows) as aggregate:
                self.assertEqual(
                    ev._aggregate_window_for_report(
                        object(), START, END, "ALL", period_key="month",
                    ),
                    rows,
                )
                self.assertEqual(aggregate.call_args.kwargs,
                                 {"identity_preaggregate": True})
            with patch.object(ev, "_aggregate_window", return_value=rows) as aggregate:
                ev._aggregate_window_for_report(
                    object(), START, END, "ALL", period_key="1d",
                )
                self.assertFalse(aggregate.call_args.kwargs)
        with patch.dict(os.environ, {**DEV_ENV, "SPHERE_EVAL_SPLIT_DISTINCT_DEV": "false"}, clear=True):
            with patch.object(ev, "_aggregate_window", return_value=rows) as aggregate:
                ev._aggregate_window_for_report(
                    object(), START, END, "ALL", period_key="week",
                )
                self.assertFalse(aggregate.call_args.kwargs)

    def test_report_runtime_path_switches_both_windows_and_keeps_cache_isolation(self):
        source = (ROOT / "backend/rundeck_evaluation.py").read_text()
        self.assertIn('cache_scope += ":split_distinct"', source)
        self.assertIn('measure_sql("current_aggregate", lambda: _aggregate_window_for_report(', source)
        self.assertIn('measure_sql("previous_aggregate", lambda: _aggregate_window_for_report(', source)
        self.assertIn('strategy=SPLIT_DISTINCT_DEV', source)

    def test_no_prod_service_feature_activation(self):
        service = (ROOT / "ops/rundeck/sphere-rundeck-api.service").read_text()
        self.assertNotIn("SPHERE_EVAL_SPLIT_DISTINCT_DEV=true", service)


if __name__ == "__main__":
    unittest.main()

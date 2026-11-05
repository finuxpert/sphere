"""The DEV SQL profiler must capture baseline SQL unchanged and sanitize output."""
from __future__ import annotations

import importlib.util
import io
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timezone
from pathlib import Path

SCRIPT = (Path(__file__).resolve().parents[2] /
          "ops/rundeck/profile-report-actual-dev.py")
SPEC = importlib.util.spec_from_file_location("profile_report_actual_dev", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
profile = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(profile)


class ReportActualProfileTests(unittest.TestCase):
    def setUp(self):
        self.start = datetime(2026, 9, 30, 17, tzinfo=timezone.utc)
        self.end = datetime(2026, 10, 31, 17, tzinfo=timezone.utc)
        self.previous = datetime(2026, 8, 31, 17, tzinfo=timezone.utc)

    def test_current_and_previous_capture_exact_period_and_legacy_guard(self):
        for stage, expected_start, expected_end in (
            ("current", self.start, self.end),
            ("previous", self.previous, self.start),
        ):
            with self.subTest(stage=stage):
                sql, params = profile.capture(stage, self.start, self.end, self.previous)
                self.assertEqual(params["start"], expected_start)
                self.assertEqual(params["end"], expected_end)
                self.assertIn("NOT EXISTS", sql)
                self.assertIn("COALESCE(c.finished_at, c.started_at)", sql)
                self.assertIn("COUNT(DISTINCT tc.collection_id)", sql)
                self.assertNotIn("JOIN complete_collections cc_wo", sql)

    def test_historical_and_pressure_capture_only_existing_sql(self):
        historical, params = profile.capture(
            "historical", self.start, self.end, self.previous,
        )
        self.assertEqual(params["end"], self.start)
        self.assertIn("percentile_cont(0.95)", historical)
        pressure, params = profile.capture("pressure", self.start, self.end, self.previous)
        self.assertIn("hm.collection_id = tc.collection_id", pressure)
        self.assertIn("hm.host = tc.host", pressure)
        self.assertIn("NOT EXISTS", pressure)
        self.assertEqual(params["start"], self.start)
        self.assertEqual(params["end"], self.end)

    def test_summarizer_has_no_sql_or_sensitive_consumer_values(self):
        raw = [{
            "Plan": {
                "Node Type": "Hash Join", "Total Cost": 250,
                "Plan Rows": 9, "Actual Rows": 13, "Actual Loops": 1,
                "Actual Total Time": 201.1, "Shared Hit Blocks": 80,
                "Plans": [
                    {"Node Type": "Seq Scan",
                     "Relation Name": "rundeck_collections",
                     "Plan Rows": 1, "Actual Rows": 100,
                     "Actual Loops": 1, "Actual Total Time": 3.2},
                ],
            },
            "Execution Time": 203.3,
            "Planning Time": 0.6,
        }]
        output = io.StringIO()
        with redirect_stdout(output):
            profile.summarize(raw, analyze=True, label="BASELINE_ACTUAL")
        text = output.getvalue()
        self.assertIn("EXECUTION_MS=203.3", text)
        self.assertIn("COLLECTION_ESTIMATE=1", text)
        self.assertIn('"actual_rows_per_loop":100', text)
        self.assertNotIn("SELECT ", text)


if __name__ == "__main__":
    unittest.main()

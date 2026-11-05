"""Pure SQL regression for the read-only DEV collection-date planner experiment."""
from __future__ import annotations

import importlib.util
import sqlite3
import unittest
from pathlib import Path

SCRIPT = (Path(__file__).resolve().parents[2] /
          "ops/rundeck/compare-report-collection-date-dev.py")
SPEC = importlib.util.spec_from_file_location("compare_report_collection_date_dev", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
compare = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(compare)


class ReportCollectionDateDiagnosticTests(unittest.TestCase):
    def test_rewrite_matches_calendar_filter_with_nulls_and_month_boundary(self):
        original = (
            "SELECT id FROM collections c WHERE "
            "COALESCE(c.finished_at, c.started_at) >= :start AND "
            "COALESCE(c.finished_at, c.started_at) < :end ORDER BY id"
        )
        proposed = compare.rewrite_collection_date(original)
        self.assertIn("c.finished_at IS NULL", proposed)
        self.assertEqual(proposed.count("c.finished_at IS NULL"), 1)
        self.assertNotIn("COALESCE", proposed)
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE TABLE collections(id TEXT, finished_at TEXT, started_at TEXT)")
        conn.executemany("INSERT INTO collections VALUES (?, ?, ?)", [
            ("oct", "2026-10-15 13:00:00", "2026-10-15 12:00:00"),
            ("fallback", None, "2026-10-20 13:00:00"),
            ("fin_outside", "2026-11-01 00:00:00", "2026-10-15 13:00:00"),
            ("fin_before", "2026-09-30 00:00:00", "2026-10-15 13:00:00"),
            ("no_timestamp", None, None),
            ("first", None, "2026-10-01 00:00:00"),
            ("last", "2026-10-31 23:59:59", None),
            ("next", "2026-11-01 00:00:00", None),
        ])
        parameters = {"start": "2026-10-01 00:00:00", "end": "2026-11-01 00:00:00"}
        old_rows = conn.execute(original, parameters).fetchall()
        new_rows = conn.execute(proposed, parameters).fetchall()
        self.assertEqual(old_rows, new_rows)
        self.assertEqual([row[0] for row in new_rows], ["fallback", "first", "last", "oct"])
        conn.close()

    def test_rewrite_fails_closed_for_wrong_sql_shape(self):
        for bad in ("SELECT 1", "SELECT COALESCE(c.finished_at, c.started_at)"):
            with self.assertRaises(ValueError):
                compare.rewrite_collection_date(bad)

    def test_captured_current_aggregate_has_one_eligible_predicate(self):
        from datetime import datetime, timezone
        start = datetime(2026, 9, 30, 17, tzinfo=timezone.utc)
        end = datetime(2026, 10, 31, 17, tzinfo=timezone.utc)
        original, params = compare.capture("current", start, end)
        proposed = compare.rewrite_collection_date(original)
        self.assertEqual(params["start"], start)
        self.assertEqual(params["end"], end)
        self.assertIn("NOT EXISTS", proposed)
        self.assertIn("GROUP BY tc.consumer_type, tc.consumer_key", proposed)
        self.assertIn("c.finished_at IS NULL", proposed)
        self.assertIn("tc.collected_at >= :start", proposed)


if __name__ == "__main__":
    unittest.main()

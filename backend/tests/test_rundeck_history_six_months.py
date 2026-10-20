"""Regression for retained 3M/6M trends without database or SAP access."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone

from backend.rundeck_trends import (
    previous_calendar_month,
    resolve_bucket,
    resolve_interval_seconds,
    resolve_range,
)


class HistoricalRangeTests(unittest.TestCase):
    def test_previous_calendar_month_uses_wib_and_excludes_current_month(self):
        start, end = previous_calendar_month(datetime(2026, 10, 20, 6, 0, tzinfo=timezone.utc))
        self.assertEqual(start.isoformat(), "2026-08-31T17:00:00+00:00")
        self.assertEqual(end.isoformat(), "2026-09-30T17:00:00+00:00")
        self.assertLess(start, end)

    def test_previous_month_handles_year_boundary(self):
        start, end = previous_calendar_month(datetime(2027, 1, 10, 0, 0, tzinfo=timezone.utc))
        self.assertEqual(start.isoformat(), "2026-11-30T17:00:00+00:00")
        self.assertEqual(end.isoformat(), "2026-12-31T17:00:00+00:00")

    def test_long_term_queries_are_daily_only(self):
        for key in ("last_month", "90d", "180d"):
            self.assertEqual(resolve_bucket(key, "auto"), ("1d", "1 day"))
            self.assertEqual(resolve_interval_seconds(key, "auto"), 86400)
            for bucket in ("10m", "30m", "1h", "6h"):
                with self.assertRaisesRegex(ValueError, "daily buckets"):
                    resolve_bucket(key, bucket)
        self.assertEqual(resolve_range("90d")["hours"], 2160)
        self.assertEqual(resolve_range("180d")["hours"], 4320)

    def test_custom_24_hour_investigation_remains_raw(self):
        self.assertEqual(resolve_bucket("custom", "auto"), ("raw", "raw"))
        self.assertEqual(resolve_bucket("30d", "auto"), ("6h", "6 hours"))


if __name__ == "__main__":
    unittest.main()

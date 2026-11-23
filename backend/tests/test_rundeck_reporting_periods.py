"""Contract regression for refactored SPHERE WIB report period helpers."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import unittest

from backend import rundeck_evaluation as evaluation
from backend import rundeck_reporting_periods as periods

WIB = ZoneInfo("Asia/Jakarta")


class ReportPeriodBoundaryTests(unittest.TestCase):
    def test_legacy_evaluation_functions_preserve_same_callable_identity(self):
        self.assertIs(evaluation.calendar_month_bounds, periods.calendar_month_bounds)
        self.assertIs(evaluation.calendar_week_bounds, periods.calendar_week_bounds)
        self.assertIs(evaluation.calendar_custom_bounds, periods.calendar_custom_bounds)

    def test_month_boundaries_are_end_exclusive_and_wib(self):
        now = datetime(2026, 11, 23, 22, 30, tzinfo=WIB)
        start, end, previous = periods.calendar_month_bounds("2026-10", now)
        self.assertEqual(start, datetime(2026, 9, 30, 17, tzinfo=timezone.utc))
        self.assertEqual(end, datetime(2026, 10, 31, 17, tzinfo=timezone.utc))
        self.assertEqual(previous, datetime(2026, 8, 31, 17, tzinfo=timezone.utc))

    def test_current_month_is_capped_at_now_and_future_rejected(self):
        now = datetime(2026, 11, 23, 10, 45, tzinfo=WIB)
        start, end, previous = periods.calendar_month_bounds("2026-11", now)
        self.assertEqual(end, now.astimezone(timezone.utc))
        self.assertEqual(start, datetime(2026, 10, 31, 17, tzinfo=timezone.utc))
        self.assertEqual(previous, datetime(2026, 9, 30, 17, tzinfo=timezone.utc))
        with self.assertRaisesRegex(ValueError, "Future"):
            periods.calendar_month_bounds("2026-12", now)

    def test_week_has_monday_start_and_exclusive_end(self):
        now = datetime(2026, 11, 23, 22, 30, tzinfo=WIB)
        start, end, previous = periods.calendar_week_bounds("2026-11-16", now)
        self.assertEqual(start, datetime(2026, 11, 15, 17, tzinfo=timezone.utc))
        self.assertEqual(end, datetime(2026, 11, 22, 17, tzinfo=timezone.utc))
        self.assertEqual(previous, datetime(2026, 11, 8, 17, tzinfo=timezone.utc))
        with self.assertRaisesRegex(ValueError, "Monday"):
            periods.calendar_week_bounds("2026-11-17", now)

    def test_custom_period_is_inclusive_max_31_days_and_source_scoped(self):
        now = datetime(2026, 11, 23, 22, 30, tzinfo=WIB)
        start, end, previous = periods.calendar_custom_bounds("2026-11-16", "2026-11-22", now)
        self.assertEqual(start, datetime(2026, 11, 15, 17, tzinfo=timezone.utc))
        self.assertEqual(end, datetime(2026, 11, 22, 17, tzinfo=timezone.utc))
        self.assertEqual(previous, datetime(2026, 11, 8, 17, tzinfo=timezone.utc))
        with self.assertRaisesRegex(ValueError, "1-31"):
            periods.calendar_custom_bounds("2026-10-01", "2026-11-02", now)
        with self.assertRaisesRegex(ValueError, "Future"):
            periods.calendar_custom_bounds("2026-11-24", "2026-11-24", now)


if __name__ == "__main__":
    unittest.main()

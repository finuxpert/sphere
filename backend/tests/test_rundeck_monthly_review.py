"""Calendar-month boundaries for SPHERE manual SAP Basis performance reports."""
from datetime import datetime, timezone
import unittest

from backend.rundeck_evaluation import calendar_month_bounds


class CalendarMonthReviewTests(unittest.TestCase):
    def test_full_september_window_is_wib_calendar_month(self):
        start, end, previous = calendar_month_bounds(
            "2026-09", now=datetime(2026, 10, 21, 3, 0, tzinfo=timezone.utc)
        )
        self.assertEqual(start, datetime(2026, 8, 31, 17, 0, tzinfo=timezone.utc))
        self.assertEqual(end, datetime(2026, 9, 30, 17, 0, tzinfo=timezone.utc))
        self.assertEqual(previous, datetime(2026, 7, 31, 17, 0, tzinfo=timezone.utc))

    def test_ongoing_month_is_capped_by_now_without_future_samples(self):
        now = datetime(2026, 10, 21, 3, 0, tzinfo=timezone.utc)
        start, end, previous = calendar_month_bounds("2026-10", now=now)
        self.assertEqual(start, datetime(2026, 9, 30, 17, 0, tzinfo=timezone.utc))
        self.assertEqual(end, now)
        self.assertEqual(previous, datetime(2026, 8, 31, 17, 0, tzinfo=timezone.utc))

    def test_month_boundary_at_new_year(self):
        start, end, previous = calendar_month_bounds(
            "2026-01", now=datetime(2026, 2, 2, tzinfo=timezone.utc)
        )
        self.assertEqual(start, datetime(2025, 12, 31, 17, 0, tzinfo=timezone.utc))
        self.assertEqual(end, datetime(2026, 1, 31, 17, 0, tzinfo=timezone.utc))
        self.assertEqual(previous, datetime(2025, 11, 30, 17, 0, tzinfo=timezone.utc))

    def test_invalid_and_future_months_are_rejected(self):
        now = datetime(2026, 10, 21, tzinfo=timezone.utc)
        for month in ("2026-00", "2026-13", "2026-1", "foo", "", "2030-01"):
            with self.subTest(month=month):
                with self.assertRaises(ValueError):
                    calendar_month_bounds(month, now=now)


if __name__ == "__main__":
    unittest.main()

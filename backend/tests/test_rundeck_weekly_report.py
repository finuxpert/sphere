"""Calendar-week report period bounds must be Monday-to-Monday Asia/Jakarta."""
from datetime import datetime, timezone
import unittest

from backend.rundeck_evaluation import calendar_week_bounds


class WeeklyReportBoundsTest(unittest.TestCase):
    def test_full_week_crosses_month_end(self):
        start, end, previous = calendar_week_bounds(
            "2026-10-26", now=datetime(2026, 11, 2, 1, tzinfo=timezone.utc)
        )
        self.assertEqual(start.isoformat(), "2026-10-25T17:00:00+00:00")
        self.assertEqual(end.isoformat(), "2026-11-01T17:00:00+00:00")
        self.assertEqual(previous.isoformat(), "2026-10-18T17:00:00+00:00")

    def test_ongoing_week_is_capped_at_now(self):
        now = datetime(2026, 11, 2, 9, tzinfo=timezone.utc)
        start, end, _ = calendar_week_bounds("2026-11-02", now=now)
        self.assertEqual(start.isoformat(), "2026-11-01T17:00:00+00:00")
        self.assertEqual(end, now)

    def test_rejects_non_monday_and_future_week(self):
        now = datetime(2026, 11, 2, 9, tzinfo=timezone.utc)
        with self.assertRaises(ValueError):
            calendar_week_bounds("2026-10-27", now=now)
        with self.assertRaises(ValueError):
            calendar_week_bounds("2026-11-09", now=now)
        with self.assertRaises(ValueError):
            calendar_week_bounds("2026-02-30", now=now)


if __name__ == "__main__":
    unittest.main()

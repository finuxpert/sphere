import unittest
from datetime import datetime, timedelta, timezone
from backend.rundeck_api import _validate_availability_report_window
from backend.rundeck_trends import validate_custom_window


class AvailabilityCalendarWindowTests(unittest.TestCase):
    def test_week_month_and_31_day_month_accepted(self):
        end=datetime.now(timezone.utc)-timedelta(days=1)
        for days in (7, 30, 31):
            with self.subTest(days=days):
                start=end-timedelta(days=days)
                self.assertEqual(_validate_availability_report_window(start,end),(start,end))

    def test_existing_incident_window_stays_limited_to_24h(self):
        end=datetime.now(timezone.utc)-timedelta(days=1)
        start=end-timedelta(days=7)
        with self.assertRaisesRegex(ValueError,"24 hours"):
            validate_custom_window(start,end)

    def test_future_reverse_and_excessive_windows_rejected(self):
        now=datetime.now(timezone.utc)
        for start,end in (
            (now-timedelta(days=35),now),
            (now,now-timedelta(hours=1)),
            (now-timedelta(days=1),now+timedelta(days=1)),
            (now-timedelta(days=390),now-timedelta(days=380)),
        ):
            with self.subTest(start=start,end=end),self.assertRaises(ValueError):
                _validate_availability_report_window(start,end)


if __name__=="__main__":
    unittest.main()

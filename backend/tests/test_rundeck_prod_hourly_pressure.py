"""Offline PROD intraday report regression; no database or service access."""
from datetime import datetime, timedelta, timezone
import unittest

from backend.rundeck_monthly_pressure import bucketed_host_trend


WIB = timezone(timedelta(hours=7))


def sample(day, hour, minute, cpu, ram, host="AOPH2PAPPDC", collection="c1"):
    return {
        "host": host,
        "collection_id": collection,
        "collected_at": datetime(2026, 11, day, hour, minute, tzinfo=WIB),
        "cpu_pct": cpu,
        "ram_pct": ram,
    }


class ProdHourlyReportTests(unittest.TestCase):
    def test_custom_two_days_has_real_hourly_peaks_and_no_synthetic_gaps(self):
        start = datetime(2026, 11, 14, tzinfo=WIB)
        end = datetime(2026, 11, 16, tzinfo=WIB)
        rows = [
            sample(14, 7, 5, 81, 31, collection="c1"),
            sample(14, 7, 45, 98.6, 32, collection="c2"),
            sample(14, 9, 5, 42, 34, collection="c3"),
            sample(15, 7, 59, 90, 35, collection="c4"),
            sample(14, 7, 20, 22, 40, host="AOPH1PAPPDC", collection="c5"),
        ]
        minutes, points = bucketed_host_trend(rows, start, end)
        self.assertEqual(minutes, 60)
        app2 = [point for point in points if point["host"] == "AOPH2PAPPDC"]
        self.assertEqual(len(app2), 3)
        self.assertEqual(
            [point["bucket_start"] for point in app2],
            [
                "2026-11-14T07:00:00+07:00",
                "2026-11-14T09:00:00+07:00",
                "2026-11-15T07:00:00+07:00",
            ],
        )
        self.assertEqual(app2[0]["peak_cpu_pct"], 98.6)
        self.assertEqual(app2[0]["peak_cpu_at"], "2026-11-14T07:45:00+07:00")
        self.assertEqual(app2[0]["cpu_warning_checks"], 2)
        self.assertEqual(app2[1]["ram_warning_checks"], 0)
        self.assertEqual(len([row for row in points if row["host"] == "AOPH1PAPPDC"]), 1)

    def test_period_buckets_are_30m_one_hour_six_hours_and_one_day(self):
        start = datetime(2026, 11, 14, tzinfo=WIB)
        rows = [sample(14, 7, 5, 80, 40)]
        for days, minutes in [(1, 30), (2, 60), (7, 60), (8, 360), (31, 360), (32, 1440)]:
            with self.subTest(days=days):
                actual, points = bucketed_host_trend(rows, start, start + timedelta(days=days))
                self.assertEqual(actual, minutes)
                self.assertEqual(len(points), 1)

    def test_all_null_metrics_produce_no_invented_observation(self):
        start = datetime(2026, 11, 14, tzinfo=WIB)
        null_row = sample(14, 7, 5, None, None)
        interval, points = bucketed_host_trend([null_row], start, start + timedelta(days=2))
        self.assertEqual(interval, 60)
        self.assertEqual(points, [])


if __name__ == "__main__":
    unittest.main()

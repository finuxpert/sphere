"""Calendar-month boundaries for SPHERE manual SAP Basis performance reports."""
from datetime import datetime, timezone
import unittest

from backend.rundeck_evaluation import calendar_month_bounds, _evaluation_page
from backend.rundeck_monthly_pressure import detect_pressure_episodes


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


    def test_pressure_episodes_split_on_normal_and_collector_gap(self):
        host = "app3"
        def row(minute, cpu, ram=50, name=host):
            return {
                "host": name,
                "collected_at": datetime(2026, 9, 1, 0, minute, tzinfo=timezone.utc),
                "cpu_pct": cpu, "ram_pct": ram,
            }
        samples = [
            row(0, 79), row(10, 91), row(20, 42),
            row(30, 85), row(40, 83), row(50, 83, name="app1"),
        ]
        episodes = detect_pressure_episodes(samples, "cpu_pct", 75)
        self.assertEqual(len(episodes), 3)
        app3 = [item for item in episodes if item["host"] == host]
        self.assertEqual(len(app3), 2)
        self.assertEqual([item["observed_host_checks"] for item in app3], [2, 2])
        self.assertEqual(max(item["peak_pct"] for item in app3), 91.0)

    def test_pressure_episode_missing_samples_do_not_merge(self):
        host = "APP2"
        samples = [
            {"host": host, "collected_at": datetime(2026, 9, 1, 0, 0, tzinfo=timezone.utc), "ram_pct": 95},
            {"host": host, "collected_at": datetime(2026, 9, 1, 4, 0, tzinfo=timezone.utc), "ram_pct": 91},
        ]
        episodes = detect_pressure_episodes(samples, "ram_pct", 80)
        self.assertEqual(len(episodes), 2)
        self.assertEqual([row["observed_host_checks"] for row in episodes], [1, 1])

    def test_monthly_pressure_filter_applies_before_server_pagination(self):
        def workload(key, cpu=0, ram=0):
            return {
                "consumer_type": "PROGRAM", "consumer_key": key,
                "pressure_overlap": {
                    "cpu_pressure_host_checks": cpu,
                    "ram_pressure_host_checks": ram,
                    "wp_host_checks": 0,
                },
            }
        report = {
            "items": [workload("ZCPU_A", cpu=2), workload("ZNO"), workload("ZRAM", ram=8), workload("ZCPU_B", cpu=3)],
            "summary": {"workloads": 4},
        }
        page1 = _evaluation_page(report, limit=1, offset=0, query="", health="ALL", pressure="CPU")
        page2 = _evaluation_page(report, limit=1, offset=1, query="", health="ALL", pressure="CPU")
        self.assertEqual(page1["page"]["total"], 2)
        self.assertEqual(page1["items"][0]["consumer_key"], "ZCPU_A")
        self.assertEqual(page2["items"][0]["consumer_key"], "ZCPU_B")
        self.assertEqual(page2["summary"]["workloads"], 4)
        self.assertEqual(_evaluation_page(report, limit=10, offset=0, query="", health="ALL", pressure="RAM")["page"]["total"], 1)


if __name__ == "__main__":
    unittest.main()

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from backend.rundeck_trends import validate_custom_window, resolve_bucket, trend_series


class CustomTimeRangeTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 15, 10, 0, tzinfo=timezone.utc)

    def test_wib_inputs_normalize_to_utc_and_end_is_exclusive(self):
        wib = timezone(timedelta(hours=7))
        start, end = validate_custom_window(
            datetime(2026, 10, 15, 12, 49, tzinfo=wib),
            datetime(2026, 10, 15, 12, 53, tzinfo=wib),
            self.now,
        )
        self.assertEqual(start.isoformat(), "2026-10-15T05:49:00+00:00")
        self.assertEqual(end.isoformat(), "2026-10-15T05:53:00+00:00")
        self.assertEqual(resolve_bucket("custom", "auto")[0], "raw")

    def test_invalid_custom_range_is_rejected(self):
        base = self.now - timedelta(hours=1)
        cases = [
            (base, base),
            (base + timedelta(minutes=1), base),
            (base, base + timedelta(hours=25)),
            (self.now - timedelta(days=91), self.now - timedelta(days=90)),
            (self.now, self.now + timedelta(hours=1)),
            (base.replace(tzinfo=None), base + timedelta(minutes=1)),
        ]
        for start, end in cases:
            with self.subTest(start=start, end=end):
                with self.assertRaises(ValueError):
                    validate_custom_window(start, end, self.now)

    def test_custom_query_uses_exact_host_sample_timestamps_not_collection_start(self):
        engine = MagicMock()
        engine.connect.return_value.__enter__.return_value.execute.return_value = []
        start = self.now - timedelta(hours=1)
        end = start + timedelta(minutes=4)
        with patch("backend.rundeck_trends.get_engine", return_value=engine):
            result = trend_series(start, "custom", "auto", "cpu", until=end)
        sql, params = engine.connect.return_value.__enter__.return_value.execute.call_args.args
        self.assertIn("h.collected_at AS bucket", str(sql))
        self.assertIn("WHERE h.collected_at >= :since", str(sql))
        self.assertIn("h.collected_at < :until", str(sql))
        self.assertEqual(params["until"], end)
        self.assertEqual(result["observation_time_basis"], "host_sample")
        self.assertEqual(result["items"], [])

    def test_existing_preset_does_not_gain_unrequested_end_filter(self):
        engine = MagicMock()
        engine.connect.return_value.__enter__.return_value.execute.return_value = []
        with patch("backend.rundeck_trends.get_engine", return_value=engine):
            trend_series(self.now - timedelta(hours=1), "1h", "auto", "cpu")
        sql, params = engine.connect.return_value.__enter__.return_value.execute.call_args.args
        self.assertNotIn("h.collected_at < :until", str(sql))
        self.assertNotIn("until", params)


if __name__ == "__main__":
    unittest.main()

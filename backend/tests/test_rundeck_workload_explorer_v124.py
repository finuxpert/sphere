import unittest

from backend.rundeck_workload_explorer import _parse_anchor, normalize_type, range_config


class WorkloadExplorerV124Tests(unittest.TestCase):
    def test_range_buckets_scale_with_history_window(self):
        self.assertEqual(range_config("24h")["bucket"], "10m")
        self.assertEqual(range_config("3d")["bucket"], "30m")
        self.assertEqual(range_config("7d")["bucket"], "30m")
        self.assertEqual(range_config("30d")["bucket"], "1h")
        self.assertLess(range_config("24h")["bucket_seconds"], range_config("30d")["bucket_seconds"])

    def test_invalid_range_is_rejected(self):
        with self.assertRaises(ValueError):
            range_config("90d")

    def test_historical_anchor_accepts_iso_timestamp(self):
        parsed = _parse_anchor("2026-09-30T02:58:00+07:00")
        self.assertIsNotNone(parsed.tzinfo)
        self.assertEqual(parsed.isoformat(), "2026-09-30T02:58:00+07:00")

    def test_invalid_historical_anchor_is_rejected(self):
        with self.assertRaises(ValueError):
            _parse_anchor("not-a-time")

    def test_workload_type_contract(self):
        self.assertEqual(normalize_type("job"), "JOB")
        self.assertEqual(normalize_type("program"), "PROGRAM")
        self.assertEqual(normalize_type(""), "ALL")
        with self.assertRaises(ValueError):
            normalize_type("PROCESS")


if __name__ == "__main__":
    unittest.main()

import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.rundeck_network_trends import app_network_trend


class AppNetworkTrendTests(unittest.TestCase):
    def setUp(self):
        self.start = datetime(2026, 10, 15, 5, 49, tzinfo=timezone.utc)
        self.end = self.start + timedelta(minutes=4)
        self.engine = MagicMock()
        self.execute = self.engine.connect.return_value.__enter__.return_value.execute
        self.execute.return_value = []

    def test_custom_rx_window_uses_real_infra_sample_time_and_exact_bounds(self):
        with patch("backend.rundeck_network_trends.get_engine", return_value=self.engine):
            result = app_network_trend(self.start, "custom", "auto", "network_rx", self.end)
        sql, params = self.execute.call_args.args
        sql = str(sql)
        self.assertIn("s.kind = 'network'", sql)
        self.assertIn("s.collected_at >= :since", sql)
        self.assertIn("s.collected_at < :until", sql)
        self.assertIn("rx_mbps", sql)
        self.assertIn("AOPH[1-5]PAPPDC", sql)
        self.assertIn("PARTITION BY host,collected_at", sql)
        self.assertNotIn("SUM(value)", sql)
        self.assertEqual(params["since"], self.start)
        self.assertEqual(params["until"], self.end)
        self.assertEqual(result["network_rate_basis"], "highest_interface_per_host_sample")
        self.assertEqual(result["unit"], "Mbps")
        self.assertEqual(result["observed_hosts"], [])
        self.assertEqual(result["expected_hosts"], ["APP1", "APP2", "APP3", "APP4", "APP5"])

    def test_tx_is_distinct_and_window_does_not_use_sap_metrics(self):
        with patch("backend.rundeck_network_trends.get_engine", return_value=self.engine):
            result = app_network_trend(self.start, "3h", "auto", "network_tx")
        sql, params = self.execute.call_args.args
        self.assertIn("tx_mbps", str(sql))
        self.assertNotIn("rundeck_host_metrics", str(sql))
        self.assertNotIn("until", params)
        self.assertEqual(result["metric"], "network_tx")

    def test_longer_range_aggregates_selected_interface_not_interfaces(self):
        with patch("backend.rundeck_network_trends.get_engine", return_value=self.engine):
            app_network_trend(self.start, "6h", "auto", "network_rx")
        sql, params = self.execute.call_args.args
        self.assertIn("date_bin", str(sql))
        self.assertIn("FROM sampled", str(sql))
        self.assertIn("AVG(value)", str(sql))
        self.assertNotIn("SUM(value)", str(sql))
        self.assertEqual(params["stride"], "10 minutes")

    def test_verified_rows_keep_interface_provenance(self):
        self.execute.return_value = [SimpleNamespace(_mapping={
            "host": "APP3", "peak_at": self.start, "latest_at": self.start, "source_host": "AOPH3PAPPDC",
            "peak_interface": "eth0", "avg_value": 0.9, "max_value": 0.9,
            "min_value": 0.9, "bucket": self.start, "samples": 1,
        })]
        with patch("backend.rundeck_network_trends.get_engine", return_value=self.engine):
            result = app_network_trend(self.start, "1h", "auto", "network_rx")
        self.assertEqual(result["observed_hosts"], ["APP3"])
        self.assertEqual(result["items"][0]["peak_interface"], "eth0")
        self.assertEqual(result["last_observed_at"], self.start)

    def test_fail_closed_when_custom_end_missing(self):
        with self.assertRaises(ValueError):
            app_network_trend(self.start, "custom", "auto", "network_rx")
        with self.assertRaises(ValueError):
            app_network_trend(self.start, "6h", "auto", "unknown")

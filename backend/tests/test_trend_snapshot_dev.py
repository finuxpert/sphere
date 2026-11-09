"""Offline DEV-only trend snapshot guards, serialization, and API fallback."""
from __future__ import annotations

import gzip
import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from backend import rundeck_api_core as api
from backend import rundeck_trend_snapshots as snapshots
from backend import rundeck_trend_precompute as worker

DEV_ENV = {
    "SPHERE_TREND_SNAPSHOT_DEV": "true",
    "SPHERE_TREND_SNAPSHOT_WORKER": "true",
    "DB_MODE": "db",
    "DATABASE_URL": "postgresql+psycopg://sphere:unused@localhost/sphere_rundeck_dev",
}


def sample(metric="network_rx", range_key="180d"):
    point = {
        "bucket": datetime(2026, 11, 9, tzinfo=timezone.utc),
        "host": "APP1", "max_value": 3.2, "avg_value": 2.7,
        "peak_at": datetime(2026, 11, 9, tzinfo=timezone.utc),
        "peak_collection_id": "real-123", "samples": 1,
    }
    if metric == "cpu,ram,wp":
        return {
            "metrics": ["cpu", "ram", "wp"],
            "series": {
                key: {"metric": key, "range": range_key, "bucket": "1d",
                      "items": [point], "requested_window_start":
                      datetime(2026, 5, 1, tzinfo=timezone.utc)}
                for key in ("cpu", "ram", "wp")
            },
        }
    return {
        "metric": metric, "range": range_key, "bucket": "1d",
        "network_source": "Infrastructure collector",
        "items": [point],
    }


class TrendSnapshotDevTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.path = Path(folder.name)
        env = {**DEV_ENV, "SPHERE_TREND_SNAPSHOT_DIR": folder.name}
        patch_env = patch.dict(os.environ, env, clear=True)
        patch_env.start()
        self.addCleanup(patch_env.stop)

    def test_only_explicit_dev_database_is_permitted(self):
        self.assertTrue(snapshots.enabled())
        for key, value in [
            ("SPHERE_TREND_SNAPSHOT_DEV", "false"),
            ("DATABASE_URL", "postgresql+psycopg://sphere@localhost/sphere_prod"),
            ("DB_MODE", "file"),
        ]:
            with self.subTest(key=key), patch.dict(os.environ, {key: value}):
                self.assertFalse(snapshots.enabled())

    def test_worker_only_atomic_write_and_recent_read(self):
        for metric in ("cpu,ram,wp", "network_rx", "network_tx"):
            payload = sample(metric)
            file = snapshots.save("180d", metric, payload)
            self.assertTrue(file.is_file())
            self.assertEqual(file.stat().st_mode & 0o777, 0o600)
            self.assertIsNone(snapshots.load("180d", metric))
            with patch.dict(os.environ, {"SPHERE_TREND_SNAPSHOT_WORKER": "false"}):
                loaded, info = snapshots.load("180d", metric)
            self.assertEqual(info["status"], "FRESH")
            self.assertEqual(info["source"], "SERVER_PRECOMPUTE")
            self.assertEqual(loaded["items"][0]["host"] if metric != "cpu,ram,wp"
                             else loaded["series"]["cpu"]["items"][0]["host"], "APP1")
        self.assertFalse(list(self.path.glob("*.tmp")))

    def test_snapshot_path_scope_is_strict(self):
        for range_key, metric_key in [
            ("custom", "network_rx"), ("../../", "network_rx"),
            ("180d", "../etc"), ("180d", "cpu,ram"),
        ]:
            with self.assertRaises(ValueError):
                snapshots._path(range_key, metric_key)

    def test_corrupt_and_expired_snapshot_fall_back_to_sql(self):
        file = snapshots.save("180d", "network_rx", sample())
        file.write_bytes(b"corrupt")
        with patch.dict(os.environ, {"SPHERE_TREND_SNAPSHOT_WORKER": "false"}):
            self.assertIsNone(snapshots.load("180d", "network_rx"))
        snapshots.save("180d", "network_rx", sample())
        with gzip.open(file, "rb") as stream:
            envelope = json.loads(stream.read())
        envelope["meta"]["generated_at"] = "2020-01-01T00:00:00+00:00"
        file.write_bytes(gzip.compress(json.dumps(envelope).encode()))
        with patch.dict(os.environ, {"SPHERE_TREND_SNAPSHOT_WORKER": "false"}):
            self.assertIsNone(snapshots.load("180d", "network_rx"))

    def test_rejects_writes_without_worker_flag(self):
        with patch.dict(os.environ, {"SPHERE_TREND_SNAPSHOT_WORKER": "false"}):
            with self.assertRaises(RuntimeError):
                snapshots.save("180d", "network_rx", sample())

    def test_api_reads_snapshot_without_running_query(self):
        payload = sample("network_rx")
        with patch.dict(os.environ, {"SPHERE_TREND_SNAPSHOT_WORKER": "false"}), \
             patch.object(api, "app_network_trend", side_effect=AssertionError("SQL must be skipped")):
            with patch.object(snapshots, "load", return_value=(payload, {"status": "FRESH"})):
                result = api.history_trend(
                    range_key="180d", bucket="auto", metric="network_rx",
                    from_at=None, to_at=None,
                )
        self.assertEqual(result["snapshot"]["status"], "FRESH")
        self.assertEqual(result["items"][0]["host"], "APP1")

    def test_worker_builds_fresh_sql_payload_not_old_snapshot(self):
        payload = sample("cpu,ram,wp")
        with patch.object(api, "history_trend_bundle", return_value=payload) as compute:
            status = worker.build("180d", "cpu,ram,wp")
        self.assertIn("BUILT", status)
        compute.assert_called_once()
        self.assertTrue(snapshots._path("180d", "cpu,ram,wp").is_file())
        with patch.dict(os.environ, {"SPHERE_TREND_SNAPSHOT_WORKER": "false"}):
            stored = snapshots.load("180d", "cpu,ram,wp")
        self.assertIsNotNone(stored)

    def test_timer_not_automatically_enabled_by_deploy(self):
        root = Path(__file__).resolve().parents[2]
        deploy = (root / "ops/rundeck/deploy-dev.sh").read_text()
        self.assertNotIn("sphere-trend-precompute-dev.timer", deploy)
        service = (root / "ops/rundeck/sphere-trend-precompute-dev.service").read_text()
        self.assertIn("StateDirectory=sphere/trend-snapshots-dev", service)
        self.assertIn("default_transaction_read_only=on", service)
        self.assertNotIn("rundeck-prod", service)


if __name__ == "__main__":
    unittest.main()

"""Offline DEV-only snapshot safety and response-contract regression.

No database, services, persistent runtime directories or network required.
"""
from __future__ import annotations

import gzip
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

from backend import rundeck_evaluation as ev
from backend import rundeck_report_precompute as worker
from backend import rundeck_report_snapshots as snap


DEV = {
    "SPHERE_REPORT_SNAPSHOT_DEV": "true",
    "SPHERE_REPORT_SNAPSHOT_WORKER": "true",
    "SPHERE_EVAL_SPLIT_DISTINCT_DEV": "true",
    "DB_MODE": "db",
    "DATABASE_URL": "postgresql+psycopg://sphere:unused@localhost:5432/sphere_rundeck_dev",
}


def report(period="month", month="2026-10", week_start=None):
    return {
        "period": period,
        "month": month,
        "week_start": week_start,
        "type": "ALL",
        "summary": {"workloads": 2},
        "items": [
            {"consumer_type": "JOB", "consumer_key": "Z_JOB1", "status": "NORMAL"},
            {"consumer_type": "PROGRAM", "consumer_key": "Z_PROGRAM", "status": "REVIEW REQUIRED"},
        ],
        "monthly_pressure": {"cpu": {"episodes": 0}},
        "monthly_errors": {"status": "COLLECTED"},
        "start": datetime.fromisoformat("2026-10-01T00:00:00+00:00"),
    }


class ReportSnapshotDevTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.env = {**DEV, "SPHERE_REPORT_SNAPSHOT_DIR": self.folder.name}
        self.addCleanup(self.folder.cleanup)
        self.patch_env = patch.dict(os.environ, self.env, clear=True)
        self.patch_env.start()
        self.addCleanup(self.patch_env.stop)
        ev._EVALUATION_CACHE.clear()
        self.addCleanup(ev._EVALUATION_CACHE.clear)

    def test_prod_db_and_missing_flag_are_disabled(self):
        self.assertTrue(snap.enabled())
        for key, value in (
            ("SPHERE_REPORT_SNAPSHOT_DEV", "false"),
            ("SPHERE_REPORT_SNAPSHOT_DEV", "1"),
            ("DATABASE_URL", "postgresql+psycopg://sphere@localhost/sphere"),
            ("DB_MODE", "file"),
        ):
            with self.subTest(key=key, value=value), patch.dict(os.environ, {key: value}):
                self.assertFalse(snap.enabled())

    def test_atomic_full_population_round_trip_and_explicit_stale_metadata(self):
        full = report()
        path = snap.save("month", "2026-10", "split_distinct", "run-1", full)
        self.assertTrue(path.is_file())
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertFalse(any(Path(self.folder.name).glob("*.tmp")))
        loaded, info = snap.load("month", "2026-10", "split_distinct", "run-1")
        self.assertEqual(info["status"], "FRESH")
        self.assertEqual(len(loaded["items"]), 2)
        self.assertEqual(loaded["start"], "2026-10-01T00:00:00+00:00")
        self.assertIsNone(snap.load("week", "2026-10-26", "split_distinct", "run-1"))
        self.assertIsNone(snap.load("month", "2026-10", "baseline", "run-1"))
        stale = snap.load("month", "2026-10", "split_distinct", "run-2")
        self.assertEqual(stale[1]["status"], "STALE")
        self.assertEqual(stale[1]["source_anchor"], "run-1")
        self.assertEqual(stale[1]["current_anchor"], "run-2")
        self.assertIsNone(snap.load("month", "2026-10", "split_distinct", "run-2", allow_stale=False))

    def test_corrupt_snapshot_fails_closed(self):
        path = snap.save("month", "2026-10", "split_distinct", "run-1", report())
        path.write_bytes(b"not a gzip payload")
        self.assertIsNone(snap.load("month", "2026-10", "split_distinct", "run-1"))

    def test_write_requires_worker_opt_in(self):
        with patch.dict(os.environ, {"SPHERE_REPORT_SNAPSHOT_WORKER": "false"}):
            with self.assertRaises(RuntimeError):
                snap.save("month", "2026-10", "split_distinct", "run-1", report())

    def test_scope_validation_prevents_path_traversal(self):
        for period, label in (("month", "../etc"), ("week", "2026-10-27"),
                              ("custom", "2026-10"), ("week", "../../etc")):
            with self.subTest(period=period, label=label), self.assertRaises(ValueError):
                snap._path(period, label, "split_distinct")

    def test_weekly_snapshot_retains_week_scope(self):
        full = report("week", "2026-10", "2026-10-26")
        snap.save("week", "2026-10-26", "split_distinct", "run-1", full)
        loaded, info = snap.load("week", "2026-10-26", "split_distinct", "run-1")
        self.assertEqual(loaded["week_start"], "2026-10-26")
        self.assertEqual(info["status"], "FRESH")

    def test_fastapi_read_through_preserves_full_population_paging(self):
        snap.save("month", "2026-10", "split_distinct", "run-1", report())
        engine = MagicMock()
        with patch.object(ev, "get_engine", return_value=engine), \
             patch.object(ev, "_calendar_month_collection_anchor", return_value="run-1"):
            with patch.dict(os.environ, {"SPHERE_REPORT_SNAPSHOT_WORKER": "false"}):
                response = ev._evaluation_report_locked(
                    "month", "ALL", 1, 1, "", "ALL", month="2026-10",
                )
        self.assertEqual(response["runtime"]["cache"], "SNAPSHOT")
        self.assertEqual(response["page"]["total"], 2)
        self.assertEqual(response["page"]["returned"], 1)
        self.assertEqual(response["items"][0]["consumer_key"], "Z_PROGRAM")
        self.assertEqual(response["summary"]["workloads"], 2)
        self.assertEqual(response["snapshot"]["status"], "FRESH")
        self.assertIn(("month:2026-10:split_distinct", "ALL", "run-1"), ev._EVALUATION_CACHE)

    def test_stale_snapshot_is_not_inserted_under_current_cache_key(self):
        snap.save("month", "2026-10", "split_distinct", "run-1", report())
        engine = MagicMock()
        with patch.object(ev, "get_engine", return_value=engine), \
             patch.object(ev, "_calendar_month_collection_anchor", return_value="run-2"):
            with patch.dict(os.environ, {"SPHERE_REPORT_SNAPSHOT_WORKER": "false"}):
                response = ev._evaluation_report_locked(
                    "month", "ALL", 5, 0, "", "ALL", month="2026-10",
                )
        self.assertEqual(response["runtime"]["cache"], "STALE_SNAPSHOT")
        self.assertEqual(response["snapshot"]["status"], "STALE")
        self.assertFalse(ev._EVALUATION_CACHE)

    def test_worker_isolation_and_anchor_consistency(self):
        full = report()
        key = ("month:2026-10:split_distinct", "ALL", "run-1")

        def compute(**kwargs):
            ev._cache_put(key, full)
            return {"runtime": {"cache": "MISS"}}

        with patch.object(worker, "_anchor", side_effect=["run-1", "run-1"]), \
             patch.object(ev, "evaluation_report", side_effect=compute):
            result = worker.build("month", "2026-10")
        self.assertTrue(result.startswith("BUILT rows=2"))
        self.assertIsNotNone(snap.load("month", "2026-10", "split_distinct", "run-1"))
        with patch.object(worker, "_anchor", return_value="run-1"), \
             patch.object(ev, "evaluation_report", side_effect=AssertionError("should skip")):
            self.assertEqual(worker.build("month", "2026-10"), "SKIP_FRESH")

    def test_plan_contains_current_previous_periods(self):
        scopes = worker.planned_scopes(datetime.fromisoformat("2026-11-06T08:00:00+07:00"))
        self.assertEqual(scopes, [
            ("month", "2026-11"), ("month", "2026-10"),
            ("week", "2026-11-02"), ("week", "2026-10-26"),
            ("week", "2026-10-19"),
        ])

    def test_no_implicit_production_or_dev_timer_activation(self):
        root = Path(__file__).resolve().parents[2]
        deploy = (root / "ops/rundeck/deploy-dev.sh").read_text()
        self.assertNotIn("sphere-report-precompute-dev.timer", deploy)
        service = (root / "ops/rundeck/sphere-report-precompute-dev.service").read_text()
        self.assertIn("StateDirectory=sphere/report-snapshots-dev", service)
        self.assertIn("EnvironmentFile=/etc/sphere/rundeck-dev.env", service)
        self.assertNotIn("rundeck-prod", service)


if __name__ == "__main__":
    unittest.main()

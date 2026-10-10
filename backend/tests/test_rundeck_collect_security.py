"""Fail-closed SPHERE DEV Collect Now tests.

Mocks intercept all Rundeck calls; no SAP job or Rundeck API is contacted.
"""
from __future__ import annotations

import json
import os
import threading
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi import HTTPException

from backend import rundeck_api_core as core
from backend import rundeck_runner as runner


SPECS = {
    "performance": {
        "key": "performance", "label": "Performance",
        "job_id": "approved-perf", "project": "Linux",
        "group": "SAP/AOP", "name": "Performance Collector",
    },
    "availability": {
        "key": "availability", "label": "Availability",
        "job_id": "approved-avail", "project": "Linux",
        "group": "SAP/AOP", "name": "Availability Collector",
    },
}


def response(path, method="GET"):
    if method != "POST":
        raise AssertionError("Unexpected Rundeck request")
    return {"id": 765001 if "approved-perf" in path else 765002, "status": "running"}


class CollectSecurityTests(unittest.TestCase):
    def test_browser_headers_and_env_cannot_unlock_route(self):
        with patch.dict(os.environ, {"RUNDECK_COLLECT_NOW_ENABLED": "true"}), \
                patch.object(runner, "collect_now") as launch:
            state = core.collect_now_status()
            self.assertFalse(state["enabled"])
            self.assertFalse(state["allowed"])
            self.assertEqual(state["readiness_reason"], "MAINTAINER_AUTH_NOT_CONFIGURED")
            # An untrusted request, even with forged forwarded-user/action
            # headers, cannot reach the job launcher.
            with self.assertRaises(HTTPException) as raised:
                core.trigger_collect_now(object())
            self.assertEqual(raised.exception.status_code, 403)
            launch.assert_not_called()

    def test_running_job_query_failure_blocks_collection(self):
        with TemporaryDirectory() as dirname, \
                patch.object(runner, "ROOT", Path(dirname)), \
                patch.object(runner, "credential_mode", return_value="systemd"), \
                patch.object(runner, "_job_specs", return_value=SPECS), \
                patch.object(runner, "_latest_running_job", side_effect=PermissionError("403")):
            state = runner.status()
        self.assertFalse(state["ready"])
        self.assertFalse(state["allowed"])
        self.assertEqual(state["readiness_reason"], "RUNDECK_RUNNING_STATE_UNVERIFIED")

    def test_intent_is_persisted_before_any_post(self):
        snapshots = []

        def request(path, method="GET"):
            with open(root / "collect-now.json", encoding="utf-8") as stream:
                snapshots.append(json.load(stream))
            return response(path, method)

        with TemporaryDirectory() as dirname:
            root = Path(dirname)
            with patch.object(runner, "ROOT", root), \
                    patch.object(runner, "_job_specs", return_value=SPECS), \
                    patch.object(runner, "status", side_effect=[{"allowed": True}, {"allowed": False}]), \
                    patch.object(runner, "_request", side_effect=request), \
                    patch.object(runner.threading, "Thread") as thread:
                runner.collect_now(actor="test-maintainer")
            self.assertEqual(len(snapshots), 2)
            self.assertTrue(all(row["launch_incomplete"] for row in snapshots))
            self.assertEqual(snapshots[0]["requested_by"], "test-maintainer")
            self.assertEqual(snapshots[0]["sources"], {})
            state = json.loads((root / "collect-now.json").read_text())
            self.assertFalse(state["launch_incomplete"])
            self.assertFalse(state["launch_reconciliation_required"])
            self.assertEqual(set(state["sources"]), {"performance", "availability"})
            thread.return_value.start.assert_called_once()

    def test_concurrent_launch_rejected_before_second_post(self):
        entered = threading.Event()
        release = threading.Event()
        posts = []
        errors = []

        def request(path, method="GET"):
            posts.append(path)
            if "approved-perf" in path:
                entered.set()
                self.assertTrue(release.wait(3), "First launch must be released")
            return response(path, method)

        def first_call():
            try:
                runner.collect_now()
            except Exception as error:
                errors.append(error)

        with TemporaryDirectory() as dirname, \
                patch.object(runner, "ROOT", Path(dirname)), \
                patch.object(runner, "_job_specs", return_value=SPECS), \
                patch.object(runner, "status", return_value={"allowed": True}), \
                patch.object(runner, "_request", side_effect=request), \
                patch.object(runner.threading, "Thread") as watcher:
            first = threading.Thread(target=first_call)
            first.start()
            try:
                self.assertTrue(entered.wait(3), "First request did not reach mocked POST")
                with self.assertRaisesRegex(RuntimeError, "already in progress"):
                    runner.collect_now()
            finally:
                release.set()
                first.join(timeout=5)
            self.assertFalse(first.is_alive())
            self.assertFalse(errors)
            self.assertEqual(len(posts), 2)
            watcher.return_value.start.assert_called_once()

    def test_ambiguous_post_does_not_claim_not_started(self):
        def request(path, method="GET"):
            if "approved-perf" in path:
                raise TimeoutError("Ambiguous network timeout")
            return response(path, method)

        with TemporaryDirectory() as dirname, \
                patch.object(runner, "ROOT", Path(dirname)), \
                patch.object(runner, "_job_specs", return_value=SPECS), \
                patch.object(runner, "status", side_effect=[{"allowed": True}, {"allowed": False}]), \
                patch.object(runner, "_request", side_effect=request), \
                patch.object(runner.threading, "Thread"):
            runner.collect_now()
            state = runner._read_state()
        self.assertTrue(state["launch_reconciliation_required"])
        self.assertFalse(state["launch_incomplete"])
        self.assertEqual(state["sources"]["performance"]["ingest_status"], "LAUNCH_UNVERIFIED")
        self.assertEqual(state["sources"]["performance"]["status"], "unknown")
        self.assertEqual(state["sources"]["availability"]["execution_id"], "765002")

    def test_unreconciled_intent_blocks_even_after_cooldown(self):
        with TemporaryDirectory() as dirname:
            root = Path(dirname)
            (root / "collect-now.json").write_text(json.dumps({
                "requested_at": "2025-01-01T00:00:00+00:00",
                "launch_incomplete": True,
                "sources": {},
            }))
            with patch.object(runner, "ROOT", root), \
                    patch.object(runner, "credential_mode", return_value="systemd"), \
                    patch.object(runner, "_job_specs", return_value=SPECS), \
                    patch.object(runner, "_latest_running_job", return_value=None):
                result = runner.status()
        self.assertFalse(result["allowed"])
        self.assertEqual(result["readiness_reason"], "LAUNCH_RECONCILIATION_REQUIRED")


if __name__ == "__main__":
    unittest.main()

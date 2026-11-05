"""Read-only performance guardrails for historical SAP reporting."""
from __future__ import annotations

import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Lock
from time import sleep
from unittest.mock import patch

from backend import rundeck_evaluation
from backend.rundeck_monthly_errors import monthly_error_evidence


class Result:
    def mappings(self):
        return self

    def all(self):
        return []

    def scalar(self):
        return True


class CaptureConn:
    def __init__(self):
        self.queries = []

    def execute(self, statement, params=None):
        self.queries.append(str(statement))
        return Result()


class ReportPerformanceSafetyTest(unittest.TestCase):
    def test_monthly_error_query_gates_jsonb_expansion_without_losing_legacy_keys(self):
        conn = CaptureConn()
        start = datetime(2026, 10, 1, tzinfo=timezone.utc)
        end = datetime(2026, 10, 2, tzinfo=timezone.utc)
        report = monthly_error_evidence(
            conn, start, end, "rundeck_top_consumers", "c.status = 'READY'",
        )
        self.assertGreaterEqual(len(conn.queries), 1)
        q = conn.queries[0]
        for key in (
            "wp_signals", "error_at_snapshot", "latest_trace_error", "error_code",
            "rabax", "rabax_tail_count", "rxmsg", "rxmsg_tail_count",
        ):
            self.assertIn("tc.details ? '"+key+"'", q)
        self.assertIn("jsonb_array_elements", q)
        self.assertIn("signal.value->>'error_code'", q)
        self.assertTrue(report["error_fields_retained"])
        self.assertEqual(report["timestamped_events"], 0)

    def test_waiting_cold_evaluation_emits_slow_lock_warning(self):
        lock = Lock()
        lock.acquire()
        with patch.object(rundeck_evaluation, "_EVALUATION_COMPUTE_LOCK", lock), \
             patch.object(rundeck_evaluation, "_evaluation_report_locked",
                          return_value={"runtime": {"cache": "HIT"}}), \
             patch.object(rundeck_evaluation, "EVALUATION_SLOW_SQL_MS", 100):
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(rundeck_evaluation.evaluation_report, month="2026-10")
                with self.assertLogs("backend.rundeck_evaluation", level="WARNING") as log:
                    try:
                        sleep(.15)
                    finally:
                        lock.release()
                    result = future.result(timeout=5)
        self.assertEqual(result["runtime"]["cache"], "HIT")
        self.assertGreaterEqual(result["runtime"]["lock_wait_ms"], 100)
        self.assertTrue(any("SPHERE_EVAL_SLOW_LOCK" in line for line in log.output))


if __name__ == "__main__":
    unittest.main()

"""Offline tests for GET-only Rundeck job guardrail extraction."""
import contextlib
import importlib.util
import io
from pathlib import Path
import unittest

PATH = Path(__file__).resolve().parents[2] / "ops/rundeck/diagnose-rundeck-job-node-filters-dev.py"
SPEC = importlib.util.spec_from_file_location("sphere_rundeck_guard_probe", PATH)
probe = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(probe)


class JobGuardProbeTests(unittest.TestCase):
    META = {
        "id": "4f129041-956c-4e80-916f-fcde8948db09",
        "project": "Linux",
        "group": "SAP/AOP",
        "name": "[Critical]-[Daily Check] SPHERE SAP Work Proccess Check",
    }

    def test_export_accepts_single_job_array(self):
        payload = [{**self.META, "multipleExecutions": False, "timeout": "20m"}]
        self.assertEqual(probe.export_job(payload, self.META), payload[0])

    def test_export_accepts_jobs_wrapper(self):
        payload = {"jobs": [{**self.META, "retry": 0}]}
        self.assertEqual(probe.export_job(payload, self.META), payload["jobs"][0])

    def test_export_rejects_ambiguous_and_mismatch(self):
        self.assertIsNone(probe.export_job([self.META, self.META], self.META))
        self.assertIsNone(probe.export_job({**self.META, "id": "another"}, self.META))
        self.assertIsNone(probe.export_job({**self.META, "name": "other"}, self.META))

    def test_export_rejects_missing_name_even_if_endpoint_specific(self):
        self.assertIsNone(probe.export_job({"multipleExecutions": False}, self.META))

    def test_output_does_not_emit_untrusted_strings(self):
        output = io.StringIO()
        payload = {**self.META, "scheduleEnabled": "TOKEN_DO_NOT_PRINT",
                   "nodeFilterEditable": "TOKEN_DO_NOT_PRINT", "retry": "${secret}",
                   "nodefilters": {"filter": "bad\nINJECTED"},
                   "multipleExecutions": True}
        with contextlib.redirect_stdout(output):
            probe.describe_job(payload)
        rendered = output.getvalue()
        self.assertIn("MULTIPLE_EXECUTIONS=ENABLED", rendered)
        self.assertIn("SCHEDULE_ENABLED=UNVERIFIED", rendered)
        self.assertIn("NODE_FILTER=REDACTED", rendered)
        self.assertNotIn("TOKEN_DO_NOT_PRINT", rendered)
        self.assertNotIn("INJECTED", rendered)
        self.assertNotIn("secret", rendered)

    def test_bounded_retry_and_timeout(self):
        self.assertEqual(probe.compact_retry({"retry": 2, "delay": "1m"}), "2")
        self.assertEqual(probe.compact_retry("${option.password}"), "DYNAMIC_OR_UNVERIFIED")
        self.assertEqual(probe.compact_timeout("20m"), "20m")
        self.assertEqual(probe.compact_timeout("${option.password}"), "DYNAMIC_OR_UNVERIFIED")


if __name__ == "__main__":
    unittest.main()

"""Offline regression checks for the read-only Rundeck HTTP diagnostic."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

MODULE_PATH = Path(__file__).resolve().parents[2] / "ops" / "rundeck" / "diagnose-rundeck-auth-dev.py"
spec = importlib.util.spec_from_file_location("sphere_dev_rundeck_auth_probe", MODULE_PATH)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class ReaderProbeTests(unittest.TestCase):
    def test_only_get_and_same_reader_token_for_every_request(self):
        calls = []

        class Response:
            status = 200
            def __enter__(self):
                return self
            def __exit__(self, *_):
                return False

        class Opener:
            def open(self, request, timeout):
                calls.append((request.get_method(), request.get_header("X-rundeck-auth-token"), timeout))
                return Response()

        with patch.object(probe, "build_opener", return_value=Opener()):
            self.assertEqual(probe.http_status("/api/44/system/info", "test-reader"), "HTTP_200")
            self.assertEqual(probe.http_status("/api/44/project/Linux/executions", "test-reader"), "HTTP_200")
        self.assertEqual(calls, [("GET", "test-reader", 10), ("GET", "test-reader", 10)])

    def test_403_is_returned_as_code_without_printing_body(self):
        class Opener:
            def open(self, request, timeout):
                raise HTTPError(request.full_url, 403, "Forbidden with secret", {}, None)
        with patch.object(probe, "build_opener", return_value=Opener()):
            self.assertEqual(probe.http_status("/api/44/system/info", "test-reader"), "HTTP_403")

    def test_environment_is_only_parsed_not_executed(self):
        with tempfile.TemporaryDirectory() as dirname:
            path = Path(dirname) / "config"
            path.write_text(
                'RUNDECK_PROJECT=Linux\n'
                'RUNDECK_JOB_GROUP=SAP/AOP\n'
                'RUNDECK_JOB_NAME="Daily Check"\n'
                'UNRELATED_SECRET=$(touch /tmp/not-executed)\n'
            )
            result = probe.load_config(path)
        self.assertEqual(result["RUNDECK_PROJECT"], "Linux")
        self.assertEqual(result["RUNDECK_JOB_GROUP"], "SAP/AOP")
        self.assertEqual(result["RUNDECK_JOB_NAME"], "Daily Check")
        self.assertNotIn("UNRELATED_SECRET", result)

    def test_watchdog_endpoint_skipped_without_exact_job_id(self):
        targets = probe.probe_paths({
            "RUNDECK_PROJECT": "Linux",
            "RUNDECK_JOB_GROUP": "SAP/AOP",
            "RUNDECK_JOB_NAME": "Daily Check",
            "RUNDECK_RUN_JOB_ID": "REPLACE_WITH_EXACT_SPHERE_JOB_UUID",
        })
        self.assertEqual([label for label, _ in targets], ["API system info", "Poller executions"])
        self.assertTrue(all(path.startswith("/api/44/") for _, path in targets))


if __name__ == "__main__":
    unittest.main()

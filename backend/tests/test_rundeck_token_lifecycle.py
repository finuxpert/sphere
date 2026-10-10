"""Offline security/expiry regression tests; no token, HTTP or service actions."""
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from backend.rundeck_token_lifecycle import token_lifecycle


class TokenLifecycleTests(unittest.TestCase):
    def test_observations_never_imply_live_verification(self):
        with tempfile.TemporaryDirectory() as directory:
            snapshot = token_lifecycle(Path(directory), datetime(2026, 10, 11, tzinfo=timezone.utc))
        self.assertEqual(len(snapshot["items"]), 2)
        self.assertFalse(snapshot["renewal_enabled"])
        self.assertTrue(snapshot["read_only"])
        self.assertEqual(snapshot["items"][0]["state"], "REPORTED")
        self.assertEqual(snapshot["items"][1]["state"], "DUE_SOON")
        self.assertTrue(all(not item["live_verified"] and not item["renewal_allowed"] for item in snapshot["items"]))

    def test_expired_observations_are_not_called_active(self):
        with tempfile.TemporaryDirectory() as directory:
            snapshot = token_lifecycle(Path(directory), datetime(2026, 11, 12, tzinfo=timezone.utc))
        self.assertEqual([item["state"] for item in snapshot["items"]], ["EXPIRED", "EXPIRED"])

    def test_register_never_reflects_secret_fields_or_user_text(self):
        secret = "SECRET_TOKEN_SHOULD_NOT_LEAK_123"
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "credential-lifecycle.json").write_text(json.dumps({
                "runner": {
                    "token": secret, "label": secret, "identity": secret,
                    "role": secret, "reported_at": secret,
                    "expires_at": "2026-11-30T00:00:00+07:00",
                }
            }))
            snapshot = token_lifecycle(Path(directory), datetime(2026, 10, 11, tzinfo=timezone.utc))
        self.assertNotIn(secret, json.dumps(snapshot))
        self.assertEqual(snapshot["items"][1]["source"], "operator-register")
        self.assertEqual(snapshot["items"][1]["identity"], "UNVERIFIED")
        self.assertEqual(snapshot["items"][1]["state"], "REPORTED")
        self.assertFalse(snapshot["items"][1]["renewal_allowed"])

    def test_malformed_register_falls_back_without_exception(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "credential-lifecycle.json").write_text("{bad json")
            snapshot = token_lifecycle(Path(directory), datetime(2026, 10, 11, tzinfo=timezone.utc))
        self.assertEqual(snapshot["items"][1]["source"], "observation")
        self.assertFalse(snapshot["maintainer_auth_verified"])


if __name__ == "__main__":
    unittest.main()

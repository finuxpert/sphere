"""Browser is denied unless an authenticated DEV session, CSRF, and explicit gate exist."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from sphere_jumphost.main import app
from sphere_jumphost.security.auth_store import Principal
from sphere_jumphost.security.dependencies import require_ready


class BrowserGateTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def test_no_anonymous_browser_creation(self):
        r = self.client.post("/api/v1/browser/sessions", json={"url": "https://10.14.33.64:8124/"})
        self.assertEqual(r.status_code, 401)

    def test_no_anonymous_frames(self):
        r = self.client.get("/api/v1/browser/sessions/fake/frame")
        self.assertEqual(r.status_code, 401)

    def test_default_gate_is_disabled(self):
        principal = Principal("admin", False, "csrf", "a" * 64)
        app.dependency_overrides[require_ready] = lambda: principal
        with patch.dict(os.environ, {"JUMPHOST_ENV": "dev", "JUMPHOST_BROWSER_ENABLED": "0",
                                     "SPHERE_BROWSER_WORKER_TOKEN": "x" * 64}):
            r = self.client.post("/api/v1/browser/sessions", json={"url": "https://10.14.33.64:8124/"})
            self.assertEqual(r.status_code, 503)
            self.assertIn("disabled", r.json()["detail"].lower())

    def test_prod_cannot_enable_browser(self):
        principal = Principal("admin", False, "csrf", "a" * 64)
        app.dependency_overrides[require_ready] = lambda: principal
        with patch.dict(os.environ, {"JUMPHOST_ENV": "prod", "JUMPHOST_BROWSER_ENABLED": "1",
                                     "SPHERE_BROWSER_WORKER_TOKEN": "x" * 64}):
            r = self.client.post("/api/v1/browser/sessions", json={"url": "https://10.14.33.64:8124/"})
            self.assertEqual(r.status_code, 503)


if __name__ == "__main__":
    unittest.main()

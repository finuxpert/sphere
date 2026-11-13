"""Safety checks: all session endpoints MUST remain disabled in scaffold."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from sphere_jumphost.main import app
from sphere_jumphost.security.auth_store import AuthSettings, AuthStore, COOKIE_NAME
from sphere_jumphost.security.dependencies import get_auth_store
import tempfile


class TestJumpHostContract(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = AuthStore(AuthSettings("dev", Path(self.tmp.name) / "auth.db", True, False))
        app.dependency_overrides[get_auth_store] = lambda: self.store
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()
        self.tmp.cleanup()

    def test_health(self):
        response = self.client.get("/api/v1/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "SCAFFOLD_ONLY")

    def test_capabilities_disabled(self):
        login = self.client.post("/api/v1/auth/login", json={"username":"admin", "password":"admin"}).json()
        headers = {"cookie": f"{COOKIE_NAME}={self.client.cookies.get(COOKIE_NAME)}"}
        capabilities = self.client.get("/api/v1/capabilities", headers=headers).json()
        self.assertFalse(capabilities["ssh_sessions"])
        self.assertFalse(capabilities["browser_sessions"])

    def test_ssh_never_opens_session(self):
        response = self.client.post("/api/v1/ssh/sessions", json={"host": "10.14.90.10", "username": "operator"})
        self.assertEqual(response.status_code, 401)

    def test_browser_never_opens_session(self):
        response = self.client.post("/api/v1/browser/sessions", json={"url": "https://intranet.example.local"})
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()

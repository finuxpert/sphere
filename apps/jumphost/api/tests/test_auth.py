"""Offline authentication security tests; no SSH or browser connections."""
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from sphere_jumphost.main import app
from sphere_jumphost.security.auth_store import AuthSettings, AuthStore, COOKIE_NAME, get_cookie_path
from sphere_jumphost.security.dependencies import get_auth_store


class TestAdminAuthentication(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "auth.db"
        self.store = AuthStore(AuthSettings("dev", self.db_path, True, False))
        app.dependency_overrides[get_auth_store] = lambda: self.store
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()
        self.tmp.cleanup()

    def _login(self, password="admin"):
        response = self.client.post("/api/v1/auth/login", json={"username": "admin", "password": password})
        return response

    def _cookie(self, login_response):
        return {"cookie": f"{COOKIE_NAME}={login_response.cookies.get(COOKIE_NAME)}"}

    def test_dev_public_cookie_path(self):
        old = os.environ.get("JUMPHOST_PUBLIC_BASE_PATH")
        os.environ["JUMPHOST_PUBLIC_BASE_PATH"] = "/dev/remote"
        try:
            self.assertEqual(get_cookie_path(), "/dev/remote")
            login = self._login()
            self.assertEqual(login.status_code, 200)
            self.assertIn("path=/dev/remote", login.headers["set-cookie"].lower())
        finally:
            if old is None:
                os.environ.pop("JUMPHOST_PUBLIC_BASE_PATH", None)
            else:
                os.environ["JUMPHOST_PUBLIC_BASE_PATH"] = old

    def test_reject_unsupported_cookie_paths(self):
        old = os.environ.get("JUMPHOST_PUBLIC_BASE_PATH")
        os.environ["JUMPHOST_PUBLIC_BASE_PATH"] = "/random/path"
        try:
            with self.assertRaises(ValueError):
                get_cookie_path()
        finally:
            if old is None:
                os.environ.pop("JUMPHOST_PUBLIC_BASE_PATH", None)
            else:
                os.environ["JUMPHOST_PUBLIC_BASE_PATH"] = old

    def test_default_admin_requires_explicit_bootstrap_and_rotation(self):
        initial = self._login()
        self.assertEqual(initial.status_code, 200)
        self.assertTrue(initial.json()["must_change_password"])
        self.assertTrue(initial.cookies.get(COOKIE_NAME))
        self.assertIn("httponly", initial.headers["set-cookie"].lower())
        self.assertIn("samesite=strict", initial.headers["set-cookie"].lower())
        self.assertIn("path=/remote", initial.headers["set-cookie"].lower())
        self.assertEqual(os.stat(self.db_path).st_mode & 0o777, 0o600)
        self.assertNotIn(b"admin/admin", self.db_path.read_bytes())

    def test_auth_gate_and_rotate_all_sessions(self):
        self.assertEqual(self.client.get("/api/v1/capabilities").status_code, 401)
        self.assertEqual(self.client.post("/api/v1/ssh/sessions", json={"host":"192.0.2.1","username":"operator"}).status_code, 401)
        login = self._login()
        cookie = self._cookie(login)
        csrf = login.json()["csrf_token"]
        self.assertEqual(self.client.get("/api/v1/auth/me", headers=cookie).status_code, 200)
        self.assertEqual(self.client.post("/api/v1/ssh/sessions", json={"host":"192.0.2.1","username":"operator"}, headers=cookie).status_code, 403)
        ready_headers = {**cookie, "X-Jumphost-CSRF": csrf}
        ssh = {"host": "192.0.2.1", "username": "operator"}
        self.assertEqual(self.client.post("/api/v1/ssh/sessions", json=ssh, headers=ready_headers).status_code, 403)
        rotated = self.client.post("/api/v1/auth/change-password", json={"current_password": "admin", "new_password": "a-stronger-Passw0rd!"}, headers=ready_headers)
        self.assertEqual(rotated.status_code, 200)
        self.assertEqual(self.client.get("/api/v1/auth/me", headers=cookie).status_code, 401)
        self.assertEqual(self._login().status_code, 401)
        login2 = self._login("a-stronger-Passw0rd!")
        self.assertEqual(login2.status_code, 200)
        self.assertFalse(login2.json()["must_change_password"])
        headers2 = {**self._cookie(login2), "X-Jumphost-CSRF": login2.json()["csrf_token"]}
        self.assertEqual(self.client.get("/api/v1/capabilities", headers=headers2).status_code, 200)
        self.assertEqual(self.client.post("/api/v1/ssh/sessions", json=ssh, headers=headers2).status_code, 501)
        self.assertEqual(self.client.post("/api/v1/browser/sessions", json={"url":"https://internal.example"}, headers=headers2).status_code, 501)
        self.assertEqual(self.client.post("/api/v1/auth/logout", headers=headers2).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/auth/me", headers=self._cookie(login2)).status_code, 401)

    def test_wrong_csrf_cannot_logout_or_change_password(self):
        login = self._login()
        cookie = self._cookie(login)
        self.assertEqual(self.client.post("/api/v1/auth/logout", headers=cookie).status_code, 403)
        self.assertEqual(self.client.post("/api/v1/auth/change-password", json={"current_password":"admin","new_password":"secure-Passw0rd123"},headers={**cookie,"X-Jumphost-CSRF":"wrong"}).status_code, 403)

    def test_bruteforce_lockout_is_persistent(self):
        for i in range(4):
            self.assertEqual(self._login("wrong").status_code, 401)
        self.assertEqual(self._login("wrong").status_code, 429)
        self.assertEqual(self._login("admin").status_code, 429)
        recovered = AuthStore(AuthSettings("dev", self.db_path, False, False))
        with self.assertRaises(Exception):
            recovered.login("admin", "admin")

    def test_no_insecure_defaults_in_prod(self):
        with self.assertRaises(ValueError):
            self._prod_settings_check()
        prod_db = Path(self.tmp.name) / "prod.db"
        prod = AuthStore(AuthSettings("prod", prod_db, False, True))
        with self.assertRaises(Exception):
            prod.login("admin", "admin")
        prod.provision_admin("VeryStrongProdPassw0rd!")
        self.assertFalse(prod.login("admin", "VeryStrongProdPassw0rd!")[1].must_change_password)

    def _prod_settings_check(self):
        original_env = dict(os.environ)
        try:
            os.environ["JUMPHOST_ENV"] = "prod"
            os.environ["JUMPHOST_DEV_BOOTSTRAP_ADMIN_ADMIN"] = "1"
            return AuthSettings.from_env()
        finally:
            os.environ.clear()
            os.environ.update(original_env)

    def test_bootstrap_does_not_reset_rotated_password_on_restart(self):
        login = self._login()
        principal = self.store.authenticate(login.cookies.get(COOKIE_NAME))
        self.store.change_password(principal, "admin", "SecondPassw0rd-Protected")
        AuthStore(AuthSettings("dev", self.db_path, True, False))
        self.assertEqual(self._login().status_code, 401)
        self.assertEqual(self._login("SecondPassw0rd-Protected").status_code, 200)


if __name__ == "__main__":
    unittest.main()

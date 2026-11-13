"""Schema tests that run without contacting any network target."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import ValidationError
from sphere_jumphost.models import SSHSessionRequest, BrowserSessionRequest


class TestJumpHostModels(unittest.TestCase):
    def test_ssh_ipv4(self):
        value = SSHSessionRequest(host="10.14.90.10", username="nexadm")
        self.assertEqual(value.port, 22)

    def test_ssh_hostname(self):
        self.assertEqual(SSHSessionRequest(host="AOPH1PAPPDC", username="operator").host, "AOPH1PAPPDC")

    def test_ssh_rejects_command(self):
        for host in ("host;rm -rf /", "root@host", "10.0.0.1:22", "bad/host", "host name"):
            with self.subTest(host=host), self.assertRaises(ValidationError):
                SSHSessionRequest(host=host, username="operator")

    def test_ssh_rejects_invalid_port(self):
        with self.assertRaises(ValidationError):
            SSHSessionRequest(host="10.0.0.1", username="operator", port=70000)

    def test_browser_accepts_http_and_https(self):
        for url in ("http://10.14.90.10:8080/", "https://intranet.example.local/dashboard"):
            with self.subTest(url=url):
                self.assertEqual(BrowserSessionRequest(url=url).url, url)

    def test_browser_rejects_schemes_and_credentials(self):
        for url in ("file:///etc/passwd", "javascript:alert(1)", "http://a:b@internal.example", "ftp://host/path"):
            with self.subTest(url=url), self.assertRaises(ValidationError):
                BrowserSessionRequest(url=url)


if __name__ == "__main__":
    unittest.main()

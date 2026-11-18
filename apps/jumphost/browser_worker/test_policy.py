"""Offline worker policy tests; do not start Chromium or make network requests."""
import unittest
from worker import origin


class WorkerPolicyTests(unittest.TestCase):
    def test_exact_private_ipv4_origin(self):
        self.assertEqual(origin("https://10.14.33.64:8124/iwc/login.iwc"), "https://10.14.33.64:8124")

    def test_no_localhost_metadata_or_public_targets(self):
        for url in [
            "http://10.14.33.64:8124",
            "https://127.0.0.1:8124",
            "https://169.254.169.254:443",
            "https://8.8.8.8:443",
            "https://evil.example:443",
            "https://10.14.33.64:8124@evil.example:443",
            "file:///etc/passwd",
        ]:
            with self.subTest(url=url):
                with self.assertRaises(ValueError):
                    origin(url)


if __name__ == "__main__":
    unittest.main()

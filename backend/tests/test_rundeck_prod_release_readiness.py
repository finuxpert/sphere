"""Guard production startup readiness and rollback invariants."""
from pathlib import Path
import unittest


class ProdReleaseReadinessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.script = Path("ops/rundeck/release-prod-compat.sh").read_text()

    def test_http_listener_is_polled_after_restart(self):
        script = self.script
        restart = script.index('systemctl restart "$SERVICE"', script.index('CUTOVER=1'))
        ready = script.index("=== WAIT PROD API HTTP READINESS ===")
        smoke = script.index("=== PROD API LIVE SMOKE ===")
        self.assertLess(restart, ready)
        self.assertLess(ready, smoke)
        self.assertIn("API_HTTP_READY=PASS", script)
        self.assertIn("http://127.0.0.1:8092/openapi.json", script)

    def test_startup_errors_are_logged_before_rollback(self):
        self.assertIn('journalctl --unit "$SERVICE" --since "$STARTED_AT"', self.script)
        self.assertIn("API_HTTP_READY=FAIL", self.script)
        self.assertIn("ROLLBACK=RESTORED_PREVIOUS_PROD_API HTTP_READY=PASS", self.script)

    def test_no_infrastructure_or_db_mutation(self):
        for forbidden in ("alembic upgrade", "git push", "systemctl restart sphere-rundeck-api",
                          "systemctl restart postgresql", "rm -rf /var/lib"):
            self.assertNotIn(forbidden, self.script)


if __name__ == "__main__":
    unittest.main()

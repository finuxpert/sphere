"""Static PROD hourly hotfix safety contract; never touches live services."""
from pathlib import Path
import unittest


class ProdHourlyHotfixGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.script = Path("ops/rundeck/release-prod-hourly-pressure-only.sh").read_text()

    def test_deploy_is_one_backend_module_only(self):
        s = self.script
        self.assertIn("MODULE=backend/rundeck_monthly_pressure.py", s)
        self.assertIn('cp -a -- "$PREVIOUS" "$RELEASE"', s)
        self.assertIn('install -m 0644 "$SOURCE/$MODULE" "$RELEASE/$MODULE"', s)
        for forbidden in (
            "deploy-prod.sh", "alembic upgrade", "systemctl restart postgresql",
            "git reset --hard", "git push", "npm run build", "nginx -s reload",
            "systemctl restart sphere-rundeck-api",
        ):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, s)

    def test_availability_requires_exact_preexisting_503_response(self):
        s = self.script
        self.assertIn("AVAILABILITY_BASELINE_HTTP=", s)
        self.assertIn('"$BASELINE_CODE" == 503 && "$AFTER_CODE" == 503', s)
        self.assertIn('cmp -s "$TMP/availability-before.json" "$TMP/availability-after.json"', s)
        self.assertIn("BLOCKED: Availability regressed", s)

    def test_custom_host_report_is_verified_and_full_month_is_not_claimed(self):
        s = self.script
        self.assertIn("start_date=2026-11-14&end_date=2026-11-15", s)
        self.assertIn('pressure.get("trend_bucket_minutes") == 60', s)
        self.assertIn('assert isinstance(points, list) and points', s)
        self.assertIn("FULL_MONTH_EVALUATION=NOT_VERIFIED", s)

    def test_rolls_back_api_without_changing_dev_or_prod_web(self):
        s = self.script
        self.assertIn("ROLLBACK=RESTORED_PREVIOUS_PROD_API HTTP_READY=PASS", s)
        self.assertIn('mv -Tf "$API/.hourly-rollback-$$" "$CURRENT"', s)
        self.assertIn('[[ "$(readlink -f /var/www/sphere.astraotoparts.co.id/current)" == "$PROD_WEB" ]]', s)
        self.assertIn('[[ "$(readlink -f /opt/sphere-rundeck-dev/current)" == "$DEV_API" ]]', s)
        self.assertIn('[[ "$(readlink -f /var/www/sphere-dev/current)" == "$DEV_WEB" ]]', s)


if __name__ == "__main__":
    unittest.main()

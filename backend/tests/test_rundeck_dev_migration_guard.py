"""Offline tests: SPHERE DEV Alembic target must be exact and local."""
from __future__ import annotations

import contextlib
import importlib.util
import io
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
PROBE = ROOT / "ops/rundeck/validate-dev-migration-target.py"
spec = importlib.util.spec_from_file_location("dev_migration_target", PROBE)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

GOOD = "postgresql+psycopg://sphere@/sphere_rundeck_dev?host=/var/run/postgresql"


class DevMigrationTargetTests(unittest.TestCase):
    def test_documented_local_dev_target_is_accepted(self):
        self.assertTrue(guard.validate(GOOD))
        self.assertTrue(guard.validate(
            "postgresql+psycopg://sphere@/sphere_rundeck_dev?host=/run/postgresql"
        ))
        self.assertTrue(guard.validate(
            "postgresql+psycopg://sphere@localhost/sphere_rundeck_dev"
        ))

    def test_prod_and_substring_spoofing_are_rejected(self):
        for url in (
            "postgresql+psycopg://sphere@/sphere_prod?host=/var/run/postgresql",
            "postgresql+psycopg://sphere@/sphere_prod?host=/var/run/postgresql&fake=/sphere_rundeck_dev",
            "postgresql+psycopg://sphere@/sphere_rundeck_dev_copy?host=/var/run/postgresql",
            "postgresql+psycopg://sphere@/sphere_rundeck_dev/other?host=/var/run/postgresql",
            "postgresql+psycopg://sphere@/sphere_rundeck_dev%2Fother?host=/var/run/postgresql",
            "postgresql+psycopg://sphere@/sphere_rundeck_dev?host=/var/run/postgresql&host=evil",
        ):
            with self.subTest(url=url):
                self.assertFalse(guard.validate(url))

    def test_remote_hosts_roles_password_and_unsafe_options_are_rejected(self):
        for url in (
            "postgresql+psycopg://sphere@remote.example/sphere_rundeck_dev",
            "postgresql+psycopg://sphere@/sphere_rundeck_dev?host=remote.example",
            "postgresql+psycopg://postgres@/sphere_rundeck_dev?host=/var/run/postgresql",
            "postgresql+psycopg://sphere:do_not_print@/sphere_rundeck_dev?host=/var/run/postgresql",
            "postgresql+psycopg://sphere@/sphere_rundeck_dev?host=/var/run/postgresql&options=-csearch_path=public",
            "postgresql+psycopg://sphere@/sphere_rundeck_dev",
            "sqlite:///sphere_rundeck_dev",
        ):
            with self.subTest(url=url):
                self.assertFalse(guard.validate(url))

    def test_probe_output_never_discloses_submitted_url(self):
        hidden = "NOT_A_VALID_SECRET_DB_PASSWORD"
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            old = guard.sys.stdin
            try:
                guard.sys.stdin = io.StringIO(
                    f"postgresql+psycopg://sphere:{hidden}@/sphere_rundeck_dev?host=/var/run/postgresql"
                )
                result = guard.main()
            finally:
                guard.sys.stdin = old
        self.assertEqual(result, 2)
        self.assertEqual(output.getvalue().strip(), "DEV_DATABASE_TARGET=BLOCKED")
        self.assertNotIn(hidden, output.getvalue())

    def test_deploy_requires_explicit_sha_bound_decision_before_side_effects(self):
        source = (ROOT / "ops/rundeck/deploy-dev.sh").read_text()
        gate = source.index('SPHERE_DEV_MIGRATION_APPROVED_SHA')
        side_effect = source.index('NGINX_BACKUP=$(mktemp')
        migration = source.index('"$RELEASE/ops/rundeck/migrate-dev.sh"')
        self.assertLess(gate, side_effect)
        self.assertLess(gate, migration)
        self.assertIn('MIGRATION_DECISION" == "apply"', source)
        self.assertIn('MIGRATION_DECISION" = "skip"', source)

    def test_migration_script_checks_exact_target(self):
        source = (ROOT / "ops/rundeck/migrate-dev.sh").read_text()
        self.assertIn("validate-dev-migration-target.py", source)
        self.assertNotIn('*"/sphere_rundeck_dev"*', source)


if __name__ == "__main__":
    unittest.main()

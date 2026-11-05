"""Offline safety tests for the optional DEV TimescaleDB extension controller."""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
from unittest import TestCase, main
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "ops/rundeck/timescaledb-dev-control.py"
SPEC = importlib.util.spec_from_file_location("timescaledb_dev_control", SCRIPT)
controller = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(controller)


class TimescaleControllerTests(TestCase):
    def test_preload_requires_exact_comma_delimited_name(self):
        self.assertTrue(controller.is_preloaded("pg_stat_statements, timescaledb"))
        self.assertTrue(controller.is_preloaded(" 'timescaledb',auto_explain "))
        self.assertFalse(controller.is_preloaded("timescaledb_fake"))
        self.assertFalse(controller.is_preloaded("not_timescaledb"))
        self.assertFalse(controller.is_preloaded(""))

    def test_gates_before_extension_creation(self):
        cases = [
            ((False, False, False), "PACKAGE_NOT_AVAILABLE"),
            ((True, False, False), "NEEDS_POSTGRESQL_PRELOAD_AND_CONTROLLED_RESTART"),
            ((True, False, True), "READY_FOR_EXTENSION_CREATION"),
            ((True, True, True), "ENABLED"),
        ]
        for args, expected in cases:
            with self.subTest(args=args):
                self.assertEqual(controller.classify(*args), expected)

    def test_database_role_socket_and_os_identity_gates(self):
        with patch.object(controller.pwd, "getpwuid") as lookup, \
             patch.object(controller.os, "geteuid", return_value=10001):
            lookup.return_value.pw_name = "sphere"
            controller.validate_identity("sphere_rundeck_dev", "sphere",
                                         apply=False, local_socket=True)
            for db, role, apply, socket in [
                ("sphere_rundeck_prod", "sphere", False, True),
                ("sphere_rundeck_dev_copy", "sphere", False, True),
                ("sphere_rundeck_dev", "postgres", False, True),
                ("sphere_rundeck_dev", "sphere", False, False),
                ("sphere_rundeck_dev", "sphere", True, True),
            ]:
                with self.subTest(db=db, role=role):
                    with self.assertRaises(RuntimeError):
                        controller.validate_identity(db, role,
                                                     apply=apply, local_socket=socket)

    def test_script_never_installs_packages_restarts_or_migrates_tables(self):
        source = SCRIPT.read_text()
        self.assertIn("CREATE EXTENSION IF NOT EXISTS timescaledb", source)
        self.assertIn("--apply requires --confirm-dev", source)
        for unsafe in (
            "create_hypertable(", "ALTER SYSTEM", "systemctl restart",
            "apt-get install", "DROP TABLE", "TRUNCATE TABLE", "migrate_data => TRUE",
        ):
            self.assertNotIn(unsafe, source)
        self.assertIn("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY", source)


if __name__ == "__main__":
    main()

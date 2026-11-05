"""Offline guard tests for the isolated DEV TimescaleDB shadow-table benchmark."""
from __future__ import annotations

import contextlib
import importlib.util
import io
from datetime import datetime
from pathlib import Path
from unittest import TestCase, main
from unittest.mock import patch
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "ops/rundeck/compare-timescaledb-shadow-dev.py"
SPEC = importlib.util.spec_from_file_location("ts_shadow_poc", SOURCE)
poc = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(poc)


class ShadowPocTests(TestCase):
    def test_bounded_seven_day_window_in_wib(self):
        self.assertEqual(poc.START.isoformat(), "2026-10-26T00:00:00+07:00")
        self.assertEqual(poc.END.isoformat(), "2026-11-02T00:00:00+07:00")
        self.assertEqual(poc.MAX_ROWS, 250_000)
        self.assertEqual(poc.DB, "sphere_rundeck_dev")

    def test_sql_only_retargets_workload_rows(self):
        sql = (
            "SELECT 1 FROM rundeck_workload_observations wo "
            "JOIN rundeck_collections cc ON TRUE "
            "WHERE NOT EXISTS (SELECT 1 FROM rundeck_workload_observations wo "
            "JOIN rundeck_host_metrics hm ON TRUE)"
        )
        replacement = poc.query_variant(sql, poc.TS_SCHEMA)
        self.assertEqual(replacement.count("FROM sphere_ts_poc_ts.rundeck_workload_observations wo"), 2)
        self.assertIn("JOIN rundeck_collections cc", replacement)
        self.assertIn("JOIN rundeck_host_metrics hm", replacement)
        with self.assertRaises(RuntimeError):
            poc.query_variant("FROM rundeck_workload_observations wo", poc.TS_SCHEMA)

    def test_bind_replacement_ignores_postgres_type_casts(self):
        sql = "SELECT :start, :end, :consumer_type, :start::timestamptz, col::integer"
        actual = poc.psycopg_params(sql)
        self.assertIn("%(start)s", actual)
        self.assertIn("%(end)s", actual)
        self.assertIn("%(consumer_type)s", actual)
        self.assertIn("col::integer", actual)
        self.assertIn("%(start)s::timestamptz", actual)

    def test_no_public_table_ddl_or_in_place_migration(self):
        source = SOURCE.read_text()
        for forbidden in (
            "migrate_data => TRUE",
            "DROP TABLE public.",
            "ALTER TABLE public.",
            "TRUNCATE public.",
            "CREATE INDEX ON public.",
            "ALTER SYSTEM",
            "systemctl restart",
            "CREATE EXTENSION",
            "timescaledb-tune",
        ):
            self.assertNotIn(forbidden, source)
        self.assertIn("migrate_data => FALSE", source)
        self.assertIn("MIN_FREE_GIB = 8", source)
        self.assertIn("MIN_REMAINING_GIB = 6", source)
        self.assertIn("EXCEPT ALL", source)
        self.assertIn("CREATE SCHEMA", source)
        self.assertIn("DROP SCHEMA", source)

    def test_create_and_cleanup_require_confirmations(self):
        for argv in (["--mode", "create"],
                     ["--mode", "cleanup", "--confirm-dev"]):
            with self.subTest(argv=argv):
                with self.assertRaises(SystemExit) as error:
                    with contextlib.redirect_stderr(io.StringIO()):
                        poc.main(argv)
                self.assertEqual(error.exception.code, 2)

    def test_read_only_benchmark_requires_preexisting_pair(self):
        self.assertEqual(tuple(poc.SCHEMAS),
                         ("sphere_ts_poc_pg", "sphere_ts_poc_ts"))


if __name__ == "__main__":
    main()

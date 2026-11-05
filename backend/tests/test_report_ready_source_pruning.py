"""READY collection source pruning must preserve legacy identity and WIB windows."""
from __future__ import annotations

import sqlite3
import unittest
from datetime import datetime, timedelta, timezone

from backend import rundeck_evaluation as evaluation


class _Scalar:
    def scalar(self):
        return True


class _Probe:
    def __init__(self):
        self.sql = []

    def execute(self, statement, params=None):
        self.sql.append(str(statement))
        if "to_regclass" in str(statement):
            return _Scalar()
        return iter(())


class ReadySourcePruningTests(unittest.TestCase):
    def test_runtime_aggregates_use_baseline_source_after_measured_regression(self):
        # DEV 2026-11-05: parity passed but weekly current went 8.09s -> 25.18s.
        start = datetime(2026, 9, 30, 17, tzinfo=timezone.utc)
        end = datetime(2026, 10, 31, 17, tzinfo=timezone.utc)
        for aggregate, args in (
            (evaluation._aggregate_window, (start, end, "ALL")),
            (evaluation._historical_baseline, (end, "ALL")),
        ):
            with self.subTest(aggregate=aggregate.__name__):
                probe = _Probe()
                aggregate(probe, *args)
                sql = probe.sql[-1]
                self.assertNotIn("JOIN complete_collections cc_wo", sql)
                self.assertNotIn("JOIN complete_collections cc_tc", sql)
                self.assertIn("JOIN complete_collections cc ON cc.collection_id = tc.collection_id", sql)
                self.assertIn("NOT EXISTS", sql)
                self.assertIn("wo.collected_at = tc.collected_at", sql)

    def test_ready_prefilter_requires_explicit_window(self):
        with self.assertRaises(ValueError):
            evaluation._workload_source_relation(_Probe(), ready_collections_only=True)

    def test_source_row_multiset_parity_overlap_incomplete_and_month_boundary(self):
        # Exercise the *generated* union/anti-join SQL, not a mocked selection.
        # SQLite's JSON ->> operator is compatible here; only ::integer differs.
        con = sqlite3.connect(":memory:")
        con.execute("""CREATE TABLE rundeck_collections (
            collection_id TEXT PRIMARY KEY, status TEXT,
            expected_host_count INTEGER, received_host_count INTEGER,
            finished_at TEXT, started_at TEXT
        )""")
        for table in ("rundeck_workload_observations", "rundeck_top_consumers"):
            con.execute(f"""CREATE TABLE {table} (
                collection_id TEXT, collected_at TEXT, host TEXT,
                consumer_type TEXT, consumer_key TEXT,
                rank INTEGER, cpu_pct REAL, ram_pct REAL, details TEXT
            )""")
        rows = [
            ("ready", "READY", 5, 5, "2026-10-15T10:00:00+00:00", None),
            ("incomplete", "READY", 5, 4, "2026-10-15T10:00:00+00:00", None),
            ("boundary", "READY", 5, 5, "2026-10-31T17:00:00+00:00", None),
            ("last-second", "READY", 5, 5, "2026-10-31T16:59:59+00:00", None),
            ("started-only", "READY", 5, 5, None, "2026-10-11T10:00:00+00:00"),
        ]
        con.executemany("INSERT INTO rundeck_collections VALUES (?,?,?,?,?,?)", rows)

        def put(table, cid, at, typ, key):
            con.execute(f"INSERT INTO {table} VALUES (?,?,?,?,?,?,?,?,?)",
                        (cid, at, "APP1", typ, key, 1, 42.0, 50.0, "{}"))

        at = "2026-10-15T10:00:00+00:00"
        put("rundeck_workload_observations", "ready", at, "JOB", "overlap")
        put("rundeck_top_consumers", "ready", at, "JOB", "overlap")
        put("rundeck_top_consumers", "ready", at, "JOB", "legacy-only")
        put("rundeck_top_consumers", "incomplete", at, "JOB", "not-ready")
        put("rundeck_top_consumers", "boundary", "2026-10-31T17:00:00+00:00", "JOB", "november")
        put("rundeck_top_consumers", "last-second", "2026-10-31T16:59:59+00:00", "PROGRAM", "october")
        put("rundeck_top_consumers", "started-only", at, "JOB", "started")
        put("rundeck_workload_observations", "ready", at, "PROCESS", "do-not-report")

        params = {
            "start": "2026-09-30T17:00:00+00:00",
            "end": "2026-10-31T17:00:00+00:00",
        }
        def run(ready):
            source, scope = evaluation._workload_source_relation(
                _Probe(), window=("start", "end"), job_program_only=True,
                ready_collections_only=ready,
            )
            self.assertEqual(scope, "ALL_OBSERVED_ACTIVE_WORKLOADS")
            source = source.replace("::integer", "")
            sql = f"""WITH complete_collections AS (
                SELECT collection_id FROM rundeck_collections c
                WHERE c.status = 'READY'
                  AND c.expected_host_count > 0
                  AND c.received_host_count >= c.expected_host_count
                  AND COALESCE(c.finished_at, c.started_at) >= :start
                  AND COALESCE(c.finished_at, c.started_at) < :end
            )
            SELECT tc.collection_id, tc.host, tc.consumer_type,
                   tc.consumer_key, tc.collected_at
            FROM {source} tc
            JOIN complete_collections cc ON cc.collection_id = tc.collection_id
            WHERE tc.collected_at >= :start AND tc.collected_at < :end
              AND tc.consumer_type IN ('JOB', 'PROGRAM')
            ORDER BY tc.collection_id, tc.host, tc.consumer_type, tc.consumer_key
            """
            return list(con.execute(sql, params))

        before, after = run(False), run(True)
        self.assertEqual(before, after)
        self.assertEqual([(row[0], row[3]) for row in after], [
            ("last-second", "october"),
            ("ready", "legacy-only"),
            ("ready", "overlap"),
            ("started-only", "started"),
        ])
        con.close()


if __name__ == "__main__":
    unittest.main()

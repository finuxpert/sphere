import unittest
from unittest.mock import patch

from backend.rundeck_workload_observations import parse_workload_observations


class WorkloadObservationsV1241Tests(unittest.TestCase):
    @patch("backend.rundeck_workload_observations.parse_top_consumers")
    def test_retains_all_job_program_rows_and_drops_process(self, parser):
        parser.return_value = [
            {
                "host": "AOPH1PAPPDC",
                "collected_at": "2026-09-15T03:00:00+00:00",
                "consumer_type": "JOB",
                "consumer_key": "Z_BACKGROUND_LIGHT_JOB",
                "rank": 47,
                "cpu_pct": 0.7,
                "ram_pct": 0.1,
                "details": {"process_count": 1, "persisted_rank_limit": 1000000},
            },
            {
                "host": "AOPH1PAPPDC",
                "collected_at": "2026-09-15T03:00:00+00:00",
                "consumer_type": "PROGRAM",
                "consumer_key": "Z_LIGHT_REPORT",
                "rank": 48,
                "cpu_pct": 0.4,
                "ram_pct": 0.1,
                "details": {"process_count": 1, "persisted_rank_limit": 1000000},
            },
            {
                "host": "AOPH1PAPPDC",
                "collected_at": "2026-09-15T03:00:00+00:00",
                "consumer_type": "PROCESS",
                "consumer_key": "PID 123",
                "rank": 49,
                "cpu_pct": 0.2,
                "ram_pct": 0.1,
                "details": {},
            },
        ]

        rows = parse_workload_observations(b"fixture")

        self.assertEqual([row["consumer_type"] for row in rows], ["JOB", "PROGRAM"])
        self.assertEqual(rows[0]["consumer_key"], "Z_BACKGROUND_LIGHT_JOB")
        self.assertEqual(rows[0]["details"]["performance_rank"], 47)
        self.assertEqual(rows[0]["details"]["observation_scope"], "ALL_OBSERVED_ACTIVE_WORKLOADS")
        self.assertNotIn("persisted_rank_limit", rows[0]["details"])
        parser.assert_called_once_with(b"fixture", fallback_time=None, top_per_host=1_000_000)


if __name__ == "__main__":
    unittest.main()

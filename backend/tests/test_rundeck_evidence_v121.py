import unittest
from datetime import datetime, timedelta, timezone

from backend.rundeck_evidence import availability_transition_events, source_alignment


class EvidenceCorrelationTests(unittest.TestCase):
    def test_source_alignment_marks_close_sources_aligned(self):
        base = datetime(2026, 9, 13, 12, 0, tzinfo=timezone.utc)
        result = source_alignment({
            "Performance": base,
            "Workload": base - timedelta(minutes=4),
            "Availability": base - timedelta(minutes=11),
        }, max_skew_minutes=20)
        self.assertEqual(result["state"], "ALIGNED")
        self.assertEqual(result["max_skew_minutes"], 11.0)

    def test_source_alignment_marks_wide_skew_limited(self):
        base = datetime(2026, 9, 13, 12, 0, tzinfo=timezone.utc)
        result = source_alignment({
            "Performance": base,
            "Availability": base - timedelta(minutes=42),
        }, max_skew_minutes=20)
        self.assertEqual(result["state"], "LIMITED")
        self.assertEqual(result["max_skew_minutes"], 42.0)

    def test_availability_history_distinguishes_first_down_from_transition(self):
        snapshots = [
            {
                "execution_id": "1",
                "collected_at": "2026-09-13T10:00:00+00:00",
                "services": [
                    {"category": "HANA_SYSTEM_DB", "name": "PRIMARY", "status": "UP"},
                    {"category": "HANA_REPLICATION", "name": "PRIMARY", "status": "DOWN"},
                ],
            },
            {
                "execution_id": "2",
                "collected_at": "2026-09-13T10:30:00+00:00",
                "services": [
                    {"category": "HANA_SYSTEM_DB", "name": "PRIMARY", "status": "DOWN"},
                    {"category": "HANA_REPLICATION", "name": "PRIMARY", "status": "DOWN"},
                ],
            },
        ]
        events = availability_transition_events(snapshots)
        observed = [row for row in events if row["kind"] == "availability-observed-down"]
        changed = [row for row in events if row["kind"] == "availability-transition"]
        self.assertEqual(len(observed), 1)
        self.assertIn("earlier state is unknown", observed[0]["detail"])
        self.assertEqual(len(changed), 1)
        self.assertIn("UP → DOWN", changed[0]["title"])


if __name__ == "__main__":
    unittest.main()

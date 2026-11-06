"""Regression: a full week's positive checks cannot hide boundary gaps."""
import unittest
from datetime import datetime, timedelta, timezone
from backend.rundeck_availability import availability_observation_profile

UTC = timezone.utc


class HistoricalAvailabilityCoverageTests(unittest.TestCase):
    def test_realistic_sparse_week_flags_both_boundaries_and_correct_cadence(self):
        # Exact audit geometry: 192 checks, median interval 30 min,
        # max internal interval 6 h, 7 h leading and 32 h trailing gaps.
        start = datetime(2026, 10, 25, 17, tzinfo=UTC)
        end = datetime(2026, 11, 1, 17, tzinfo=UTC)
        first = start + timedelta(hours=7)
        deltas = ([timedelta(minutes=30)] * 134 +
                  [timedelta(hours=1)] * 56 +
                  [timedelta(hours=6)])
        stamps = [first]
        for delta in deltas:
            stamps.append(stamps[-1] + delta)
        self.assertEqual(len(stamps), 192)
        self.assertEqual(stamps[-1], datetime(2026, 10, 31, 9, tzinfo=UTC))
        snapshots = [
            {"collected_at": stamp.isoformat(), "execution_id": str(i),
             "services": [{"category": "SAP_APP", "name": "APP1", "status": "UP"}]}
            for i, stamp in enumerate(stamps)
        ]
        result = availability_observation_profile(
            snapshots, requested_since=start, requested_until=end,
            cadence_snapshots=snapshots
        )
        self.assertEqual(result["expected_cadence_seconds"], 1800)
        self.assertEqual(max(int(d.total_seconds()) for d in deltas), 21600)
        self.assertTrue(any(gap.get("boundary") is None
                            for gap in result["observation_gaps"]))
        self.assertTrue(result["coverage_limited"])
        boundaries = {row["boundary"]: row for row in result["observation_gaps"]
                      if row.get("boundary")}
        self.assertEqual(set(boundaries), {"START", "END"})
        self.assertEqual(result["leading_unobserved_seconds"], 7 * 3600)
        self.assertGreater(result["trailing_unobserved_seconds"], 31 * 3600)
        self.assertTrue(all(row["kind"] == "NO_OBSERVATION" for row in boundaries.values()))

    def test_full_coverage_close_to_boundaries_is_not_limited(self):
        start = datetime(2026, 10, 25, 17, tzinfo=UTC)
        end = start + timedelta(hours=2)
        samples = [
            {"collected_at": (start + timedelta(minutes=5 + i * 10)).isoformat()}
            for i in range(12)
        ]
        profile = availability_observation_profile(
            samples, requested_since=start, requested_until=end,
            cadence_snapshots=samples
        )
        self.assertEqual(profile["expected_cadence_seconds"], 600)
        self.assertFalse(profile["coverage_limited"])
        self.assertEqual(profile["observation_gaps"], [])

    def test_no_history_is_unknown_and_limited(self):
        start = datetime(2026, 10, 25, 17, tzinfo=UTC)
        profile = availability_observation_profile(
            [], requested_since=start, requested_until=start + timedelta(days=7)
        )
        self.assertTrue(profile["coverage_limited"])
        self.assertIsNone(profile["history_started_at"])
        self.assertIsNone(profile["leading_unobserved_seconds"])
        self.assertEqual(profile["observation_gaps"], [])

    def test_internal_gap_is_no_observation_not_sap_down(self):
        start = datetime(2026, 10, 25, 17, tzinfo=UTC)
        stamps = [start + timedelta(minutes=n) for n in (5, 15, 25, 95, 105, 115)]
        items = [{"collected_at": stamp.isoformat()} for stamp in stamps]
        profile = availability_observation_profile(
            items, requested_since=start, requested_until=start + timedelta(hours=2),
            cadence_snapshots=items
        )
        self.assertTrue(profile["coverage_limited"])
        self.assertEqual(
            len([r for r in profile["observation_gaps"] if not r.get("boundary")]), 1
        )
        self.assertFalse(any(r.get("status") == "DOWN" for r in profile["observation_gaps"]))


if __name__ == "__main__":
    unittest.main()

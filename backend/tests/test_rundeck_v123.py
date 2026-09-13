import unittest

from backend.rundeck_availability import availability_change_events, summarize_services


class AvailabilitySemanticsV123Tests(unittest.TestCase):
    def test_dr_replication_down_is_not_primary_service_down(self):
        services = [
            {"category": "SAP_APP", "name": "APP1", "status": "UP"},
            {"category": "SAP_APP", "name": "APP2", "status": "UP"},
            {"category": "HANA_SYSTEM_DB", "name": "PRIMARY", "status": "UP"},
            {"category": "HANA_SYSTEM_DB", "name": "SECONDARY", "status": "UP"},
            {"category": "HANA_SYSTEM_DB", "name": "DR", "status": "UP"},
            {"category": "HANA_REPLICATION", "name": "PRIMARY", "status": "UP"},
            {"category": "HANA_REPLICATION", "name": "SECONDARY", "status": "UP"},
            {"category": "HANA_REPLICATION", "name": "DR", "status": "DOWN"},
            {"category": "WEB_DISPATCHER", "name": "HTTP", "status": "UP"},
            {"category": "WEB_DISPATCHER", "name": "HTTPS", "status": "UP"},
        ]
        summary = summarize_services(services)
        self.assertEqual(summary["service_state"], "ATTENTION")
        self.assertEqual(summary["service_down_count"], 0)
        self.assertEqual(summary["technical_down_count"], 1)
        self.assertEqual(summary["issue_text"], "Dr replication DOWN")
        self.assertEqual(summary["replication"]["DR"], "DOWN")

    def test_app_down_remains_critical(self):
        services = [
            {"category": "SAP_APP", "name": "APP1", "status": "UP"},
            {"category": "SAP_APP", "name": "APP3", "status": "DOWN"},
        ]
        summary = summarize_services(services)
        self.assertEqual(summary["service_state"], "CRITICAL")
        self.assertEqual(summary["sap_state"], "CRITICAL")
        self.assertEqual(summary["sap_app_down"], ["APP3"])

    def test_transition_history_keeps_observed_down_distinct_from_transition(self):
        snapshots = [
            {
                "execution_id": "1",
                "collected_at": "2026-09-13T15:00:00+00:00",
                "services": [{"category": "HANA_REPLICATION", "name": "DR", "status": "DOWN"}],
            },
            {
                "execution_id": "2",
                "collected_at": "2026-09-13T15:10:00+00:00",
                "services": [{"category": "HANA_REPLICATION", "name": "DR", "status": "UP"}],
            },
            {
                "execution_id": "3",
                "collected_at": "2026-09-13T15:20:00+00:00",
                "services": [{"category": "HANA_REPLICATION", "name": "DR", "status": "DOWN"}],
            },
        ]
        events = availability_change_events(snapshots, category="HANA_REPLICATION")
        self.assertEqual([item["kind"] for item in events], ["observed-down", "transition", "transition"])
        self.assertEqual(events[1]["from"], "DOWN")
        self.assertEqual(events[1]["to"], "UP")
        self.assertEqual(events[2]["from"], "UP")
        self.assertEqual(events[2]["to"], "DOWN")


if __name__ == "__main__":
    unittest.main()

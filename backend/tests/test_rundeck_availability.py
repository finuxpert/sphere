import unittest

from backend.rundeck_availability import parse_availability_report, summarize_services


SAMPLE = """
====== Service Availability Report - SAP App & HANA DB ======
AOPH1PAPPDC.aop.oto:3230    Dispatcher Instance 1 for SAP Application Server    ✅ UP
AOPH2PAPPDC.aop.oto:3240    Dispatcher Instance 2 for SAP Application Server    ✅ UP
AOPH3PAPPDC.aop.oto:3250    Dispatcher Instance 3 for SAP Application Server    ✅ UP
AOPH4PAPPDC.aop.oto:3260    Dispatcher Instance 4 for SAP Application Server    ✅ UP
AOPH5PAPPDC.aop.oto:3270    Dispatcher Instance 5 for SAP Application Server    ❌ DOWN
10.14.251.246:80            HTTP Access to SAP Fiori/Web Dispatcher              ✅ UP
10.14.251.246:443           HTTPS Secure Access to SAP Fiori/Web Dispatcher      ✅ UP
10.14.55.26:30001           Primary HANA System DB Port                          ❌ DOWN
10.14.55.27:30001           Secondary HANA System DB Port                        ✅ UP
10.14.90.240:30001          Disaster Recovery HANA System DB Port                ✅ UP
10.14.55.26:30040           Primary Node Replication Internal Port               ❌ DOWN
10.14.55.27:30040           Secondary Node Replication Internal Port             ✅ UP
10.14.90.240:30040          DR Node Replication Internal Port                    ✅ UP
AOPH5PAPPDC.aop.oto:22      SSH Port for SAP App Dispatcher 5                    ✅ UP
"""


class AvailabilityParserTests(unittest.TestCase):
    def test_parses_app_and_hana_availability(self):
        rows = parse_availability_report(SAMPLE)
        apps = {row["name"]: row["status"] for row in rows if row["category"] == "SAP_APP"}
        hana = {row["name"]: row["status"] for row in rows if row["category"] == "HANA_SYSTEM_DB"}
        self.assertEqual(apps["APP1"], "UP")
        self.assertEqual(apps["APP5"], "DOWN")
        self.assertEqual(hana["PRIMARY"], "DOWN")
        self.assertEqual(hana["SECONDARY"], "UP")
        self.assertEqual(hana["DR"], "UP")

    def test_ssh_does_not_override_sap_app_status(self):
        rows = parse_availability_report(SAMPLE)
        app5 = [row for row in rows if row["category"] == "SAP_APP" and row["name"] == "APP5"]
        ssh5 = [row for row in rows if row["category"] == "SSH" and row["name"] == "APP5"]
        self.assertEqual(app5[0]["status"], "DOWN")
        self.assertEqual(ssh5[0]["status"], "UP")

    def test_app_down_is_critical(self):
        summary = summarize_services(parse_availability_report(SAMPLE))
        self.assertEqual(summary["service_state"], "CRITICAL")
        self.assertEqual(summary["sap_state"], "CRITICAL")

    def test_supporting_service_down_is_attention_when_apps_are_up(self):
        rows = parse_availability_report(SAMPLE)
        for row in rows:
            if row["category"] == "SAP_APP":
                row["status"] = "UP"
        summary = summarize_services(rows)
        self.assertEqual(summary["sap_state"], "NORMAL")
        self.assertEqual(summary["service_state"], "ATTENTION")


if __name__ == "__main__":
    unittest.main()

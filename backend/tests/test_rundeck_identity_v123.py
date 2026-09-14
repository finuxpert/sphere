import unittest

from backend.rundeck_consumers import parse_top_consumers


class WorkloadIdentityV123Tests(unittest.TestCase):
    def test_optional_identity_fields_are_retained_when_collector_provides_them(self):
        raw = b"""## RCA-SNAPSHOT-V2.2-BEGIN
hostname\tAPP3
snapshot_id\tapp3-1
snapshot_ts\t2026-09-13T16:00:00Z
## RCA-SNAPSHOT-V2.2-END
## RCA-WP-V2.2-BEGIN
snapshot_id\thost\tjob_name\tprogram\tpid\twp\ttype\tuser\tclient\ttcode\treport\tcpu_interval_pct\tpmem_pct\tpss_gb\trss_gb\tread_mib_s\twrite_mib_s
app3-1\tAPP3\tZJOB_TEST\tZPROGRAM_TEST\t12345\t82\tBTC\tSAPBATCH\t100\tSM37\tZREPORT_TEST\t25.5\t1.2\t0.5\t0.6\t0\t0
## RCA-WP-V2.2-END
"""
        rows = parse_top_consumers(raw, top_per_host=10)
        self.assertEqual(len(rows), 1)
        details = rows[0]["details"]
        self.assertEqual(details["client"], "100")
        self.assertEqual(details["transaction"], "SM37")
        self.assertEqual(details["report"], "ZREPORT_TEST")
        self.assertEqual(details["user"], "SAPBATCH")
        self.assertEqual(details["pid"], "12345")
        self.assertEqual(details["wp_type"], "BTC")
        self.assertEqual(details["wp"], "82")


if __name__ == "__main__":
    unittest.main()

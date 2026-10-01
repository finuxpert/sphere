import unittest

from backend.rundeck_consumers import parse_top_consumers


V22 = """## RCA-SNAPSHOT-V2.2-BEGIN
snapshot_id\tAOPH1PAPPDC-1
snapshot_ts\t2026-10-01T14:00:00+07:00
hostname\tAOPH1PAPPDC
## RCA-SNAPSHOT-V2.2-END
## RCA-WP-V2.2-BEGIN
snapshot_id\tsnapshot_ts\thost\tpid\tsid\tinst\twp\ttype\ttype_source\tcpu_interval_pct\tpmem_pct\trss_gb\trss_flag\tpss_gb\tprivate_gb\tshared_gb\tstate\twchan\twp_uptime_sec\tcpu_class\tread_mib_s\twrite_mib_s\tproc_sample_ts\tproc_sample_delta_sec\trabax_tail_count\tsxpg_tail_count\tjobstart_tail_count\trxmsg_tail_count\tprogram\tprogram_source\terror_code\terror_program\tjob_name\tlatest_error_ts\tlatest_error_epoch\tlatest_error_age_sec\terror_recency\tlog_path
AOPH1PAPPDC-1\t2026-10-01T14:00:00+07:00\tAOPH1PAPPDC\t100\tAOP\t30\t60\tBTC\tSAPCONTROL\t55.0\t1.0\t1.2\tNORMAL\t0.6\t0.4\t0.8\tR\tpoll\t100\tWARN\t0\t0\t2026-10-01T14:00:02+07:00\t2\t14\t3\t1\t14\tZREPORT_A\tTRACE\tTIME_OUT\tZREPORT_A\tZJOB_A\t2026-10-01T14:00:01+07:00\t1\t1\tAT_SNAPSHOT\t/usr/sap/AOP/D30/work/dev_w60
AOPH1PAPPDC-1\t2026-10-01T14:00:00+07:00\tAOPH1PAPPDC\t101\tAOP\t30\t61\tBTC\tSAPCONTROL\t20.0\t1.0\t1.1\tNORMAL\t0.5\t0.3\t0.8\tS\tpoll\t200\tOK\t0\t0\t2026-10-01T14:00:02+07:00\t2\t7\t0\t0\t7\tZREPORT_B\tTRACE\tDBSQL_SQL_DEADLOCK_DET\tZREPORT_B\tZJOB_A\t2026-09-30T10:00:00+07:00\t1\t10000\tHISTORICAL\t/usr/sap/AOP/D30/work/dev_w61
## RCA-WP-V2.2-END
"""


class RundeckConsumerSignalTests(unittest.TestCase):
    def test_retains_per_wp_signals_without_promoting_historical_error(self):
        rows = parse_top_consumers(V22.encode(), top_per_host=100)
        self.assertEqual(len(rows), 1)
        details = rows[0]["details"]
        self.assertEqual(details["process_count"], 2)
        self.assertEqual(len(details["wp_signals"]), 2)

        current = next(item for item in details["wp_signals"] if item["pid"] == "100")
        historical = next(item for item in details["wp_signals"] if item["pid"] == "101")

        self.assertEqual(current["error_at_snapshot"], "TIME_OUT")
        self.assertEqual(current["latest_trace_error"], "TIME_OUT")
        self.assertEqual(current["error_recency"], "AT_SNAPSHOT")
        self.assertEqual(current["rabax"], 14.0)
        self.assertEqual(current["rxmsg"], 14.0)

        self.assertEqual(historical["error_at_snapshot"], "")
        self.assertEqual(historical["latest_trace_error"], "DBSQL_SQL_DEADLOCK_DET")
        self.assertEqual(historical["error_recency"], "HISTORICAL")
        self.assertIn("not an SM37 job status", details["wp_signal_semantics"])


if __name__ == "__main__":
    unittest.main()

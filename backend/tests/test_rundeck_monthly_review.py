"""Calendar-month boundaries for SPHERE manual SAP Basis performance reports."""
from datetime import datetime, timezone
import unittest

from backend.rundeck_evaluation import calendar_month_bounds, _evaluation_page, _monthly_abap_tuning_candidates
from backend.rundeck_monthly_pressure import detect_pressure_episodes, monthly_pressure_observations
from backend.rundeck_monthly_errors import summarize_monthly_wp_errors, classify_error, parse_explicit_error_time


class CalendarMonthReviewTests(unittest.TestCase):
    def test_full_september_window_is_wib_calendar_month(self):
        start, end, previous = calendar_month_bounds(
            "2026-09", now=datetime(2026, 10, 21, 3, 0, tzinfo=timezone.utc)
        )
        self.assertEqual(start, datetime(2026, 8, 31, 17, 0, tzinfo=timezone.utc))
        self.assertEqual(end, datetime(2026, 9, 30, 17, 0, tzinfo=timezone.utc))
        self.assertEqual(previous, datetime(2026, 7, 31, 17, 0, tzinfo=timezone.utc))

    def test_ongoing_month_is_capped_by_now_without_future_samples(self):
        now = datetime(2026, 10, 21, 3, 0, tzinfo=timezone.utc)
        start, end, previous = calendar_month_bounds("2026-10", now=now)
        self.assertEqual(start, datetime(2026, 9, 30, 17, 0, tzinfo=timezone.utc))
        self.assertEqual(end, now)
        self.assertEqual(previous, datetime(2026, 8, 31, 17, 0, tzinfo=timezone.utc))

    def test_month_boundary_at_new_year(self):
        start, end, previous = calendar_month_bounds(
            "2026-01", now=datetime(2026, 2, 2, tzinfo=timezone.utc)
        )
        self.assertEqual(start, datetime(2025, 12, 31, 17, 0, tzinfo=timezone.utc))
        self.assertEqual(end, datetime(2026, 1, 31, 17, 0, tzinfo=timezone.utc))
        self.assertEqual(previous, datetime(2025, 11, 30, 17, 0, tzinfo=timezone.utc))

    def test_invalid_and_future_months_are_rejected(self):
        now = datetime(2026, 10, 21, tzinfo=timezone.utc)
        for month in ("2026-00", "2026-13", "2026-1", "foo", "", "2030-01"):
            with self.subTest(month=month):
                with self.assertRaises(ValueError):
                    calendar_month_bounds(month, now=now)


    def test_pressure_episodes_split_on_normal_and_collector_gap(self):
        host = "app3"
        def row(minute, cpu, ram=50, name=host):
            return {
                "host": name,
                "collected_at": datetime(2026, 9, 1, 0, minute, tzinfo=timezone.utc),
                "cpu_pct": cpu, "ram_pct": ram,
            }
        samples = [
            row(0, 79), row(10, 91), row(20, 42),
            row(30, 85), row(40, 83), row(50, 83, name="app1"),
        ]
        episodes = detect_pressure_episodes(samples, "cpu_pct", 75)
        self.assertEqual(len(episodes), 3)
        app3 = [item for item in episodes if item["host"] == host]
        self.assertEqual(len(app3), 2)
        self.assertEqual([item["observed_host_checks"] for item in app3], [2, 2])
        self.assertEqual(max(item["peak_pct"] for item in app3), 91.0)

    def test_pressure_episode_missing_samples_do_not_merge(self):
        host = "APP2"
        samples = [
            {"host": host, "collected_at": datetime(2026, 9, 1, 0, 0, tzinfo=timezone.utc), "ram_pct": 95},
            {"host": host, "collected_at": datetime(2026, 9, 1, 4, 0, tzinfo=timezone.utc), "ram_pct": 91},
        ]
        episodes = detect_pressure_episodes(samples, "ram_pct", 80)
        self.assertEqual(len(episodes), 2)
        self.assertEqual([row["observed_host_checks"] for row in episodes], [1, 1])

    def test_monthly_high_cpu_memory_and_recurring_signal_filters(self):
        report = {
            "items": [
                {"consumer_type": "PROGRAM", "consumer_key": "CPU", "signals": {"cpu_spike": True}},
                {"consumer_type": "PROGRAM", "consumer_key": "MEM", "signals": {"high_memory": True}},
                {"consumer_type": "JOB", "consumer_key": "REPEAT", "signals": {"recurring": True}},
                {"consumer_type": "PROGRAM", "consumer_key": "UNFLAGGED", "signals": {}},
            ],
            "summary": {"workloads": 4},
        }
        for flag, expected in [("HIGH_CPU", "CPU"), ("HIGH_MEMORY", "MEM"), ("RECURRING", "REPEAT")]:
            result = _evaluation_page(report, limit=1, offset=0, query="", health="ALL", flag=flag)
            self.assertEqual(result["page"]["total"], 1)
            self.assertEqual(result["items"][0]["consumer_key"], expected)
        self.assertEqual(report["summary"]["workloads"], 4)

    def test_monthly_pressure_filter_applies_before_server_pagination(self):
        def workload(key, cpu=0, ram=0):
            return {
                "consumer_type": "PROGRAM", "consumer_key": key,
                "pressure_overlap": {
                    "cpu_pressure_host_checks": cpu,
                    "ram_pressure_host_checks": ram,
                    "wp_host_checks": 0,
                },
            }
        report = {
            "items": [workload("ZCPU_A", cpu=2), workload("ZNO"), workload("ZRAM", ram=8), workload("ZCPU_B", cpu=3)],
            "summary": {"workloads": 4},
        }
        page1 = _evaluation_page(report, limit=1, offset=0, query="", health="ALL", pressure="CPU")
        page2 = _evaluation_page(report, limit=1, offset=1, query="", health="ALL", pressure="CPU")
        self.assertEqual(page1["page"]["total"], 2)
        self.assertEqual(page1["items"][0]["consumer_key"], "ZCPU_A")
        self.assertEqual(page2["items"][0]["consumer_key"], "ZCPU_B")
        self.assertEqual(page2["summary"]["workloads"], 4)
        self.assertEqual(_evaluation_page(report, limit=10, offset=0, query="", health="ALL", pressure="RAM")["page"]["total"], 1)


    def test_error_code_category_and_timezone_requirements(self):
        self.assertEqual(classify_error("TSV_TNEW_PAGE_ALLOC_FAILED")[0], "MEMORY")
        self.assertEqual(classify_error("DBSQL_SQL_DEADLOCK")[0], "LOCK")
        self.assertEqual(classify_error("TIME_OUT")[0], "RUNTIME")
        self.assertIsNone(parse_explicit_error_time("2026-09-12 03:00:00"))
        self.assertIsNone(parse_explicit_error_time("bad time"))
        self.assertEqual(parse_explicit_error_time("2026-09-12T03:00:00+07:00"),
                         datetime(2026, 9, 11, 20, 0, tzinfo=timezone.utc))

    def test_monthly_error_program_counts_require_explicit_trace_identity(self):
        start = datetime(2026, 8, 31, 17, tzinfo=timezone.utc)
        end = datetime(2026, 9, 30, 17, tzinfo=timezone.utc)
        rows = [
            {
                "host": "APP1", "pid": "120", "collection_id": "a",
                "consumer_key": "Z_CONTEXT", "error_program": "Z_FAILED",
                "latest_trace_error": "TIME_OUT",
                "latest_error_ts": "2026-09-13T02:00:00+00:00",
                "rabax": 1,
            },
            {
                "host": "APP1", "pid": "120", "collection_id": "b",
                "consumer_key": "Z_CONTEXT", "error_program": "Z_FAILED",
                "latest_trace_error": "TIME_OUT",
                "latest_error_ts": "2026-09-13T02:00:00+00:00",
                "rabax": 2,
            },
            {
                "host": "APP2", "pid": "222", "collection_id": "c",
                "consumer_key": "Z_ONLY_CONTEXT",
                "latest_trace_error": "DBSQL_SQL_ERROR", "rabax": 1,
            },
        ]
        result = summarize_monthly_wp_errors(rows, start, end)
        self.assertEqual(result["timestamped_events"], 1)
        self.assertEqual(result["error_program_count"], 1)
        self.assertEqual(result["dated_error_program_count"], 1)
        self.assertEqual(result["error_code_count"], 2)
        self.assertEqual(result["rabax_program_count"], 1)
        self.assertEqual(result["rabax_wp_checks"], 3)
        self.assertEqual(result["rxmsg_wp_checks"], 0)

    def test_repeated_trace_is_one_error_not_multiple_collector_events(self):
        start = datetime(2026, 8, 31, 17, tzinfo=timezone.utc)
        end = datetime(2026, 9, 30, 17, tzinfo=timezone.utc)
        base = {
            "host": "APP1", "pid": "1234", "consumer_key": "Z_REPORT",
            "error_program": "Z_REPORT", "latest_trace_error": "TIME_OUT",
            "latest_error_ts": "2026-09-13T08:00:00+07:00", "collection_checks": 1,
        }
        rows = [{**base, "collection_id": "run-1"}, {**base, "collection_id": "run-2"}]
        result = summarize_monthly_wp_errors(rows, start, end)
        self.assertEqual(result["timestamped_events"], 1)
        self.assertEqual(result["top_errors"][0]["event_count"], 1)
        self.assertEqual(result["top_errors"][0]["program"], "Z_REPORT")
        self.assertEqual(result["status"], "TIMESTAMPED_TRACE")

    def test_old_trace_and_untimed_snapshot_are_not_new_monthly_errors(self):
        start = datetime(2026, 8, 31, 17, tzinfo=timezone.utc)
        end = datetime(2026, 9, 30, 17, tzinfo=timezone.utc)
        rows = [
            {"host": "APP3", "pid": "21", "consumer_key": "Z_WORK",
             "latest_trace_error": "DBSQL_SQL_ERROR",
             "latest_error_ts": "2026-08-25T10:30:00+07:00", "collection_id": "a"},
            {"host": "APP3", "pid": "22", "consumer_key": "Z_WORK",
             "error_at_snapshot": "TIME_OUT",
             "latest_error_ts": "", "collection_id": "b"},
        ]
        result = summarize_monthly_wp_errors(rows, start, end)
        self.assertEqual(result["timestamped_events"], 0)
        self.assertEqual(result["snapshot_host_checks"], 1)
        self.assertEqual(result["top_errors"][0]["event_count"], 0)
        self.assertEqual(result["top_errors"][0]["program"], "Belum teridentifikasi")
        self.assertEqual(result["status"], "SNAPSHOT_ONLY")
        self.assertEqual(summarize_monthly_wp_errors([], start, end)["status"], "NO_RETAINED_ERROR_EVIDENCE")

    def test_error_groups_flagged_truncated_never_claim_complete(self):
        start = datetime(2026, 8, 31, 17, tzinfo=timezone.utc)
        end = datetime(2026, 9, 30, 17, tzinfo=timezone.utc)
        result = summarize_monthly_wp_errors([], start, end, truncated=True)
        self.assertTrue(result["truncated"])
        self.assertEqual(result["status"], "TRUNCATED")



    def test_untimed_trace_is_visible_without_inventing_error_event(self):
        start = datetime(2026, 8, 31, 17, tzinfo=timezone.utc)
        end = datetime(2026, 9, 30, 17, tzinfo=timezone.utc)
        result = summarize_monthly_wp_errors([{
            "host": "APP1", "pid": "111", "collection_id": "run1",
            "latest_trace_error": "TIME_OUT", "consumer_key": "Z_TEST"
        }], start, end)
        self.assertEqual(result["status"], "UNTIMED_TRACE_ONLY")
        self.assertEqual(result["timestamped_events"], 0)
        self.assertEqual(result["top_errors"][0]["untimed_trace_checks"], 1)

    def test_mismatched_snapshot_code_must_not_borrow_trace_timestamp(self):
        start = datetime(2026, 8, 31, 17, tzinfo=timezone.utc)
        end = datetime(2026, 9, 30, 17, tzinfo=timezone.utc)
        result = summarize_monthly_wp_errors([{
            "host": "APP1", "pid": "111", "collection_id": "run1",
            "error_at_snapshot": "TIME_OUT",
            "latest_trace_error": "DBSQL_SQL_ERROR",
            "latest_error_ts": "2026-09-12T08:00:00+07:00",
            "consumer_key": "Z_TEST"
        }], start, end)
        self.assertEqual(result["timestamped_events"], 1)
        self.assertEqual(result["snapshot_host_checks"], 1)
        self.assertEqual({row["error_code"] for row in result["top_errors"]},
                         {"TIME_OUT", "DBSQL_SQL_ERROR"})




    def test_abap_candidates_do_not_invent_error_evidence(self):
        rows = [
            {"consumer_type": "JOB", "consumer_key": "Z_BATCH_A",
             "status": "REVIEW REQUIRED", "occurrences": 20, "hosts": ["APP1"],
             "avg_cpu_pct": 125.4, "peak_cpu_pct": 270.0,
             "avg_pss_gb": 1.2, "peak_pss_gb": 3.8, "overall_confidence": "MEDIUM",
             "signals": {"sustained_high_cpu": True},
             "pressure_overlap": {"cpu_pressure_host_checks": 2,
                                  "cpu_pressure_hosts": ["APP1"]}},
            {"consumer_type": "PROGRAM", "consumer_key": "Z_REPORT_B",
             "status": "REVIEW REQUIRED", "occurrences": 5,
             "signals": {"high_memory": True}},
            {"consumer_type": "PROGRAM", "consumer_key": "Z_OK",
             "status": "NORMAL", "occurrences": 10},
        ]
        results = _monthly_abap_tuning_candidates(rows)
        self.assertEqual([row["consumer_key"] for row in results],
                         ["Z_BATCH_A", "Z_REPORT_B"])
        self.assertEqual(results[0]["cpu_pressure_hosts"], ["APP1"])
        self.assertEqual(results[0]["error_attribution"], "NOT_ESTABLISHED")
        self.assertEqual(results[0]["avg_cpu_pct"], 125.4)
        self.assertEqual(results[1]["error_attribution"], "NOT_ESTABLISHED")
        self.assertEqual(len(_monthly_abap_tuning_candidates(rows, limit=1)), 1)

    def test_monthly_type_filter_does_not_change_official_summary(self):
        report = {
            "period": "month", "type": "ALL",
            "summary": {"workloads": 3, "review_required": 2},
            "items": [
                {"consumer_type": "JOB", "consumer_key": "JOB1"},
                {"consumer_type": "PROGRAM", "consumer_key": "ABAP1"},
                {"consumer_type": "PROGRAM", "consumer_key": "ABAP2"},
            ],
        }
        job_page = _evaluation_page(report, limit=25, offset=0, query="",
                                    health="ALL", consumer_type="JOB")
        self.assertEqual(job_page["type"], "JOB")
        self.assertEqual(job_page["page"]["total"], 1)
        self.assertEqual(job_page["summary"]["workloads"], 3)
        self.assertEqual(job_page["summary"]["review_required"], 2)
        self.assertEqual(len(report["items"]), 3)

    def test_wp_diagnostics_do_not_invent_st22_incidents(self):
        start = datetime(2026, 8, 31, 17, tzinfo=timezone.utc)
        end = datetime(2026, 9, 30, 17, tzinfo=timezone.utc)
        rows = [
            {"host": "APP1", "pid": "101", "collection_id": "check1",
             "consumer_type": "PROCESS", "consumer_key": "PID 101",
             "rabax": "3", "rxmsg": "2"},
            {"host": "APP1", "pid": "101", "collection_id": "check1",
             "consumer_type": "PROCESS", "consumer_key": "PID 101",
             "rabax": "3", "rxmsg": "2"},
        ]
        result = summarize_monthly_wp_errors(rows, start, end)
        self.assertEqual(result["status"], "WP_SIGNALS_ONLY")
        self.assertEqual(result["timestamped_events"], 0)
        self.assertEqual(result["snapshot_host_checks"], 0)
        self.assertEqual(result["wp_signal_host_checks"], 2)
        self.assertEqual({row["signal"] for row in result["wp_diagnostics"]}, {"RABAX", "RXMSG"})

    def test_legacy_scalar_error_is_visible_without_assumed_timestamp(self):
        start = datetime(2026, 8, 31, 17, tzinfo=timezone.utc)
        end = datetime(2026, 9, 30, 17, tzinfo=timezone.utc)
        row = {
            "host": "APP2", "pid": "55", "collection_id": "check-legacy",
            "error_code": "TIME_OUT", "error_recency": "AT_SNAPSHOT",
            "latest_error_ts": "2026-09-05 10:12:00",
        }
        result = summarize_monthly_wp_errors([row], start, end)
        self.assertEqual(result["status"], "SNAPSHOT_ONLY")
        self.assertEqual(result["timestamped_events"], 0)
        self.assertEqual(result["snapshot_host_checks"], 1)
        self.assertEqual(result["untimed_trace_observations"], 1)



    def test_duplicate_host_metrics_are_one_critical_wp_host_check(self):
        start = datetime(2026, 8, 31, 17, tzinfo=timezone.utc)
        end = datetime(2026, 9, 30, 17, tzinfo=timezone.utc)
        times = [
            datetime(2026, 9, 10, 10, 0, tzinfo=timezone.utc),
            datetime(2026, 9, 10, 10, 1, tzinfo=timezone.utc),
        ]
        samples = [
            {"collection_id": "run-one", "host": "APP1", "collected_at": at,
             "cpu_pct": 80, "ram_pct": 85, "wp_critical": 2}
            for at in times
        ]

        class FakeResult:
            def __init__(self, rows):
                self.rows = rows

            def mappings(self):
                return self

            def all(self):
                return self.rows

        class FakeConn:
            def execute(self, statement, parameters):
                if "SELECT hm.collection_id" in str(statement):
                    return FakeResult(samples)
                self.assert_no_extra = True
                return FakeResult([])

        report = monthly_pressure_observations(
            FakeConn(), start, end, "rundeck_top_consumers", "c.status = 'READY'"
        )
        host = report["hosts"][0]
        self.assertEqual(host["critical_wp_host_checks"], 1)
        self.assertEqual(host["cpu_warning_host_checks"], 1)
        self.assertEqual(host["ram_warning_host_checks"], 1)
        self.assertEqual(host["complete_host_checks"], 1)
        self.assertEqual(report["cpu"]["episodes"], 1)
        self.assertEqual(report["ram"]["episodes"], 1)


if __name__ == "__main__":
    unittest.main()

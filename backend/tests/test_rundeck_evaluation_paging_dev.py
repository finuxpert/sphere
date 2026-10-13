"""DEV: regression checks for full-population review/search and 30-hex population distribution."""
import unittest
import time
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from unittest.mock import patch

from backend import rundeck_evaluation
from backend.rundeck_evaluation import _evaluation_health_summary, _evaluation_page


class EvaluationPagingDevTests(unittest.TestCase):
    @staticmethod
    def report():
        items = []
        for index in range(388):
            status = (
                "REVIEW REQUIRED" if index < 13 else
                "HIGH CPU" if index < 74 else
                "INSUFFICIENT DATA" if index < 98 else "NORMAL"
            )
            items.append({
                "consumer_type": "PROGRAM",
                "consumer_key": f"Z_PROGRAM_{index:03d}",
                "program": f"Z_PROGRAM_{index:03d}",
                "hosts": [f"AOPH{1 + index % 5}PAPPDC"],
                "status": status,
                "details": {},
            })
        return {"summary": {"workloads": len(items), "review_required": 13,
                             "health": _evaluation_health_summary(items)}, "items": items}

    def test_full_population_summary_is_exclusive(self):
        report = self.report()
        self.assertEqual(report["summary"]["health"], {
            "review": 13, "attention": 61, "normal": 290, "unknown": 24
        })
        self.assertEqual(sum(report["summary"]["health"].values()), 388)

    def test_deep_search_does_not_stop_at_first_100(self):
        report = self.report()
        result = _evaluation_page(report, limit=15, offset=0,
                                  query="Z_PROGRAM_350", health="ALL")
        self.assertEqual(result["page"]["total"], 1)
        self.assertEqual(result["items"][0]["consumer_key"], "Z_PROGRAM_350")
        self.assertEqual(result["summary"]["workloads"], 388)

    def test_exact_paging_at_page_boundary_and_filter(self):
        report = self.report()
        result = _evaluation_page(report, limit=25, offset=350, query="", health="ALL")
        self.assertEqual(result["page"]["total"], 388)
        self.assertEqual(result["page"]["returned"], 25)
        self.assertTrue(result["page"]["has_more"])
        self.assertEqual(result["items"][0]["consumer_key"], "Z_PROGRAM_350")
        result = _evaluation_page(report, limit=15, offset=60, query="", health="ATTENTION")
        self.assertEqual(result["page"]["total"], 61)
        self.assertEqual(result["page"]["returned"], 1)
        self.assertEqual(result["items"][0]["consumer_key"], "Z_PROGRAM_073")

    def test_host_search_scans_all_observed_app_associations(self):
        report = self.report()
        result = _evaluation_page(report, limit=5, offset=0,
                                  query="AOPH5PAPPDC", health="ALL")
        self.assertEqual(result["page"]["total"], 77)
        self.assertEqual(result["page"]["returned"], 5)
        self.assertIn("AOPH5PAPPDC", result["items"][0]["hosts"])

    def test_evaluation_requests_are_singleflight_during_cold_start(self):
        concurrent = 0
        highest_concurrent = 0
        guard = Lock()

        def fake_evaluation(*_args):
            nonlocal concurrent, highest_concurrent
            with guard:
                concurrent += 1
                highest_concurrent = max(highest_concurrent, concurrent)
            time.sleep(0.025)
            with guard:
                concurrent -= 1
            return {"ok": True}

        with patch.object(rundeck_evaluation, "_evaluation_report_locked", fake_evaluation):
            with ThreadPoolExecutor(max_workers=4) as executor:
                results = list(executor.map(
                    lambda limit: rundeck_evaluation.evaluation_report(limit=limit),
                    [5, 25, 50, 100],
                ))
        self.assertEqual(results, [{"ok": True}] * 4)
        self.assertEqual(highest_concurrent, 1)

    def test_empty_filter_and_invalid_parameters(self):
        report = self.report()
        page = _evaluation_page(report, limit=10, offset=0, query="NOT_FOUND", health="ALL")
        self.assertEqual(page["page"]["total"], 0)
        self.assertEqual(page["page"]["returned"], 0)
        for health in ["DELETE", "REVIEW REQUIRED"]:
            with self.assertRaises(ValueError):
                _evaluation_page(report, limit=10, offset=0, query="", health=health)
        with self.assertRaises(ValueError):
            _evaluation_page(report, limit=10, offset=-1, query="", health="ALL")


if __name__ == "__main__":
    unittest.main()

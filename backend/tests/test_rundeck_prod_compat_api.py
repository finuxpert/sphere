"""Static PROD compatibility contract: no live DB or service mutations."""
from __future__ import annotations

import unittest
from fastapi.routing import APIRoute

from backend.rundeck_api import app
from backend.rundeck_prod_compat_evaluation import _anchor_collection
from backend.rundeck_workload_activity import normalize_activity_row, WP_TYPES

NEW_ROUTES = (
    "/history/workload/activity",
    "/evaluation/top-consumers",
    "/history/window",
    "/evaluation/workloads/monthly",
    "/evaluation/workloads/monthly/hosts",
    "/history/trends",
    "/infra/monthly-storage",
)

LEGACY_ROUTES = (
    "/availability/latest", "/jobs/source", "/evaluation/workloads",
    "/infra/hosts", "/collections/latest", "/platform/readiness",
)


class ProdCompatibilityContractTest(unittest.TestCase):
    def test_all_new_routes_are_registered_once(self):
        paths = [route.path for route in app.routes
                 if isinstance(route, APIRoute) and "GET" in route.methods]
        for path in NEW_ROUTES:
            with self.subTest(path=path):
                self.assertEqual(paths.count(path), 1)

    def test_existing_prod_routes_are_not_removed(self):
        paths = {route.path for route in app.routes
                 if isinstance(route, APIRoute)}
        self.assertTrue(set(LEGACY_ROUTES).issubset(paths))

    def test_workload_activity_preserves_null_missing_evidence(self):
        from datetime import datetime, timezone
        row = {"collection_id": "rundeck-test",
               "sampled_at": datetime(2026, 11, 3, tzinfo=timezone.utc),
               "source_rows": 0, "wp_count": 0}
        normalized = normalize_activity_row(row)
        self.assertIsNone(normalized["jobs"])
        self.assertIsNone(normalized["programs"])
        self.assertIsNone(normalized["wp"])

    def test_all_wp_buckets_are_present(self):
        self.assertEqual(WP_TYPES, ("DIA", "BTC", "UPD", "ENQ", "OTHER"))


if __name__ == "__main__":
    unittest.main()

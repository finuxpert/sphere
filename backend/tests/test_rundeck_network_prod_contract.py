"""PROD: network trend API contract and Evaluation regression guards."""
import inspect
import unittest

from backend.rundeck_api_core import app, history_trend, workload_evaluation
from backend.rundeck_network_trends import app_network_trend
from backend.rundeck_trends import validate_custom_window


class NetworkEvaluationProdContractTests(unittest.TestCase):
    def test_network_route_exposes_rx_tx_custom_window(self):
        signature = inspect.signature(history_trend)
        self.assertIn("from_at", signature.parameters)
        self.assertIn("to_at", signature.parameters)
        self.assertIn("metric", signature.parameters)
        self.assertTrue(callable(app_network_trend))
        self.assertTrue(callable(validate_custom_window))
        routes = [route for route in app.routes if getattr(route, "path", "") == "/history/trend"]
        self.assertEqual(len(routes), 1)
        fields = {
            p.name: p for p in routes[0].dependant.query_params
        }
        metric_pattern = fields["metric"].field_info.metadata
        self.assertIn("network_rx", str(metric_pattern))
        self.assertIn("network_tx", str(metric_pattern))

    def test_paging_evaluation_route_is_still_available(self):
        signature = inspect.signature(workload_evaluation)
        for field in ("period", "consumer_type", "limit", "offset", "q", "health"):
            self.assertIn(field, signature.parameters)
        routes = [route for route in app.routes if getattr(route, "path", "") == "/evaluation/workloads"]
        self.assertEqual(len(routes), 1)


if __name__ == "__main__":
    unittest.main()

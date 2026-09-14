import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from backend import rundeck_runner as runner


class RundeckRunnerTests(unittest.TestCase):
    def test_status_is_safe_when_runner_credential_is_missing(self):
        with TemporaryDirectory() as directory, \
                patch.object(runner, 'ROOT', Path(directory)), \
                patch.object(runner, 'credential_mode', return_value='missing'):
            result = runner.status()
            self.assertFalse(result['ready'])
            self.assertFalse(result['allowed'])
            self.assertEqual(result['readiness_reason'], 'RUNNER_CREDENTIAL_MISSING')

    def test_job_specs_are_fixed_server_side_for_both_collectors(self):
        with patch.dict(os.environ, {
            'RUNDECK_PROJECT': 'Linux',
            'RUNDECK_JOB_GROUP': 'SAP/AOP',
            'RUNDECK_JOB_NAME': '[Critical]-[Daily Check] SPHERE SAP Work Proccess Check',
            'RUNDECK_PERF_JOB_ID': 'perf-approved-id',
            'RUNDECK_AVAIL_JOB_ID': 'availability-approved-id',
            'RUNDECK_AVAILABILITY_PROJECT': 'Linux',
            'RUNDECK_AVAILABILITY_JOB_GROUP': 'SAP/AOP',
        }, clear=False):
            specs = runner._job_specs()
            self.assertEqual(specs['performance']['job_id'], 'perf-approved-id')
            self.assertEqual(specs['availability']['job_id'], 'availability-approved-id')
            self.assertEqual(specs['performance']['group'], 'SAP/AOP')
            self.assertEqual(specs['availability']['group'], 'SAP/AOP')

    def test_collect_now_starts_both_approved_jobs_without_browser_job_selection(self):
        specs = {
            'performance': {
                'key': 'performance', 'label': 'Performance', 'job_id': 'perf-approved-id',
                'project': 'Linux', 'group': 'SAP/AOP', 'name': 'Performance Collector',
            },
            'availability': {
                'key': 'availability', 'label': 'Availability', 'job_id': 'availability-approved-id',
                'project': 'Linux', 'group': 'SAP/AOP', 'name': 'Availability Collector',
            },
        }
        calls = []

        def fake_request(path, method='GET'):
            calls.append((path, method))
            if 'perf-approved-id' in path:
                return {'id': 523100, 'status': 'running'}
            if 'availability-approved-id' in path:
                return {'id': 523101, 'status': 'running'}
            raise AssertionError(path)

        with TemporaryDirectory() as directory, \
                patch.object(runner, 'ROOT', Path(directory)), \
                patch.object(runner, '_job_specs', return_value=specs), \
                patch.object(runner, 'status', side_effect=[{'allowed': True}, {'allowed': False}]), \
                patch.object(runner, '_request', side_effect=fake_request), \
                patch.object(runner.threading, 'Thread') as thread:
            runner.collect_now(actor='basis-user')
            state = json.loads((Path(directory) / 'collect-now.json').read_text())
            self.assertEqual(state['requested_by'], 'basis-user')
            self.assertEqual(state['sources']['performance']['execution_id'], '523100')
            self.assertEqual(state['sources']['availability']['execution_id'], '523101')
            self.assertEqual(
                [path for path, method in calls if method == 'POST'],
                [
                    '/api/44/job/perf-approved-id/run',
                    '/api/44/job/availability-approved-id/run',
                ],
            )
            thread.return_value.start.assert_called_once()

    def test_bundle_ready_requires_both_sources_and_reports_skew(self):
        sources = {
            'performance': {
                'status': 'succeeded', 'ingest_status': 'READY', 'collection_status': 'READY',
                'finished_at': '2026-09-13T13:40:00+00:00',
            },
            'availability': {
                'status': 'succeeded', 'ingest_status': 'READY',
                'finished_at': '2026-09-13T13:40:12+00:00',
            },
        }
        self.assertEqual(runner._bundle_status(sources), 'READY')
        self.assertEqual(runner._source_skew_seconds(sources), 12)
        sources['availability']['ingest_status'] = 'PENDING_REFRESH'
        self.assertEqual(runner._bundle_status(sources), 'PARTIAL')


if __name__ == '__main__':
    unittest.main()

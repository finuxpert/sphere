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

    def test_job_id_is_discovered_only_from_fixed_server_side_identity(self):
        with TemporaryDirectory() as directory, \
                patch.object(runner, 'ROOT', Path(directory)), \
                patch.dict(os.environ, {
                    'RUNDECK_PROJECT': 'Linux',
                    'RUNDECK_JOB_GROUP': 'SAP/AOP',
                    'RUNDECK_JOB_NAME': '[Critical]-[Daily Check] SPHERE SAP Work Proccess Check',
                    'RUNDECK_RUN_JOB_ID': '',
                }, clear=False), \
                patch.object(runner, '_request', return_value=[
                    {
                        'id': 'approved-job-id',
                        'group': 'SAP/AOP',
                        'name': '[Critical]-[Daily Check] SPHERE SAP Work Proccess Check',
                    },
                    {
                        'id': 'other-job-id',
                        'group': 'SAP/OTHER',
                        'name': '[Critical]-[Daily Check] SPHERE SAP Work Proccess Check',
                    },
                ]):
            self.assertEqual(runner._job_id(), 'approved-job-id')

    def test_collect_now_accepts_api_actor_without_allowing_job_selection(self):
        with TemporaryDirectory() as directory, \
                patch.object(runner, 'ROOT', Path(directory)), \
                patch.object(runner, 'status', side_effect=[
                    {'allowed': True, 'job_id': 'approved-job-id'},
                    {'allowed': False, 'job_id': 'approved-job-id'},
                ]), \
                patch.object(runner, '_job_identity', return_value=(
                    'Linux', 'SAP/AOP', '[Critical]-[Daily Check] SPHERE SAP Work Proccess Check'
                )), \
                patch.object(runner, '_request', return_value={'id': 523100, 'status': 'running'}), \
                patch.object(runner.threading, 'Thread') as thread:
            runner.collect_now(actor='basis-user')
            state = json.loads((Path(directory) / 'collect-now.json').read_text())
            self.assertEqual(state['requested_by'], 'basis-user')
            self.assertEqual(state['job_id'], 'approved-job-id')
            self.assertEqual(state['execution_id'], '523100')
            thread.return_value.start.assert_called_once()


if __name__ == '__main__':
    unittest.main()

"""Offline safety unit tests for destructive GitHub hygiene candidate selection."""

import argparse
from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path
import unittest
import tempfile
import subprocess
from unittest.mock import patch

HERE = Path(__file__).parent


def load(name: str, file: str):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


branch = load("branch_hygiene", "cleanup-merged-github-branches.py")
actions = load("action_hygiene", "cleanup-github-actions-runs.py")
NOW = datetime(2026, 11, 24, tzinfo=timezone.utc)


def ref(name: str, sha: str = "a" * 40) -> dict:
    return {"name": name, "commit": {"sha": sha}, "protected": False}


def pr(number: int, name: str, *, state: str = "closed",
       merged: bool = True, base: str = "rundeck-sphere-dev",
       sha: str = "a" * 40) -> dict:
    return {
        "number": number, "state": state,
        "merged_at": "2026-11-05T00:00:00Z" if merged else None,
        "head": {"ref": name, "sha": sha,
                 "repo": {"full_name": "finuxpert/sphere"}},
        "base": {"ref": base, "repo": {"full_name": "finuxpert/sphere"}},
    }


def run(number: int, branch_name: str, *, age: int = 20,
        conclusion: str = "success", status: str = "completed",
        event: str = "pull_request", path: str = ".github/workflows/dev-qa.yml") -> dict:
    when = NOW - timedelta(days=age, hours=number)
    return {"id": number, "head_branch": branch_name,
            "status": status, "conclusion": conclusion, "event": event,
            "name": "DEV QA", "path": path,
            "created_at": when.isoformat().replace("+00:00", "Z")}


class BranchCleanupContract(unittest.TestCase):
    def test_merged_only_and_active_branches_never_removed(self):
        branches = [
            ref("rundeck-sphere-dev"), ref("sphere-prod"),
            ref("safe/merged"), ref("needs/review"),
            ref("base/stacked"), ref("abandoned/failed"),
            ref("wrong-sha", sha="b" * 40),
            {**ref("protected"), "protected": True},
        ]
        prs = [
            pr(1, "safe/merged"), pr(2, "needs/review", state="open", merged=False),
            pr(3, "feature/pr", state="open", merged=False, base="base/stacked"),
            pr(4, "abandoned/failed", merged=False),
            pr(5, "wrong-sha"), pr(6, "protected"),
        ]
        safe, retained = branch.assess(branches, prs, "sphere-prod")
        self.assertEqual([item[0] for item in safe], ["safe/merged"])
        kept = {item[0] for item in retained}
        self.assertIn("base/stacked", kept)
        self.assertIn("needs/review", kept)
        self.assertIn("abandoned/failed", kept)
        self.assertIn("wrong-sha", kept)
        self.assertIn("protected", kept)
        self.assertIn("rundeck-sphere-dev", kept)
        self.assertIn("sphere-prod", kept)


class ActionsCleanupContract(unittest.TestCase):
    def setUp(self):
        self.args = argparse.Namespace(
            success_min_age_days=14, cancelled_min_age_days=7,
            failed_min_age_days=30, keep_per_branch_workflow=1,
            max_delete=150,
        )
        self.branches = [
            ref("feature/merged"), ref("feature/open"),
            ref("feature/abandoned"), ref("feature/changed", sha="b"*40),
            ref("rundeck-sphere-dev"),
        ]
        self.prs = [
            pr(1, "feature/merged"),
            pr(2, "feature/open", state="open", merged=False),
            pr(3, "feature/abandoned", merged=False),
            pr(4, "feature/changed"),
        ]

    def selected(self, runs):
        eligible, skipped, branches = actions.choose_runs(
            self.branches, self.prs, runs, "sphere-prod", NOW, self.args)
        return {int(item["id"]) for item in eligible}, skipped, branches

    def test_retains_current_last_per_branch_workflow_and_open_pr(self):
        selected, _, branches = self.selected([
            run(1, "feature/merged", age=3),
            run(2, "feature/merged", age=40),
            run(3, "feature/open", age=40),
            run(4, "feature/abandoned", age=40),
            run(5, "rundeck-sphere-dev", age=40),
            run(6, "feature/changed", age=40),
        ])
        self.assertEqual(selected, {2})
        self.assertIn("feature/merged", branches)
        self.assertNotIn("feature/open", branches)
        self.assertNotIn("feature/abandoned", branches)
        self.assertNotIn("feature/changed", branches)

    def test_different_conclusions_and_manual_dispatch_are_safe(self):
        selected, skipped, _ = self.selected([
            run(1, "feature/merged", age=3),  # last => keep
            run(2, "feature/merged", age=20, conclusion="success"),
            run(3, "feature/merged", age=20, conclusion="cancelled"),
            run(4, "feature/merged", age=20, conclusion="failure"),
            run(5, "feature/merged", age=40, conclusion="failure"),
            run(6, "feature/merged", age=40, event="workflow_dispatch"),
            run(7, "feature/merged", age=40, status="in_progress"),
        ])
        self.assertEqual(selected, {2, 3, 5})
        self.assertGreaterEqual(skipped["manual/other-event"], 1)
        self.assertGreaterEqual(skipped["queued/in-progress"], 1)

    def test_never_delete_only_run_even_if_very_old(self):
        selected, _, _ = self.selected([run(10, "feature/merged", age=200)])
        self.assertEqual(selected, set())




class EvidenceGuardContract(unittest.TestCase):

    def setUp(self):
        self.sample_run = {
            "id": 999999,
            "head_branch": "feature/merged",
            "head_sha": "a" * 40,
            "workflow_id": 398084766,
            "event": "push",
            "conclusion": "success",
            "status": "completed",
            "created_at": "2026-10-01T00:00:00Z",
            "updated_at": "2026-10-01T00:01:00Z",
            "run_attempt": 1,
        }

    def manifest(self):
        return {
            "repository": actions.REPO,
            "mode": "dry_run",
            "proposed": [
                actions.run_identity(self.sample_run)
            ],
        }

    def test_protected_evidence_count(self):
        self.assertEqual(
            len(actions.PROTECTED_RUN_IDS), 30
        )

    def test_protected_evidence(self):
        self.sample_run["id"] = 41635061571
        self.assertEqual(
            actions.evidence_reason(self.sample_run, set(), set()),
            "protected-evidence"
        )

    def test_prod_workflow_protected(self):
        self.sample_run["workflow_id"] = 405672519
        self.assertEqual(
            actions.evidence_reason(self.sample_run, set(), set()),
            "protected-workflow"
        )

    def test_active_artifact_protected(self):
        self.assertEqual(
            actions.evidence_reason(
                self.sample_run, {self.sample_run["id"]}, set()
            ),
            "active-artifact"
        )

    def test_release_sha_protected(self):
        self.assertEqual(
            actions.evidence_reason(
                self.sample_run, set(), {self.sample_run["head_sha"]}
            ),
            "tag-or-deployment-sha"
        )

    def test_known_release_sha_protected(self):
        self.sample_run["head_sha"] = "980bfe99" + "a" * 32
        self.assertEqual(
            actions.evidence_reason(self.sample_run, set(), set()),
            "known-release-sha"
        )

    def test_missing_sha_blocked(self):
        self.sample_run.pop("head_sha")
        self.assertEqual(
            actions.evidence_reason(self.sample_run, set(), set()),
            "missing-head-sha"
        )

    def test_valid_manifest(self):
        result = actions.approved_candidates(
            self.manifest(), [self.sample_run], 150
        )
        self.assertEqual(result, [self.sample_run])

    def test_manifest_sha_mismatch(self):
        manifest = self.manifest()
        manifest["proposed"][0]["head_sha"] = "b" * 40

        with self.assertRaises(ValueError):
            actions.approved_candidates(
                manifest, [self.sample_run], 150
            )

    def test_manifest_repository_mismatch(self):
        manifest = self.manifest()
        manifest["repository"] = "other/repository"

        with self.assertRaises(ValueError):
            actions.approved_candidates(
                manifest, [self.sample_run], 150
            )

    def test_manifest_duplicate_id(self):
        manifest = self.manifest()
        manifest["proposed"].append(
            manifest["proposed"][0]
        )

        with self.assertRaises(ValueError):
            actions.approved_candidates(
                manifest, [self.sample_run], 150
            )

    def test_manifest_no_longer_eligible(self):
        with self.assertRaises(ValueError):
            actions.approved_candidates(
                self.manifest(), [], 150
            )

    def test_manifest_limit(self):
        with self.assertRaises(ValueError):
            actions.approved_candidates(
                self.manifest(), [self.sample_run], 0
            )

    def test_backup_success(self):
        def fake_download(command, stdout=None):
            stdout.write(b"mock QA evidence")
            return 0

        with tempfile.TemporaryDirectory() as directory:
            with patch.object(
                actions.subprocess,
                "check_call",
                side_effect=fake_download
            ):
                target = actions.backup_run_log(
                    self.sample_run["id"], directory
                )

                self.assertGreater(target.stat().st_size, 0)
                self.assertEqual(
                    target.stat().st_mode & 0o777,
                    0o600
                )

    def test_backup_download_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(
                actions.subprocess,
                "check_call",
                side_effect=subprocess.CalledProcessError(
                    1, "gh"
                )
            ):
                with self.assertRaises(
                    subprocess.CalledProcessError
                ):
                    actions.backup_run_log(
                        self.sample_run["id"], directory
                    )

                self.assertFalse(
                    (Path(directory) / "999999.log").exists()
                )

    def test_empty_backup_blocked(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(
                actions.subprocess,
                "check_call",
                return_value=0
            ):
                with self.assertRaises(RuntimeError):
                    actions.backup_run_log(
                        self.sample_run["id"], directory
                    )

    def test_existing_backup_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "999999.log"
            target.write_text("existing evidence")

            with self.assertRaises(FileExistsError):
                actions.backup_run_log(
                    self.sample_run["id"], directory
                )

            self.assertEqual(
                target.read_text(), "existing evidence"
            )




class MockedApplyContract(unittest.TestCase):

    def execute_apply(self, scenario):
        import json

        sample = {
            "id": 999999,
            "head_branch": "feature/merged",
            "head_sha": "a" * 40,
            "workflow_id": 398084766,
            "event": "push",
            "conclusion": "failure",
            "status": "completed",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:01:00Z",
            "run_attempt": 1,
        }

        deletes = []
        reads = [0]

        def fake_api(path, method="GET"):
            if method == "DELETE":
                deletes.append(path)
                return None

            if path.endswith("/actions/runs/999999"):
                reads[0] += 1
                current = dict(sample)

                if scenario == "changed" and reads[0] >= 2:
                    current["run_attempt"] = 2

                return current

            if path == "repos/" + actions.REPO:
                return {
                    "default_branch": "rundeck-sphere-dev"
                }

            raise AssertionError(
                "Unexpected API request: " + path
            )

        def fake_pages(path, **kwargs):
            return []

        protection_calls = [0]

        def fake_protections():
            protection_calls[0] += 1

            if (
                scenario == "artifact"
                and protection_calls[0] >= 3
            ):
                return {999999}, set()

            return set(), set()

        def fake_backup(run_id, directory):
            if scenario == "backup_failure":
                raise OSError("Simulated backup failure")

            target = Path(directory) / "mock.log"
            target.parent.mkdir(
                parents=True, exist_ok=True
            )
            target.write_text("Mock QA evidence")
            return target

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            approved = root / "approved.json"
            report = root / "execution.json"

            approved.write_text(json.dumps({
                "repository": actions.REPO,
                "mode": "dry_run",
                "proposed": [
                    actions.run_identity(sample)
                ],
            }))

            argv = [
                "cleanup-github-actions-runs.py",
                "--apply",
                "--approved-manifest", str(approved),
                "--manifest", str(report),
                "--backup-dir", str(root / "logs"),
            ]

            with patch.object(actions.sys, "argv", argv),                  patch.object(actions.shutil, "which",
                              return_value="/mock/gh"),                  patch.object(actions, "api",
                              side_effect=fake_api),                  patch.object(actions, "list_pages",
                              side_effect=fake_pages),                  patch.object(actions, "choose_runs",
                              return_value=(
                                  [sample], {}, {}
                              )),                  patch.object(actions, "collect_protections",
                              side_effect=fake_protections),                  patch.object(actions, "backup_run_log",
                              side_effect=fake_backup),                  patch.object(actions.subprocess, "run",
                              side_effect=AssertionError(
                                  "Real subprocess blocked"
                              )),                  patch.object(actions.subprocess, "check_call",
                              side_effect=AssertionError(
                                  "Real subprocess blocked"
                              )):

                result = actions.main()

            return result, deletes

    def test_apply_success(self):
        result, deletes = self.execute_apply("success")
        self.assertEqual(result, 0)
        self.assertEqual(len(deletes), 1)

    def test_apply_backup_failure_blocks_delete(self):
        result, deletes = self.execute_apply("backup_failure")
        self.assertNotEqual(result, 0)
        self.assertEqual(deletes, [])

    def test_apply_new_artifact_blocks_delete(self):
        result, deletes = self.execute_apply("artifact")
        self.assertNotEqual(result, 0)
        self.assertEqual(deletes, [])

    def test_apply_changed_run_blocks_delete(self):
        result, deletes = self.execute_apply("changed")
        self.assertNotEqual(result, 0)
        self.assertEqual(deletes, [])

    def test_branch_manifest_valid(self):
        candidate = (
            "feature/merged", "a" * 40, (123,)
        )

        manifest = {
            "repository": branch.REPO,
            "mode": "dry_run",
            "proposed": [
                branch.branch_identity(candidate)
            ],
        }

        self.assertEqual(
            branch.approved_branches(
                manifest, [candidate], 20
            ),
            [candidate]
        )

    def test_branch_manifest_sha_mismatch(self):
        candidate = (
            "feature/merged", "a" * 40, (123,)
        )

        manifest = {
            "repository": branch.REPO,
            "mode": "dry_run",
            "proposed": [
                branch.branch_identity(candidate)
            ],
        }

        manifest["proposed"][0]["sha"] = "b" * 40

        with self.assertRaises(ValueError):
            branch.approved_branches(
                manifest, [candidate], 20
            )

    def test_branch_manifest_no_longer_eligible(self):
        candidate = (
            "feature/merged", "a" * 40, (123,)
        )

        manifest = {
            "repository": branch.REPO,
            "mode": "dry_run",
            "proposed": [
                branch.branch_identity(candidate)
            ],
        }

        with self.assertRaises(ValueError):
            branch.approved_branches(
                manifest, [], 20
            )


if __name__ == "__main__":
    unittest.main()

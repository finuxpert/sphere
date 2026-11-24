"""Offline safety unit tests for destructive GitHub hygiene candidate selection."""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path
import unittest

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


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""Safe, dry-run-first cleanup of superseded GitHub Actions PR run history.

Only completed runs belonging to *merged*, no-longer-active same-repository
PR branches are eligible. Active DEV/PROD, open PR, unmerged PR, manually
dispatched and recent run history is never deleted.

Default: python3 ops/rundeck/cleanup-github-actions-runs.py
Apply:   python3 ops/rundeck/cleanup-github-actions-runs.py --apply

Deleting a run irreversibly deletes its GitHub logs and associated artifacts.
An authenticated GitHub CLI with Actions write access is required to apply.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import shutil
import subprocess
import sys

REPO = "finuxpert/sphere"
KEEP = frozenset({"rundeck-sphere-dev", "rundeck-sphere-prod",
                  "sphere-dev", "sphere-prod"})
SAFE_EVENTS = frozenset({"pull_request", "push"})


def api(path: str, *, method: str = "GET") -> object:
    command = ["gh", "api", "--method", method,
               "-H", "Accept: application/vnd.github+json", path]
    output = subprocess.run(command, capture_output=True, text=True, check=False)
    if output.returncode:
        raise RuntimeError(
            f"{method} {path} returned {output.returncode}: "
            f"{output.stderr.strip()[:400]}"
        )
    return None if method == "DELETE" else json.loads(output.stdout)


def list_pages(path: str, *, nested: str | None = None) -> list[dict]:
    """Exhaust 100-item GitHub REST pages; stop on final partial page."""
    result = []
    for page in range(1, 101):
        separator = "&" if "?" in path else "?"
        response = api(f"repos/{REPO}/{path}{separator}per_page=100&page={page}")
        batch = response.get(nested) if nested else response
        if not isinstance(batch, list):
            raise RuntimeError(f"Unexpected response shape for {path}")
        result.extend(batch)
        if len(batch) < 100:
            return result
    raise RuntimeError(f"Refusing incomplete pagination for {path}")


def own_branch(pr: dict, field: str) -> str | None:
    side = pr.get(field) or {}
    return (side.get("ref") if (side.get("repo") or {}).get("full_name") == REPO
            else None)


def parse_stamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def choose_runs(branches: list[dict], prs: list[dict], runs: list[dict],
                default_branch: str, now: datetime, args: argparse.Namespace
                ) -> tuple[list[dict], dict[str, int], dict[str, str]]:
    """Return candidates and audit counters without any GitHub writes."""
    keep_branches = set(KEEP) | {default_branch}
    merged_heads: dict[str, set[str]] = defaultdict(set)
    abandoned = set()
    branch_map = {b["name"]: b for b in branches}

    for pr in prs:
        h = own_branch(pr, "head")
        if pr.get("state") == "open":
            for side in ("head", "base"):
                ref = own_branch(pr, side)
                if ref:
                    keep_branches.add(ref)
        if h and pr.get("state") == "closed":
            if pr.get("merged_at"):
                merged_heads[h].add(pr["head"]["sha"])
            else:
                abandoned.add(h)

    eligible_branches = set()
    for name, hashes in merged_heads.items():
        if name in keep_branches or name in abandoned:
            continue
        existing = branch_map.get(name)
        if existing and (existing.get("protected") or
                         existing["commit"]["sha"] not in hashes):
            continue
        eligible_branches.add(name)

    # Preserve the most recent run from EACH workflow on EACH merged branch;
    # it remains available as evidence of a final PR CI attempt.
    grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for run in runs:
        grouped[(run.get("head_branch") or "",
                 run.get("path") or run.get("name") or "")].append(run)
    preserved = set()
    for group in grouped.values():
        group.sort(key=lambda r: (r.get("created_at") or "", int(r["id"])), reverse=True)
        preserved.update(int(run["id"]) for run in group[:args.keep_per_branch_workflow])

    candidates = []
    skipped = defaultdict(int)
    for run in runs:
        branch = run.get("head_branch")
        status = run.get("status")
        conclusion = (run.get("conclusion") or "").lower()
        event = run.get("event")
        rid = int(run["id"])

        if branch not in eligible_branches:
            skipped["active/unmerged/no-merged-pr"] += 1
            continue
        if status != "completed":
            skipped["queued/in-progress"] += 1
            continue
        if event not in SAFE_EVENTS:
            skipped["manual/other-event"] += 1
            continue
        if rid in preserved:
            skipped["latest-per-branch-workflow"] += 1
            continue
        if conclusion in {"failure", "timed_out", "action_required", "startup_failure"}:
            retention_days = args.failed_min_age_days
        elif conclusion in {"cancelled", "skipped"}:
            retention_days = args.cancelled_min_age_days
        elif conclusion == "success":
            retention_days = args.success_min_age_days
        else:
            skipped["unrecognized-conclusion"] += 1
            continue
        created = parse_stamp(run["created_at"])
        if created > now - timedelta(days=retention_days):
            skipped["inside-retention-window"] += 1
            continue
        candidates.append(run)

    candidates.sort(key=lambda run: (run["created_at"], int(run["id"])))
    return candidates, dict(skipped), {k: "merged and unreferenced" for k in eligible_branches}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="actually DELETE eligible runs")
    parser.add_argument("--success-min-age-days", type=int, default=14)
    parser.add_argument("--cancelled-min-age-days", type=int, default=7)
    parser.add_argument("--failed-min-age-days", type=int, default=30)
    parser.add_argument("--keep-per-branch-workflow", type=int, default=1)
    parser.add_argument("--max-delete", type=int, default=150,
                        help="maximum deletes in one invocation, for rate-limit safety")
    parser.add_argument("--manifest", default="/tmp/sphere-github-actions-hygiene.json",
                        help="local audit report; does not include auth tokens")
    args = parser.parse_args()
    if min(args.success_min_age_days, args.cancelled_min_age_days,
           args.failed_min_age_days) < 1:
        parser.error("retention periods must be >=1 day")
    if args.keep_per_branch_workflow < 1 or args.max_delete < 1:
        parser.error("keep-per-branch-workflow and max-delete must be >=1")
    if not shutil.which("gh"):
        print("BLOCKED: install and authenticate GitHub CLI first; no changes made.",
              file=sys.stderr)
        return 2

    try:
        repository = api(f"repos/{REPO}")
        branches = list_pages("branches")
        prs = list_pages("pulls?state=all")
        runs = list_pages("actions/runs", nested="workflow_runs")
        now = datetime.now(timezone.utc)
        candidates, skipped, eligible = choose_runs(
            branches, prs, runs, repository["default_branch"], now, args
        )
        proposed = candidates[:args.max_delete]
        report = {
            "repository": REPO,
            "audited_at_utc": now.isoformat(),
            "mode": "apply" if args.apply else "dry_run",
            "scanned_runs": len(runs),
            "eligible_closed_merged_branches": len(eligible),
            "candidates_total": len(candidates),
            "this_invocation_limit": args.max_delete,
            "proposed": [
                {"id": run["id"], "branch": run.get("head_branch"),
                 "workflow": run.get("name"), "event": run.get("event"),
                 "conclusion": run.get("conclusion"),
                 "created_at": run.get("created_at")}
                for run in proposed
            ],
            "retained_reasons": skipped,
            "deleted": [],
            "errors": [],
        }
        Path(args.manifest).write_text(
            json.dumps(report, indent=2, sort_keys=True) + "\n",
            encoding="utf-8"
        )
        print(f"REPO={REPO} SCANNED_RUNS={len(runs)}")
        print(f"ELIGIBLE_MERGED_BRANCHES={len(eligible)} "
              f"CANDIDATE_RUNS={len(candidates)} "
              f"MAX_DELETE={args.max_delete}")
        print(f"MANIFEST={args.manifest}")
        for run in proposed:
            print(f"{'DELETE' if args.apply else 'DRY_RUN'} RUN={run['id']} "
                  f"BRANCH={run['head_branch']} "
                  f"STATUS={run['conclusion']} DATE={run['created_at']}")
        if not args.apply:
            print("FINAL=DRY_RUN NO_DELETION")
            return 0

        # Freshly verify PR dependencies before any deletion.
        open_prs = list_pages("pulls?state=open")
        active = {name for pr in open_prs
                  for side in ("head", "base")
                  if (name := own_branch(pr, side))}
        active.update(KEEP)
        active.add(repository["default_branch"])
        failures = 0
        for run in proposed:
            rid = int(run["id"])
            if run["head_branch"] in active:
                report["errors"].append({"id": rid, "reason": "now-active PR or env"})
                failures += 1
                continue
            try:
                # Never remove a run that changed since the inventory.
                live = api(f"repos/{REPO}/actions/runs/{rid}")
                same = (
                    live.get("status") == "completed"
                    and live.get("head_branch") == run["head_branch"]
                    and live.get("event") == run["event"]
                    and live.get("created_at") == run["created_at"]
                    and live.get("conclusion") == run["conclusion"]
                )
                if not same:
                    report["errors"].append({"id": rid, "reason": "run changed"})
                    failures += 1
                    continue
                api(f"repos/{REPO}/actions/runs/{rid}", method="DELETE")
                report["deleted"].append(rid)
                print(f"DELETED_RUN={rid}")
            except RuntimeError as error:
                failures += 1
                report["errors"].append({"id": rid, "reason": str(error)})
                print(f"SKIPPED_RUN={rid} reason={error}", file=sys.stderr)

        Path(args.manifest).write_text(
            json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        print(f"FINAL=APPLY DELETED={len(report['deleted'])} "
              f"ERRORS={failures} REMAINING_ESTIMATE="
              f"{len(candidates) - len(report['deleted'])}")
        return 1 if failures else 0
    except (RuntimeError, KeyError, ValueError, OSError) as error:
        print(f"BLOCKED: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

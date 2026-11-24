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

# Permanent evidence protection from the 2026-11-24
# repository hygiene closeout.
PROTECTED_RUN_IDS = frozenset({
    # Original Phase 1 evidence
    41635061571, 41635466415, 41635533171,
    41636548615, 41636627588, 41810587743,
    42173545297, 42173545403, 42173545445,
    42173798470, 42173798721, 42173798753,
    42173807549, 42173807558, 42173807580,
    42187428593, 42188871719, 42188935393,
    43678656160,

    # Phase 2 failure samples
    41592955156, 41044355413, 41457310941,
    41609761943, 42628371829, 40550387407,
    40667645176, 40957004326, 41007233725,
    41792697728,

    # Failed backup/deletion attempt: retain
    41592947150,
})

PROTECTED_WORKFLOW_IDS = frozenset({
    405672519,  # PROD compatibility preflight
})



def api(path: str, *, method: str = "GET") -> object:
    command = ["gh", "api", "--method", method,
               "-H", "Accept: application/vnd.github+json", path]
    output = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True, check=False)
    if output.returncode:
        raise RuntimeError(
            f"{method} {path} returned {output.returncode}: "
            f"{output.stderr.strip()[:400]}"
        )
    return None if method == "DELETE" else json.loads(output.stdout)


def list_pages(path: str, *, nested: str = None) -> list:
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


def own_branch(pr: dict, field: str) -> str:
    side = pr.get(field) or {}
    return (side.get("ref") if (side.get("repo") or {}).get("full_name") == REPO
            else None)


def parse_stamp(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def choose_runs(branches: list, prs: list, runs: list,
                default_branch: str, now: datetime, args: argparse.Namespace
                ) -> tuple:
    """Return candidates and audit counters without any GitHub writes."""
    keep_branches = set(KEEP) | {default_branch}
    merged_heads = defaultdict(set)
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
    grouped = defaultdict(list)
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

        if rid in PROTECTED_RUN_IDS:
            skipped["protected-evidence"] += 1
            continue
        if run.get("workflow_id") in PROTECTED_WORKFLOW_IDS:
            skipped["protected-workflow"] += 1
            continue
        if branch and "prod" in branch.lower():
            skipped["prod-branch"] += 1
            continue
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


KNOWN_RELEASE_SHA = frozenset({
    "6089dcd054e7", "d6ed5eab", "c3210a236b90",
    "da08de4218ef", "eb0d85e2f313", "980bfe99",
    "65b671f28a01", "fd60fe5f", "b13be12d",
    "8c75ec7b8abd",
})


def collect_protections():
    artifacts = list_pages(
        "actions/artifacts", nested="artifacts"
    )
    tags = list_pages("tags")
    deployments = list_pages("deployments")

    artifact_ids = {
        int(a["workflow_run"]["id"])
        for a in artifacts
        if a.get("workflow_run")
        and not a.get("expired")
    }

    release_sha = {
        t["commit"]["sha"] for t in tags
    }

    release_sha.update(
        d["sha"] for d in deployments
        if d.get("sha")
    )

    return artifact_ids, release_sha


def evidence_reason(run, artifact_ids, release_sha):
    rid = int(run["id"])
    sha = run.get("head_sha")

    if not sha:
        return "missing-head-sha"

    if rid in PROTECTED_RUN_IDS:
        return "protected-evidence"

    if run.get("workflow_id") in PROTECTED_WORKFLOW_IDS:
        return "protected-workflow"

    if rid in artifact_ids:
        return "active-artifact"

    if sha in release_sha:
        return "tag-or-deployment-sha"

    if any(sha.startswith(s) for s in KNOWN_RELEASE_SHA):
        return "known-release-sha"

    return None


def backup_run_log(run_id, directory):
    import os

    directory = Path(directory)
    directory.mkdir(
        mode=0o700, parents=True, exist_ok=True
    )

    target = directory / ("{}.log".format(run_id))

    fd = os.open(
        str(target),
        os.O_WRONLY | os.O_CREAT | os.O_EXCL,
        0o600
    )

    try:
        with os.fdopen(fd, "wb") as output:
            subprocess.check_call([
                "gh", "run", "view", str(run_id),
                "-R", REPO, "--log"
            ], stdout=output)

            output.flush()
            os.fsync(output.fileno())

        if target.stat().st_size == 0:
            raise RuntimeError("Empty backup log")

    except Exception:
        target.unlink()
        raise

    return target


def run_identity(run):
    return {
        "id": int(run["id"]),
        "branch": run.get("head_branch"),
        "workflow_id": run.get("workflow_id"),
        "head_sha": run.get("head_sha"),
        "event": run.get("event"),
        "conclusion": run.get("conclusion"),
        "created_at": run.get("created_at"),
        "run_attempt": run.get("run_attempt"),
        "updated_at": run.get("updated_at"),
    }


def approved_candidates(manifest, candidates, limit):
    if manifest.get("repository") != REPO:
        raise ValueError("Approved manifest repository mismatch")

    if manifest.get("mode") != "dry_run":
        raise ValueError("Approved manifest must originate from audit")

    proposed = manifest.get("proposed")

    if not isinstance(proposed, list):
        raise ValueError("Invalid approved manifest")

    if len(proposed) > limit:
        raise ValueError("Approved manifest exceeds deletion limit")

    current = {
        int(run["id"]): run for run in candidates
    }

    selected = []
    seen = set()

    for item in proposed:
        rid = int(item["id"])

        if rid in seen:
            raise ValueError("Duplicate approved run ID")

        seen.add(rid)

        if rid in PROTECTED_RUN_IDS:
            raise ValueError("Protected run in approved manifest")

        if rid not in current:
            raise ValueError(
                "Approved run no longer eligible: {}".format(rid)
            )

        if item != run_identity(current[rid]):
            raise ValueError(
                "Approved run identity changed: {}".format(rid)
            )

        selected.append(current[rid])

    return selected


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="actually DELETE eligible runs")
    parser.add_argument("--success-min-age-days", type=int, default=14)
    parser.add_argument("--cancelled-min-age-days", type=int, default=7)
    parser.add_argument("--failed-min-age-days", type=int, default=30)
    parser.add_argument("--keep-per-branch-workflow", type=int, default=5)
    parser.add_argument("--max-delete", type=int, default=150,
                        help="maximum deletes in one invocation, for rate-limit safety")
    parser.add_argument("--manifest", default="/tmp/sphere-github-actions-hygiene.json",
                        help="local audit report; does not include auth tokens")
    parser.add_argument(
        "--approved-manifest",
        help="Explicitly reviewed audit manifest required for apply"
    )
    parser.add_argument(
        "--backup-dir",
        help="Secure local log backup directory"
    )
    args = parser.parse_args()

    if args.apply and not args.backup_dir:
        parser.error("--apply requires --backup-dir")


    if args.apply and not args.approved_manifest:
        parser.error("--apply requires --approved-manifest")

    if args.apply and (
        Path(args.approved_manifest).resolve()
        == Path(args.manifest).resolve()
    ):
        parser.error(
            "Approved manifest and execution report must differ"
        )

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
        artifact_ids, release_sha = collect_protections()

        filtered = []

        for run in candidates:
            reason = evidence_reason(
                run, artifact_ids, release_sha
            )

            if reason:
                skipped[reason] = skipped.get(reason, 0) + 1
            else:
                filtered.append(run)

        candidates = filtered

        if args.apply:
            approved = json.loads(
                Path(args.approved_manifest).read_text(
                    encoding="utf-8"
                )
            )
            proposed = approved_candidates(
                approved, candidates, args.max_delete
            )
        else:
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
                run_identity(run)
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
        active = set()
        for pr in open_prs:
            for side in ("head", "base"):
                name = own_branch(pr, side)
                if name:
                    active.add(name)
        active.update(KEEP)
        active.add(repository["default_branch"])
        failures = 0
        for run in proposed:
            rid = int(run["id"])
            if rid in PROTECTED_RUN_IDS:
                failures += 1
                report["errors"].append({
                    "id": rid, "reason": "protected evidence"
                })
                continue
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
                same = same and (
                    run_identity(live) == run_identity(run)
                )
                if not same:
                    report["errors"].append({"id": rid, "reason": "run changed"})
                    failures += 1
                    continue
                current_artifacts, current_sha = collect_protections()

                reason = evidence_reason(
                    live, current_artifacts, current_sha
                )

                if reason:
                    raise RuntimeError(reason)

                backup = backup_run_log(
                    rid, args.backup_dir
                )

                print("BACKUP_LOG={}".format(backup))

                current_repo = api(f"repos/{REPO}")
                current_prs = list_pages("pulls?state=open")

                current_active = set(KEEP)
                current_active.add(
                    current_repo["default_branch"]
                )

                for pr in current_prs:
                    for side in ("head", "base"):
                        name = own_branch(pr, side)
                        if name:
                            current_active.add(name)

                current = api(
                    f"repos/{REPO}/actions/runs/{rid}"
                )

                if (
                    current.get("status") != "completed"
                    or run_identity(current) != run_identity(live)
                    or current["head_branch"] in current_active
                ):
                    raise RuntimeError(
                        "Run changed or branch now active"
                    )

                final_artifacts, final_sha = collect_protections()

                reason = evidence_reason(
                    current, final_artifacts, final_sha
                )

                if reason:
                    raise RuntimeError(reason)

                api(f"repos/{REPO}/actions/runs/{rid}", method="DELETE")
                report["deleted"].append(rid)
                print(f"DELETED_RUN={rid}")
            except (RuntimeError, OSError, subprocess.CalledProcessError) as error:
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

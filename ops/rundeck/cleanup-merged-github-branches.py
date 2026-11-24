#!/usr/bin/env python3
"""Safely prune stale GitHub branches from previously merged SPHERE PRs.

Default: audit/dry-run only.
Apply:   python3 ops/rundeck/cleanup-merged-github-branches.py --apply --approved-manifest REVIEWED.json

Requires an authenticated GitHub CLI (gh) with repository Contents write access.
Never deletes active environment/legacy branches, open PR heads/bases,
closed-but-unmerged work, protected branches, or branches with unmatched PR SHAs.
This script DOES NOT touch local branches, services, databases, DEV or PROD.
"""

import argparse
from pathlib import Path
import json
import shutil
import subprocess
import sys
from urllib.parse import quote

REPO = "finuxpert/sphere"
KEEP = frozenset({
    "rundeck-sphere-dev", "rundeck-sphere-prod", "sphere-dev", "sphere-prod",
})


def api(path: str, *, method: str = "GET") -> object:
    command = [
        "gh", "api", "--method", method,
        "-H", "Accept: application/vnd.github+json",
        path,
    ]
    result = subprocess.run(command, check=False, universal_newlines=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(
            f"GitHub {method} {path} failed ({result.returncode}): "
            f"{result.stderr.strip()[:500]}"
        )
    if method == "DELETE":
        return None
    return json.loads(result.stdout)


def pages(path: str) -> list:
    rows = []
    for number in range(1, 101):
        batch = api(f"repos/{REPO}/{path}&page={number}")
        if not isinstance(batch, list):
            raise RuntimeError(f"Unexpected GitHub API pagination for {path}")
        rows.extend(batch)
        if len(batch) < 100:
            return rows
    raise RuntimeError("Refusing incomplete pagination (>100 pages)")


def own_ref(pr: dict, field: str) -> str:
    obj = pr.get(field) or {}
    if (obj.get("repo") or {}).get("full_name") != REPO:
        return None
    return obj.get("ref")


def assess(branches: list, prs: list, default: str):
    active = set(KEEP) | {default}
    open_prs = [pr for pr in prs if pr.get("state") == "open"]
    for pr in open_prs:
        for field in ("head", "base"):
            ref = own_ref(pr, field)
            if ref:
                active.add(ref)

    merged_by_head = {}
    closed_unmerged = set()
    for pr in prs:
        head = own_ref(pr, "head")
        if not head:
            continue
        if pr.get("state") == "closed" and pr.get("merged_at"):
            merged_by_head.setdefault(head, []).append(pr)
        elif not pr.get("merged_at"):
            closed_unmerged.add(head)

    safe = []
    retained = []
    for row in sorted(branches, key=lambda item: item["name"]):
        name = row["name"]
        branch_sha = row["commit"]["sha"]
        histories = merged_by_head.get(name, [])
        reasons = []
        if name in active:
            reasons.append("environment/default/open-PR head or base")
        if row.get("protected"):
            reasons.append("protected")
        if name in closed_unmerged:
            reasons.append("closed unmerged PR")
        if not histories:
            reasons.append("no merged same-repo PR")
        if histories and any(pr["head"]["sha"] != branch_sha for pr in histories):
            reasons.append("branch SHA differs from recorded merged PR head")
        if reasons:
            retained.append((name, ", ".join(reasons)))
        else:
            safe.append((name, branch_sha, tuple(pr["number"] for pr in histories)))
    return safe, retained


def branch_identity(item):
    name, sha, numbers = item
    return {
        "name": name,
        "sha": sha,
        "pull_requests": sorted(numbers),
    }


def approved_branches(manifest, candidates, limit):
    if manifest.get("repository") != REPO:
        raise ValueError("Repository mismatch")

    if manifest.get("mode") != "dry_run":
        raise ValueError("Manifest must originate from audit")

    proposed = manifest.get("proposed")

    if not isinstance(proposed, list):
        raise ValueError("Invalid branch manifest")

    if len(proposed) > limit:
        raise ValueError("Deletion limit exceeded")

    current = {
        item[0]: item for item in candidates
    }

    selected = []
    seen = set()

    for item in proposed:
        name = item["name"]

        if name in seen or name in KEEP:
            raise ValueError("Duplicate or protected branch")

        seen.add(name)

        if name not in current:
            raise ValueError("Branch no longer eligible: " + name)

        if item != branch_identity(current[name]):
            raise ValueError("Branch identity changed: " + name)

        selected.append(current[name])

    return selected


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true",
                        help="actually delete only the newly re-verified merged branches")
    parser.add_argument(
        "--manifest",
        default="/tmp/sphere-branch-hygiene.json"
    )
    parser.add_argument("--approved-manifest")
    parser.add_argument("--max-delete", type=int, default=20)

    args = parser.parse_args()

    if args.max_delete < 1:
        parser.error("Deletion limit must be positive")

    if args.apply and not args.approved_manifest:
        parser.error("--apply requires --approved-manifest")

    if args.apply and (
        Path(args.manifest).resolve()
        == Path(args.approved_manifest).resolve()
    ):
        parser.error("Input and output manifests must differ")

    if not shutil.which("gh"):
        print("BLOCKED: GitHub CLI (gh) is not installed; nothing deleted.", file=sys.stderr)
        return 2
    try:
        repo = api(f"repos/{REPO}")
        branches = pages("branches?per_page=100")
        prs = pages("pulls?state=all&per_page=100")
        safe, retained = assess(branches, prs, repo["default_branch"])
        print(f"REPO={REPO} DEFAULT={repo['default_branch']}")
        print(f"TOTAL_BRANCHES={len(branches)} ELIGIBLE={len(safe)} RETAINED={len(retained)}")
        print("\nRETAINED (no deletion):")
        for name, reason in retained:
            print(f"  KEEP {name} [{reason}]")
        print("\nMERGED-PR CLEANUP CANDIDATES:")
        for name, sha, numbers in safe:
            print(f"  {'DELETE' if args.apply else 'DRY_RUN'} {name} "
                  f"sha={sha[:12]} PR={','.join(map(str, numbers))}")
        if args.apply:
            approved = json.loads(
                Path(args.approved_manifest).read_text()
            )

            safe = approved_branches(
                approved, safe, args.max_delete
            )
        else:
            safe = safe[:args.max_delete]

        report = {
            "repository": REPO,
            "mode": "apply" if args.apply else "dry_run",
            "proposed": [
                branch_identity(item) for item in safe
            ],
            "deleted": [],
            "skipped": [],
        }

        Path(args.manifest).write_text(
            json.dumps(report, indent=2)
        )

        print("MANIFEST={}".format(args.manifest))

        if not args.apply:
            print("\nFINAL=DRY_RUN NO_DELETION")
            print("To apply after reviewing: python3 "
                  "ops/rundeck/cleanup-merged-github-branches.py --apply --approved-manifest REVIEWED.json")
            return 0

        deleted = []
        skipped = []
        for name, sha, numbers in safe:
            encoded = quote(name, safe="/")
            # Guard against changes since the initial inventory.
            current_repo = api(f"repos/{REPO}")

            if name == current_repo["default_branch"] or name in KEEP:
                skipped.append((name, "protected/default branch"))
                continue

            latest = api(f"repos/{REPO}/branches/{encoded}")
            if latest["commit"]["sha"] != sha or latest.get("protected"):
                skipped.append((name, "branch changed or protected"))
                continue
            # Re-check PR state/head SHA and ensure no open PR was created.
            recent_prs = pages("pulls?state=open&per_page=100")
            if any(name in (own_ref(pr, "head"), own_ref(pr, "base"))
                   for pr in recent_prs):
                skipped.append((name, "now used by open PR"))
                continue
            verified = True
            for number in numbers:
                pr = api(f"repos/{REPO}/pulls/{number}")
                if (pr.get("state") != "closed" or not pr.get("merged_at")
                        or own_ref(pr, "head") != name
                        or pr["head"]["sha"] != sha):
                    verified = False
                    break
            if not verified:
                skipped.append((name, "merged PR identity changed"))
                continue
            try:
                api(f"repos/{REPO}/git/refs/heads/{encoded}", method="DELETE")
                deleted.append(name)
                report["deleted"] = deleted
                report["skipped"] = skipped

                Path(args.manifest).write_text(
                    json.dumps(report, indent=2)
                )
                print(f"DELETED={name}")
            except RuntimeError as error:
                skipped.append((name, str(error)))
                print(f"SKIPPED={name} reason={error}", file=sys.stderr)
        print(f"\nFINAL=APPLY DELETED={len(deleted)} SKIPPED={len(skipped)}")
        report["deleted"] = deleted
        report["skipped"] = skipped

        Path(args.manifest).write_text(
            json.dumps(report, indent=2)
        )

        return 1 if skipped else 0
    except (RuntimeError, KeyError, ValueError, OSError) as error:
        print(f"BLOCKED: {error}. No further deletion attempted.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

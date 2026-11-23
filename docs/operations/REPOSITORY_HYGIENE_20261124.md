# SPHERE — GitHub branch and documentation hygiene

**Audit date:** 24 November 2026 (WIB)  
**Repository:** `finuxpert/sphere`  
**Scope:** GitHub repository maintenance only; **no server deployment, database write or PROD promotion**.

## Branch inventory (audited snapshot)

| Classification | Branches | Policy |
|---|---:|---|
| Active runtime/environment and legacy branches | 4 | **KEEP:** `rundeck-sphere-dev`, `rundeck-sphere-prod`, `sphere-dev`, `sphere-prod` |
| Referenced by seven open PRs | 8 | **KEEP** their heads and bases, including `perf/dev-report-split-distinct-20261105` (base of open PR #96) |
| Closed but **not merged** | 2 | **KEEP:** `refactor/canonical-css-cleanup` (#67) and `refactor/dev-reports-css-modularize-20261123` (#117) |
| Merged PR heads with unchanged tip and no open PR dependency | 40 | **ELIGIBLE** for cleanup after fresh live checks |
| **Total at audit** | **54** | No deletion has been performed by this documentation change |

The eight open-PR-dependent branches correspond to open PRs #95, #96, #101, #102, #103, #108 and #109 (seven PRs, one additional base branch). Do not delete the open PR base for #108 or #96 simply because another PR against it is merged.

**Important:** This is a point-in-time count. After merging this documentation PR, the number of merged-PR cleanup candidates can increase by one because the hygiene branch itself becomes eligible. Re-run the script; do not trust a frozen count.

## How to safely delete eligible branches

The approved script uses the GitHub CLI **only on the operator's authenticated machine** and reads live GitHub state. No credential is stored in Git. Its default mode has no write action.

```bash
cd /root/rundeck-sphere-dev
git fetch origin rundeck-sphere-dev
git merge --ff-only origin/rundeck-sphere-dev

# Requires gh authenticated with Contents write permission
gh auth status
python3 ops/rundeck/cleanup-merged-github-branches.py

# Review DRY_RUN names and KEEP rules. Then, only with operator approval:
python3 ops/rundeck/cleanup-merged-github-branches.py --apply
```

Run `--apply` only when deletion is intended. The script fetches **all paginated branches and PRs**, keeps active/default/legacy refs and all open PR heads/bases, keeps closed-unmerged PR branches, requires an associated merged PR and matching PR head SHA, and verifies each branch immediately before DELETE. Protected or changed refs are refused. A deletion failure is reported and never bypassed.

For a workstation without `gh`, use GitHub's *Branches* page manually after checking each PR and base dependency. Do not place tokens in scripts, chat, or command arguments. Never replace deletion with force-reset or move a reference to a different commit.

## Canonical documentation ownership

| Class | Canonical reference | Rule |
|---|---|---|
| Project and architecture | [README](../../README.md), [Current Features & Flow](../CURRENT-FLOW-AND-FEATURES.md) | Describes source-level behavior; never claims an unverified live SHA |
| Operations / deployment | [Rundeck development](rundeck-development.md) | Guarded DEV release, migration diff, rollback and environment isolation |
| DEV maintenance / PROD eligibility | [DEV-first gates](../../ops/rundeck/DEV_FIRST_MAINTENANCE_AND_PROD_PROMOTION.md) | Latest maintenance decision and final operator QA |
| Frontend Reports refactor | [Phase 1](../../ops/rundeck/REPORT_FRONTEND_REFACTOR_PHASE1_20261123.md), [Phase 2](../../ops/rundeck/REPORT_FRONTEND_REFACTOR_PHASE2_20261123.md) | Historical implementation + CI evidence |
| Backend Reports refactor | [WIB periods](../../ops/rundeck/REPORT_BACKEND_PERIOD_REFACTOR_20261123.md), [evaluation view](../../ops/rundeck/REPORT_BACKEND_EVALUATION_VIEW_REFACTOR_20261123.md) | Source merged, backend not yet operator-proven active |
| SQL and snapshot | [Snapshot rollout](../../ops/rundeck/REPORT_PERSISTENT_SNAPSHOT_DEV_ROLLOUT.md), [split DISTINCT](../../ops/rundeck/REPORT_SPLIT_DISTINCT_DEV_ROLLOUT.md), [Issue #111](https://github.com/finuxpert/sphere/issues/111) | Real measurements/plan checks are required before tuning |
| Recovery / past checkpoints | [Archive](../archive/), [release notes](../releases/), [3 Nov v1.35.20 checkpoint](SPHERE_V13520_MAINTENANCE_CHECKPOINT.md) | Historical evidence, **not** the current runtime |
| Navigation | [Documentation Index](../DOCUMENTATION-INDEX.md) | Primary entry point; update when canonical references change |

## Latest evidenced change state at audit

- GitHub `rundeck-sphere-dev` includes Reports refactor PRs #115/#116, backend pure-helper PRs #118/#119, and maintenance runbook PR #120. Current source HEAD is **not interchangeable** with the deployed release SHA.
- Last operator-confirmed DEV **UI-only** release: `5978b757eda4e85098d680c93f2a212dd6fadac7` with `BACKEND=UNCHANGED`, `POLLERS=NOT_RESTARTED`, `PROD=UNCHANGED`.
- PR #117 is **closed and unmerged** because CSS bundle size exceeded the existing budget; the old CSS remains authoritative. PR #67 is also closed/unmerged and retained for review.
- Backend source refactors are **not** confirmed deployed; next release containing backend changes requires a guarded DEV full-stack path, independent migration review and rollback validation.
- The requested sequencing is **finish safe DEV cleanup first; keep automated CI gates throughout; perform one consolidated manual live/visual QA at the end**. PROD remains **ON HOLD**.

## Documentation cleanup policy

- Update entrypoint links and current-state statements; preserve valuable incident reports, evidence and dated release notes rather than deleting audit history.
- Label dated evidence as historical; never copy old SHAs as current web/API runtime facts.
- Avoid renaming source/versioned CSS files or deleting tests without import/cascade and bundle parity QA.
- Clean up only branches with merged PRs and no current dependencies; branch deletion **does not delete the PR, audit record, or merged changes**.

# SPHERE - Repository Hygiene Closeout

Date: 24 November 2026 (WIB)
Repository: finuxpert/sphere

## Phase 2 final closeout

Status: COMPLETE / PASS

| Metric | Before | After |
|---|---:|---:|
| Remote branches | 57 | 6 |
| Open draft PRs | 7 | 4 |
| Active workflows | 7 | 5 |
| Actions runs | 977 | 369 |
| Branches deleted | 0 | 51 |
| Actions runs deleted | 0 | 611 |
| New archive tags | 0 | 8 |
| Total archive tags | - | 15 |
| Evidence storage | - | 47 MB |

### Actions execution

- Phase 1: 17 deleted.
- Phase 2 cancelled: 195 deleted.
- Phase 2 failure: 270 deleted, 1 error.
- Phase 2 success: 129 deleted.
- Final: 267 success, 67 failure, 35 cancelled.
- Run 41592947150 retained after error.
- All 399 deleted Phase 2 failure/success runs passed log backup.
- Net reduction: 608 runs; three additional runs appeared.

### Final repository structure

Default branch: rundeck-sphere-dev.

Retained branches:

- rundeck-sphere-dev
- rundeck-sphere-prod
- feat/remote-browser-v030-gated
- fix/dev-report-availability-evidence-20261106
- fix/prod-storage-explicit-available-20261107
- perf/monitoring-progressive-load-20261118

Open draft PRs: #101, #102, #108, #109.

PR #103 archived and consolidated into #108.
PR #95 and #96 archived and closed.
PR #67 and #117 remain closed and unmerged.

### Workflow status

Active: 405724816, 398084766, 405672519,
409004726, 408314957.

Disabled manually: 408746624, 408714400.

No workflow definitions deleted.

### Permanent hygiene tooling

- Python 3.6.8 compatible.
- Audit-only default.
- Separate branch and Actions apply modes.
- Approved manifests mandatory.
- Run and branch identity validation.
- 30 protected Actions evidence IDs.
- PROD workflow and branch protection.
- Artifact and release SHA protection.
- Mandatory backup before Actions deletion.
- Post-backup revalidation.
- Serial execution for routine maintenance.
- Offline and mocked apply QA PASS.
- Remote CI and merge remain pending.

### Default retention policy

- Success: 14 days.
- Cancelled: 7 days.
- Failure: 30 days.
- Keep five latest runs per workflow/branch.
- Maximum branch deletions: 20.
- Maximum Actions deletions: 150.
- Routine cleanup: merged eligible PR branches only.
- Active DEV/PROD history retained.

### Operator commands

Audit:

    bash ops/rundeck/github-hygiene.sh --audit

Branch apply, future approved maintenance only:

    bash ops/rundeck/github-hygiene.sh --apply-branches --approved-manifest branches-approved.json

Actions apply, future approved maintenance only:

    bash ops/rundeck/github-hygiene.sh --apply-actions --approved-manifest actions-approved.json

Do not run apply during this closeout.

### Evidence location

Host: mail
User: sadmin

/home/sadmin/sphere-hygiene-evidence-20261124

Preserve local evidence securely.
Do not commit raw logs or credentials.

### Final operational status

- REPOSITORY_CLEANUP=PASS
- ADDITIONAL_CLEANUP=NOT_REQUIRED
- DEPLOYMENT=NONE
- RESTART=NONE
- DATABASE_CHANGES=NONE
- PROD_RUNTIME=UNCHANGED

---

## Historical Phase 1 checkpoint

The following historical content is superseded by
the Phase 2 inventory and tooling status above.

# SPHERE — Repository hygiene final closeout

**Date:** 24 November 2026 (WIB)  
**Repository:** `finuxpert/sphere`  
**Source branch:** `rundeck-sphere-dev`  
**Operational status:** **COMPLETE / PASS**  
**Scope:** GitHub housekeeping only. No application deployment, restart, database migration or PROD promotion.

## 1. Verified results

These are the operator-verified counts at cleanup closeout, before the documentation PR and its CI runs. Subsequent normal repository activity may change them.

| Metric | Before | After |
|---|---:|---:|
| Remote branches | 57 | 14 |
| Eligible branches | 43 | 0 |
| Branches deleted | 0 | 43 |
| Branch deletion skips | — | 0 |
| Actions runs | 977 | 960 |
| Retention-eligible Actions runs | 36 | 19 (intentionally retained) |
| Actions runs deleted | 0 | 17 |
| Actions deletion errors | — | 0 |
| Existing open draft PRs | 7 | 7 |
| Active workflows | 7 | 7 at final verification (initial historical estimate of 4 superseded) |

Branch reduction: 75.44%. Actions history reduction: 1.74%.

Operator output:

```text
FINAL=APPLY DELETED=43 SKIPPED=0
TOTAL_BRANCHES=14 ELIGIBLE=0 RETAINED=14
ALL_CANDIDATES=36
APPROVED_RUNS=17
EXCLUDED_RUNS=19
FINAL=APPLY DELETED=17 ERRORS=0 REMAINING_ESTIMATE=0
VERIFICATION=PASS
DEPLOYMENT=NONE
RESTART=NONE
DATABASE_CHANGES=NONE
PROD_RUNTIME=UNCHANGED
```

REMAINING_ESTIMATE=0 refers only to the approved Actions allowlist, not all repository retention candidates.

## 2. Source checkpoint and operator environment

- PRs #121–123 established documentation, hygiene scripts and operator handoff.
- [PR #124](https://github.com/finuxpert/sphere/pull/124) was squash merged at 2026-11-24 02:26:25 UTC (09:26:25 WIB); its remote temporary branch was deleted.
- Operator verified local and origin DEV HEAD at `b1412c03855c72ce0f3200798e24a7cdf4c00fb4`, with a clean working tree. This is the last operator-confirmed synchronization checkpoint, not a claim about future source HEAD or deployed runtime.
- PR #124 CI was pending in the last supplied check output. Merge is confirmed; final CI success is not evidenced.
- Administrative host: `mail`; user: `sadmin`; working clone: `/home/sadmin/sphere-hygiene.puI4zt`.
- AlmaLinux 8.10, Python 3.6.8. GitHub CLI authenticated as finuxpert; no reinstall or reauthentication was needed.
- Original wrapper audit failed with unsupported future annotations. Temporary Python 3.6-compatible copies in `/tmp/sphere-hygiene-py36.A9CJk0` passed audit and execution. System Python and repository script source were unchanged.

## 3. Retained branches and PRs

| Class | Retained refs |
|---|---|
| Environment/default/legacy | `rundeck-sphere-dev`, `rundeck-sphere-prod`, `sphere-dev`, `sphere-prod` (default) |
| Open PR dependencies | `feat/jumphost-dev-scaffold-v021-20261113`, `feat/remote-browser-v030-gated`, `fix/dev-report-availability-evidence-20261106`, `fix/prod-storage-explicit-available-20261107`, `infra/dev-timescaledb-extension-preflight-20261106`, `perf/dev-report-split-distinct-20261105`, `perf/dev-timescale-weekly-shadow-poc-20261106`, `perf/monitoring-progressive-load-20261118` |
| Closed, unmerged | `refactor/canonical-css-cleanup` (#67), `refactor/dev-reports-css-modularize-20261123` (#117) |

Existing open draft PRs preserved: #95, #96, #101, #102, #103, #108, #109. Do not remove their heads or bases.

## 4. Active workflow registry

All seven entries below were active in final operator output. No workflow deletion or disabling was performed.

| Workflow | ID |
|---|---:|
| SPHERE DEV maintenance parity QA | 405724816 |
| SPHERE DEV TimescaleDB shadow POC guard | 408746624 |
| SPHERE DEV TimescaleDB extension-only guard | 408714400 |
| SPHERE DEV UI QA | 398084766 |
| SPHERE PROD compatibility preflight | 405672519 |
| SPHERE DEV persistent calendar report snapshots QA | 409004726 |
| SPHERE DEV report split-distinct PostgreSQL parity | 408314957 |

## 5. Explicit Actions evidence retention

The following 19 run IDs remain intentionally excluded from deletion. This is an operator policy, not yet a permanent automated script guard.

| Evidence group | Run IDs |
|---|---|
| PROD compatibility | 41635061571, 41635466415, 41635533171 |
| PROD API readiness | 41636548615, 41636627588 |
| Reports storage evidence | 41810587743 |
| DEV persistent snapshots | 42173545297, 42173545403, 42173545445, 42173798470, 42173798721, 42173798753, 42173807549, 42173807558, 42173807580 |
| PROD calendar snapshots | 42187428593, 42188871719, 42188935393 |
| Hourly report time axis | 43678656160 |

Never run unrestricted Actions apply against these candidates. Deleting a run irreversibly removes its logs and associated artifacts.

## 6. Operator evidence locations

On host mail, under sadmin:

- `/home/sadmin/sphere-branch-cleanup-20261124-091211.log` — branch deletion names and counters.
- `/home/sadmin/sphere-post-cleanup-20261124-091705.log` — post-branch audit.
- `/home/sadmin/sphere-hygiene-evidence-20261124/actions-before.json` — original Actions candidate manifest.
- `/home/sadmin/sphere-hygiene-evidence-20261124/actions-apply.json` and `actions-apply.log` — selective execution evidence.
- `/home/sadmin/sphere-hygiene-evidence-20261124/actions-after.json` and `final-verification.log` — final retention and inventory.

These are operator-local files, not claimed to be uploaded to GitHub. Preserve securely; never commit credentials.

## 7. Future maintenance guardrails (not a pending cleanup)

Operational cleanup is closed. **Do not rerun apply as part of this checkpoint.**

For a future independently approved maintenance cycle:
- Use fresh paginated inventories and a clean DEV checkout. Run audit first using a supported Python interpreter; the current source requires modern Python (3.10+ recommended), and is not directly compatible with the operator's Python 3.6.8.
- Existing entrypoint: `ops/rundeck/github-hygiene.sh`; helpers: `cleanup-merged-github-branches.py` and `cleanup-github-actions-runs.py` in the same directory.
- Branch deletion requires a merged same-repository PR with matching tip SHA, no active PR dependency and no protected/default/environment ref. Preserve closed-unmerged work; recheck before DELETE.
- Actions defaults: success 14 days, cancelled/skipped 7 days, failures 30 days; keep manual dispatch, incomplete runs, latest per branch/workflow, active and unmerged work. Preserve the explicit 19 IDs and review other incident/release evidence before approving a bounded allowlist. Default maximum batch is 150. No unrestricted apply until evidence protection is implemented and validated.
- Record actual before/after counts, deleted/skipped/errors and manifest. Do not disable workflows, rewrite refs, bypass CI or touch runtime systems.

## 8. Preventive improvements — separate source work

| Priority | Task | Status |
|---|---|---|
| P1 | Implement explicit protected Actions run IDs and regression coverage | Pending |
| P2 | Make hygiene scripts compatible with Python 3.6.8 or provide a supported isolated interpreter path; test both audit and mocked apply | Pending |

These items do not reopen completed cleanup. No permanent fix, deployment or runtime QA is claimed. Use a reviewed DEV maintenance PR; no PROD changes.

## 9. Read-only verification commands

Only if fresh inventory is needed; no cleanup execution.

```bash
cd /home/sadmin/sphere-hygiene.puI4zt
git status --short
git log -1 --oneline
gh pr view 124 -R finuxpert/sphere --json state,mergedAt,mergeCommit
gh pr checks 124 -R finuxpert/sphere
gh api --paginate 'repos/finuxpert/sphere/branches?per_page=100' --jq '.[].name'
gh pr list -R finuxpert/sphere --state open --limit 100
gh workflow list -R finuxpert/sphere --all
gh api 'repos/finuxpert/sphere/actions/runs?per_page=1' --jq '.total_count'
```

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

## Historical application source/runtime context (not revalidated during hygiene)

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

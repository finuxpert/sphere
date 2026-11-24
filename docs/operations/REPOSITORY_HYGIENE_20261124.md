# SPHERE — GitHub branch and documentation hygiene

**Audit date:** 24 November 2026 (WIB)  
**Repository:** `finuxpert/sphere`  
**Scope:** GitHub repository maintenance only; **no server deployment, database write or PROD promotion**.

## Final operator execution — 24 November 2026 WIB (supersedes earlier pending status)

- Host mail, user sadmin, AlmaLinux 8.10, Python 3.6.8. Original wrapper audit blocked by unsupported future annotations. Temporary compatibility copies in /tmp/sphere-hygiene-py36.A9CJk0 successfully audited and applied; system Python and repository source were unchanged.
- Branch audit: 57 total, 43 eligible, 14 retained. Apply returned FINAL=APPLY DELETED=43 SKIPPED=0. Final audit displayed no candidates; final inventory explicitly confirmed TOTAL_BRANCHES=14 ELIGIBLE=0 RETAINED=14.
- Actions: 977 before, 960 after; 36 original candidates, 19 remain deliberately retained. Operator apply log confirmed ALL_CANDIDATES=36 APPROVED_RUNS=17 EXCLUDED_RUNS=19 and FINAL=APPLY DELETED=17 ERRORS=0 REMAINING_ESTIMATE=0 (allowlist scope).
- Seven existing draft PRs remain: #95, #96, #101, #102, #103, #108, #109. Final GitHub workflow registry lists seven active workflows (not four): maintenance parity QA, TimescaleDB shadow POC guard, TimescaleDB extension-only guard, DEV UI QA, PROD compatibility preflight, persistent calendar snapshots QA, split-distinct PostgreSQL parity.
- Final operator verification printed VERIFICATION=PASS, DEPLOYMENT=NONE, PROD_RUNTIME=UNCHANGED. Branch apply also reported RESTART=NONE and DATABASE_CHANGES=NONE.
- Evidence: /home/sadmin/sphere-branch-cleanup-20261124-091211.log; /home/sadmin/sphere-post-cleanup-20261124-091705.log; /home/sadmin/sphere-hygiene-evidence-20261124/{actions-before.json,actions-apply.json,actions-apply.log,actions-after.json,final-verification.log}.
- Retain these 19 run IDs in future maintenance: 41635061571, 41635466415, 41635533171, 41636548615, 41636627588, 41810587743, 42173545297, 42173545403, 42173545445, 42173798470, 42173798721, 42173798753, 42173807549, 42173807558, 42173807580, 42187428593, 42188871719, 42188935393, 43678656160. They cover PROD readiness/compatibility, storage evidence, persistent snapshots, and hourly time axis. Do not run unrestricted Actions apply against these candidates.
- Permanent Python compatibility and explicit evidence exclusion are follow-up source work; no claim of completed permanent fix. No further deletion is requested in this checkpoint. New documentation PR/CI may change subsequent inventory counts.

## Operator handoff — last observed shell state, 24 Nov 2026 WIB

**Most recent operator evidence (supersedes older examples below):**
- Machine: `mail`, login: `sadmin`, shell prompt `[sadmin@mail sphere-hygiene.puI4zt]# SPHERE — GitHub branch and documentation hygiene

**Audit date:** 24 November 2026 (WIB)  
**Repository:** `finuxpert/sphere`  
.
- GitHub CLI **is installed and authenticated for `sadmin`** as GitHub user `finuxpert`. `gh auth status` showed git protocol HTTPS and scopes `repo`, `workflow`, `read:org`, `gist`. **Never paste an unmasked token.**
- Working clone created successfully under `/home/sadmin/sphere-hygiene.puI4zt`, using `git clone --depth 1 --branch rundeck-sphere-dev --single-branch https://github.com/finuxpert/sphere.git "$WORKDIR"`. `git branch --show-current` previously reported `rundeck-sphere-dev`. `ops/rundeck/github-hygiene.sh` is present in the cloned GitHub source.
- Earlier attempts as `root` on `mail` from `~` failed because `ops/rundeck/github-hygiene.sh` was not under the current directory. `gh` was also **not** present/authenticated in the `root` shell. These are **not** problems in the `sadmin` shell; do not reinstall or reauthenticate `sadmin`.
- **Last observed step:** `sadmin` ran `gh auth status` successfully after cloning. There is **no operator-provided output** showing `bash ops/rundeck/github-hygiene.sh --audit` or `--apply` succeeding yet. **No GitHub branch or Actions run deletion is confirmed.** Do not mark cleanup complete until actual deletion output and post-cleanup GitHub counts have been verified.
- User intent: eliminate stale merged-PR branches and expendable Actions run history, preserve open PRs and default/DEV/PROD/legacy refs, preserve audit evidence under retention. No application deployment or final functional QA is requested by this housekeeping activity.

**Resume directly here (as `sadmin`, not `root`):**

```bash
cd /home/sadmin/sphere-hygiene.puI4zt
pwd
git branch --show-current
git status --short
gh auth status

# First show eligibility; no deletion in audit mode:
bash ops/rundeck/github-hygiene.sh --audit

# Only after reviewing the reported candidate list and audit manifest:
bash ops/rundeck/github-hygiene.sh --apply --max-delete=150

# Verify remaining branches, including pagination:
gh api --paginate 'repos/finuxpert/sphere/branches?per_page=100' --jq '.[].name'
```

If the clone is no longer present, locate it under `/home/sadmin/sphere-hygiene.*` or re-clone as `sadmin` before running the script. Do **not** run the relative path from `~`, change PROD branches, disable CI, or restart services. Report actual `TOTAL_BRANCHES`, `ELIGIBLE`, `CANDIDATE_RUNS`, `DELETED`, `SKIPPED` and `FINAL` from the tools; values can differ from the historical snapshots below. The script requires the source working tree to be clean.

**Known repository checkpoint before operator-side deletion:** integrated DEV source at `6ddc4aa658c3ff5b90dc947d8463cfa94770f4c4` (PR #122 merged; CI passed). This GitHub commit does **not** prove any server deployment. Earlier GitHub audit counted 56 remote branches, 42 merged-PR cleanup candidates, 14 to keep, 7 open PRs, and 4 active Actions workflows; GitHub run history was about 976. These are audit-time estimates only. Subsequent documentation commits may add temporary branches.


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

## GitHub Actions cleanup — audit on 24 Nov 2026

- **974** GitHub Actions runs were returned by the live repository run listing, largely accumulated during repeated DEV QA/PR iterations.
- All **four** workflow definitions under `.github/workflows/` are currently used and must remain enabled:
  - `sphere-dev-ui-qa.yml`: DEV push build, browser checks, backend regression and offline artifact;
  - `sphere-dev-maintenance-qa.yml`: DEV pull-request parity and reports/PDF/backend regression;
  - `sphere-report-snapshot-qa.yml`: source-scoped persistent snapshot checks;
  - `sphere-report-split-distinct-parity.yml`: PostgreSQL split DISTINCT parity on impacted code.
- No workflow YAML file is obsolete just because a run completed, failed or was cancelled. Do not disable these tests to reduce history.
- Run retention for generated PDF artifacts is already **3 days** for maintenance QA and **14 days** for DEV offline release; those artifacts are evidence for their valid QA window.

### Selective historical run cleanup

Use the dedicated script for **completed GitHub Actions runs attached to merged PR branches no longer in active use**; it never prunes runs on active DEV/PROD/legacy branches, open PR heads/bases, or closed-but-unmerged work. It preserves each merged branch's most recent run per workflow, all manually dispatched runs, and recent failure history. Actual deletion irreversibly removes that run's logs and associated artifacts.

```bash
# On a trusted administrative machine with GitHub CLI already installed:
cd /root/rundeck-sphere-dev
gh auth status

# Inspect and store local JSON manifest, no deletions by default
python3 ops/rundeck/cleanup-github-actions-runs.py

# Only after checking the manifest and authorized cleanup scope:
python3 ops/rundeck/cleanup-github-actions-runs.py --apply --max-delete 150
```

Defaults: successful runs at least **14 days** old, cancelled/skipped at least **7 days** old, failed at least **30 days** old. Manual workflow dispatches, incomplete runs and each branch/workflow's latest run are preserved; the script writes an audit manifest under `/tmp` and rechecks run identities before DELETE. Execute additional batches only if desired; do not automatically delete recent failure evidence or Actions artifacts still needed for a release.

### GitHub CLI dependency and credentials

**Older root-shell limitation, now resolved for the operator's `sadmin` shell:** `root@mail` previously reported `gh: command not found`, but `sadmin@mail` subsequently confirmed an authenticated `gh` login as `finuxpert`. Use that already-authenticated `sadmin` session and its cloned repository rather than installing or signing in again. Deleting branch refs requires Contents write permission, and deleting Actions runs requires Actions write permission; verify permissions from actual API operations and never assume success from listed token scopes alone. Do not store GitHub tokens in repository files, logs, or chat.

Do not delete/rewrite GitHub Actions run history linked to active migrations, deploy approvals or incidents without an explicitly reviewed retention decision.

## One entrypoint for the complete audit / cleanup

A single guarded entrypoint calls the branch cleanup and Actions-run cleanup in order, but **defaults to audit-only**:

```bash
cd /root/rundeck-sphere-dev
git pull --ff-only origin rundeck-sphere-dev

# Audit: no remote mutations
bash ops/rundeck/github-hygiene.sh --audit

# Apply after inspecting the two sets of candidates and the retention manifest
bash ops/rundeck/github-hygiene.sh --apply --max-delete=150
```

The `--apply` pass deletes only merged PR heads that remain eligible and older completed Actions runs passing the retention rules. Repeat the Actions phase in bounded batches as needed; keep the JSON manifest as change evidence. The wrapper refuses wrong checkout, dirty worktree, missing `gh`, failed authentication or mismatched repository identity.

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

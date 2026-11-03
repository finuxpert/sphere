# SPHERE v1.35.20 — maintenance checkpoint (3 November 2026)

## Released baseline — do not mutate during maintenance

| Layer | Release / source | Deployment rule |
| --- | --- | --- |
| Public PROD UI | v1.35.20, `d6ed5eab59937c85080de35d994a8bc6f6592f4d` | Keep current production web symlink |
| PROD API | `6089dcd054e71845752e47e803a1273dacb94fcf` | Keep current production API symlink |
| DEV baseline | `d6ed5eab59937c85080de35d994a8bc6f6592f4d` | All follow-up work through reviewed maintenance branches |
| PostgreSQL | Shared runtime database `sphere_rundeck_dev` | **Treat DEV read load as PROD-impacting** |
| Previous PROD web | `ui-7ed6b4d5a38f23ce116f87987f8303ca7ce3e544` | Preserve as rollback evidence |
| Previous PROD API | `network-compat-e9a4bfee64e1` | Preserve as rollback evidence |

These SHAs are operator-verified release evidence at this checkpoint, **not** assertions that the same release will remain active forever. Consult active symlinks before any deployment. The v1.35.20 UI must not be changed through this maintenance work. No new dashboard widgets, counters, menus, collectors or database migrations.

## Canonical file / data flow

```text
src/App.jsx                         (app shell, imports src/app/workspace.css)
  -> src/tools/ToolLogWorkspace.jsx (LOG tool boundary, LogWorkspace.css)
     -> src/tools/ToolLogAutoSphereV5.jsx (lazy loaded LOG tool)
  -> src/tools/components/*         (Monitoring / Reports React components)
     -> frontend GET under /dev/api/ or /api/
        -> backend/rundeck_api.py / backend/rundeck_api_core.py
           -> backend/rundeck_evaluation.py (monthly JOB / PROGRAM report)
           -> backend/rundeck_infra_api.py (monthly filesystem report)
              -> PostgreSQL retained observations
```

Component-local CSS stays with its owning React component until browser coverage proves a safe move. Do not rename versioned JavaScript modules based on their filename alone: exports/tests/importers can still use them.

## Maintenance change policy

1. **Checkpoint first**: work from immutable `d6ed5eab`; no direct feature commits or forced history rewrites.
2. **File cleanup**: consolidate only import-adjacent incremental style layers, preserving CSS declarations and cascade order; keep generated/build artifacts out of Git.
3. **Performance**: improve existing SQL response shape without altering READY/WIB filtering, host/mount identity, null semantics or report figures.
4. **QA before DEV merge**: ESLint, Vite build, browser Monitoring/Reports render, backend unit tests, CSS parity guards and data-integrity tests. Do not equate CI build success with PROD validation.
5. **No PROD promotion** as part of cleanup. If monitoring exposes a production incident, use the separately approved rollback or hotfix procedure, not a feature merge.

## Evidence and performance gate

The first post-promotion backend smoke measured `/evaluation/workloads/monthly` at 100.74 s and `/infra/monthly-storage` at 14.23 s. Those are single observations, not repeatable baselines or proof of root cause. Measure SQL timing breakdown and warm/cold cache separately; compare output counts and identities before/after.

The first DEV maintenance optimization targets `monthly_storage_evidence`: the former query returned every monthly filesystem sample (182k+ were observed in a prior test) just to select the newest host/mount row. PostgreSQL now returns latest-per-mount rows plus a full pre-dedup source count. It must preserve `source_rows`, `distinct_mounts`, the four category statuses, and evidence timestamps. Deploying this DEV change **does not** modify PROD code or schema.

Monthly evaluation requires a separate EXPLAIN and `runtime.sql_timings_ms` diagnosis before query surgery; never silently change its KPI algorithm, source scope or completeness rules.

## Repository hygiene

- Close superseded mixed-scope PRs without merging; retain branch or patch reference until reviewed.
- Keep historical documents under `docs/archive/`, not as primary release instructions.
- Prefer one canonical app stylesheet and one canonical LOG workspace stylesheet over four separate incremental import layers.
- Deleting merged remote branches is optional housekeeping after verifying their PR and merge SHA; do not delete release branches, snapshots, or protected refs.

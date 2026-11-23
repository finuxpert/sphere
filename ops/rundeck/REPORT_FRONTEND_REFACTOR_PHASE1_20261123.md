# SPHERE DEV — Reports frontend refactor phase 1

**Date:** 23 November 2026 (WIB)  
**Target:** `rundeck-sphere-dev`; PROD promotion **ON HOLD** per [DEV-first maintenance policy](DEV_FIRST_MAINTENANCE_AND_PROD_PROMOTION.md).

## Scope and rationale

Decompose `src/tools/components/RundeckMonthlyReview.jsx` without changing observable behavior. The previous ~915-line entry component interleaved data fetching/orchestration, evidence review, static management panels, daily fallback charts, export and navigation.

This phase moves **only report presentation** into `src/tools/components/RundeckMonthlyManagement.jsx` (~219 lines) and retains ~704 lines in the entry module. Specifically:

- Moved `HostTrend` (retained daily fallback), `MonthlyRanking` (source-backed ranked CPU/PSS), `MonthlyManagementDashboard` (APP host, tuning candidates and filesystem view).
- Kept the same function bodies and JSX except for the exported component declaration; no reworked thresholds, data filters, sorting, formatting, or evidence logic.
- Moved existing color constants, formatting imports and `React.lazy` binding of the intraday APP trend with the panels.
- Kept the original `loadTimeHostTrend` preloading call inside `buildManagementMonthlyPng` to avoid lazy-chart screenshots with missing series.
- Kept the same component call in both live Reports view and PNG renderer, with unchanged props and data model.
- Retained the existing CSS entry import and CSS cascade; no visual redesign or CSS renaming.

## Explicit invariants

1. Monthly, Weekly and Custom date scopes, full-evaluated-population ranking, APP1–APP5 order and storage collection provenance stay unchanged.
2. Missing WP CPU/PSS remains missing and is never rendered as synthetic 0. WP CPU is core-equivalent; host utilization is separate.
3. APP host warning checks, signal-based suggested review, source timestamps and WIB date labels stay unchanged.
4. Report API, PostgreSQL, migrations, backend, pollers, snapshot workers, Nginx routes and PROD branches remain untouched.
5. PDF 16:9, A3, PNG export, browser smoke and dark/light views must pass full regression; a green CI alone does not prove operator-side visual sign-off.

## Tests and QA

- Existing `rundeck-monthly-enterprise-finish.test.mjs`, `rundeck-monthly-review-v2.test.mjs` and `rundeck-monthly-slide-export.test.mjs` updated to inspect the extracted presentation module; no assertions about evidence or semantics are removed.
- Added `rundeck-monthly-module-boundary.test.mjs` to verify extraction, lazy-loading, PNG preloading and historical scope evidence.
- GitHub PR must pass full frontend QA/build, browser Monitoring parity, monthly/weekly PDF raster, backend regression and snapshot QA before merge.
- After successful merge, deploy **DEV UI-only** with the official guarded `release-ui-dev.sh` after operator validates source SHA and PROD cross-environment smoke; production stays unchanged.
- Post-release operator checks: selected 16–22 November 2026 weekly report, full APP ranking and filesystem table, no date collisions, PDF 16:9 and PNG parity; verify active DEV web symlink and backend unchanged.

## Next phases, separately reviewed

- Phase 2: split export/report-header and evidence UI in additional small PRs.
- Phase 3: source-backed CSS consolidation, no style loss.
- Phase 4: backend evaluation refactor with database plan/contract QA, then Issue #111 SQL optimization separately.

**Do not merge additional refactors into this PR or promote to PROD without separate approved gates.**

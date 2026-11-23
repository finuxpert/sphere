# SPHERE DEV — backend report period refactor (phase 4a)

**Date:** 23 November 2026 WIB. **Phase:** source-only. DEV backend deployment and final operator QA deferred to the consolidated maintenance release.

## Safe refactoring delivered

Moved the three existing pure WIB reporting period boundary functions from `backend/rundeck_evaluation.py` into new `backend/rundeck_reporting_periods.py`: `calendar_month_bounds`, `calendar_week_bounds`, `calendar_custom_bounds`. The function bodies, inputs, exact error messages, date timezone, exclusive upper bounds and 1–31-day constraints are unchanged.

`backend/rundeck_evaluation.py` imports and **re-exports the exact same callable objects** for backward compatibility with FastAPI, snapshots, tests, and existing consumers. No SQL, cache state, aggregation or workload logic was changed.

Regression includes independent `backend/tests/test_rundeck_reporting_periods.py` and additional compatibility assertions in the existing `test_rundeck_monthly_review.py` included by the required GitHub maintenance parity QA.

## Isolation and release policy

- **Do not execute DEV full-stack deployment solely to visually inspect a refactor.** This work changes Python source and must be packaged/deployed later by the **guarded backend/full-stack DEV release**, not UI-only.
- Run code/contract tests in GitHub on the PR. Defer one combined browser/PDF/live-data QA until the approved DEV maintenance batch is complete. Never skip any mandatory CI, migration decision, PROD cross-smoke or rollback guard.
- **PROD ON HOLD.** Neither PROD checkout nor API service, database/schema, PostgreSQL, Nginx and collector runtime change during source refactor.
- Cold evaluation SQL bottlenecks in Issue #111 require separate real DEV profiling and should not be conflated with relocating pure calendar functions.

## Pending technical work

1. Finish CSS bundle-safe refactor: source splitting PR #117 is not eligible to merge while its bundled stylesheet exceeds the existing budget.
2. Review `backend/rundeck_evaluation.py` remaining query/response/cache responsibilities before any further extraction; avoid circular imports and preserve monkeypatch hooks.
3. Group all completed refactors into **one approved DEV backend-capable release**, then run period/snapshot/API, visual/PDF, performance and rollback verification before PROD promotion.

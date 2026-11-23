# SPHERE DEV — backend evaluation view separation (phase 4b)

**Date:** 23 Nov 2026 WIB. **Branch:** DEV only. **PROD ON HOLD.**

## Scope

Move existing deterministic evaluation view helpers unchanged from `backend/rundeck_evaluation.py` to `backend/rundeck_evaluation_view.py`:
`_monthly_abap_tuning_candidates`, `_evaluation_page`, `_evaluation_health` and `_evaluation_health_summary`.

Retain re-exports in `rundeck_evaluation.py` for compatibility with existing FastAPI routes, period report snapshot logic, source tests, and downstream imports.

**No** SQL, cache, source sampling, assessment thresholds, sorting, missing-value behavior, API response shape, ABAP attribution or report period bounds are changed.

## Automated gate

Required backend monthly report test suite adds:
- identity test for old import locations vs pure module,
- full-population filter-before-page verification, including pressure/health/flag and source scope.

Backend SQL plan parity, persistent snapshots, frontend monthly report, browser layout and PDF regression workflows must remain green before merge.

## Deployment

This is a **backend source change**, not UI-only. Do not deploy it on the server until the combined DEV maintenance batch has an explicit migration diff review, approved full-stack DEV release window and rollback. Final live QA is intentionally deferred until then, but mandatory PR CI is not.

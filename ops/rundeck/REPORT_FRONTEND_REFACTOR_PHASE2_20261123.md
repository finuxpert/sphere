# SPHERE DEV — Reports frontend refactor phase 2

**Date:** 23 November 2026 (WIB)  
**Scope:** DEV frontend source and tests only. **PROD promotion ON HOLD.**  
**Base:** `rundeck-sphere-dev` at phase-1 commit `6fdaf4f11c146a25d711ac68a6de66dbb3688fa3`.

## Goal

Make Reports easier to maintain without changing data, visible copy, user workflows, layout, or export format. Do not fold refactoring into a SQL optimization or PROD release.

## Ownership after extraction

| Module | Responsibility |
|---|---|
| `RundeckMonthlyReview.jsx` | Top-level controller, month/week/custom selection state, historical preview and full evaluation fetching, abort/retry, source-scope guards, evidence drawer and export-generation race protection |
| `RundeckMonthlyManagement.jsx` | Existing management trend/ranking/APP/workload/filesystem panels, source-backed daily fallback |
| `RundeckMonthlyEvidencePanels.jsx` | Existing workload distribution, resource warning observations, pressure correlation and ABAP trace/error evidence panels |
| `RundeckMonthlyReportHeader.jsx` | Stateless controlled title, period selectors, Generate PDF 16:9/PNG 16:9/A3, Detailed Evidence button and guarded Download link |
| `rundeckMonthlyExport.js` | Format dispatch for management PDF 16:9, PDF A3, PNG and lazily imported technical PDF, using already verified data |
| `RundeckMonthlyPngExport.jsx` | Existing temporary 1280×720 React/DOM print frame, webfont/logo readiness, lazy trend preloading, overflow refusal and 1920×1080 PNG serialization |

The controller still fetches **canonical full evaluated population** independently of evidence drawer paging before export; it rejects wrong-month/period data, missing FULL_EVALUATED_POPULATION and unmatched storage. The `pdfGenerationRef` guard, Blob URL cleanup and stale-snapshot export lock remain at the original request orchestration layer.

## Explicit non-changes

- No backend/API schema, query, PostgreSQL, collector, systemd, Nginx, credentials, migration, performance thresholds, sampling behavior or runtime service restart.
- No new words in SAP report tables, new WARN/CRITICAL classification, altered PSS/CPU semantics, missing-value coercion, or host/collection mixing.
- No CSS rule or visual geometry edits: existing class names and import cascade retained.
- No PDF 16:9/A3 or PNG layout geometry edits; the technical PDF remains a dynamic import.

## QA contract before DEV deploy

- Frontend ESLint, `npm run qa`, Vite build/bundle-budget and browser boot pass.
- Existing Reports period/window, evidence-source, saved-PSS, APP, storage, weekly PDF and export checks continue to assert the same values.
- `rundeck-monthly-module-boundary.test.mjs` specifically checks controller vs evidence vs header vs serializers and the original scope/clip constraints.
- PDF 16:9 raster 960×540 pt, PNG 1920×1080, A3 option, weekly date labels and ABI stay verified.
- Backend regression and persistent snapshot workflows PASS even though backend files did not change.
- PR CI + post-merge offline release workflow PASS **before** any UI deployment.

## DEV operator release and live QA

1. Verify exact merged GitHub SHA and compare against current DEV source/active web symlink.
2. Perform the regular guarded **UI-only** release `ops/rundeck/release-ui-dev.sh`; do not restart the API for this refactor and do not bypass PROD cross-smoke.
3. Confirm `FINAL=PASS MODE=DEV_UI_ONLY`, `BACKEND=UNCHANGED`, `PROD=UNCHANGED`, and active DEV web SHA.
4. Hard refresh `/dev/#/tool/logs/monthly-review`: period picker month/week/custom, full evidence drawer, search/filter/pagination and error trace panels.
5. Recheck Weekly 16–22 Nov 2026: five WP CPU and PSS ranks, APP1–5 host rows, four mapped APP1 filesystems; verify PDF 16:9 and PNG, A3 and technical PDF when monthly.
6. Keep PROD promotion blocked pending the separate [DEV-first promotion gate checklist](DEV_FIRST_MAINTENANCE_AND_PROD_PROMOTION.md).

**Status at documentation authoring:** branch/PR candidate only, not confirmed active on the server. Do not claim DEV is running the refactor until the operator's guarded deploy succeeds.

## Later phases

- Audit and consolidate legacy Report CSS separately with screenshot/regression approval.
- Backend evaluation cleanup and Issue #111 cold SQL investigation on a separately reviewed DEV-only branch.
- PROD promotion only after continued DEV functional/performance/reliability verification and explicit change approval.

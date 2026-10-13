# SPHERE DEV v1.35.10 — Workload Health hexagon restoration

Scope: frontend-only branch `rundeck-sphere-dev`. No backend/database, SM37 or PROD change.

- Restore one *selectable hexagon per verified saved 1D JOB/PROGRAM evaluation*, preserving severity and source identity. Hexagon opens the existing Performance Analysis drilldown; the separate Review list remains.
- Backend evaluation total and four category counts are authoritative; never infer severity from frontend CPU percentages.
- Fetch all backend pages (100 rows/request) up to 800 items, verify identity, window, page offsets and category counts using `validatedWorkloadDots`. All evaluated rows are displayed together without the 400+1 pagination. If the total exceeds 800, retain source-backed totals and direct operators to Review instead of rendering a misleading partial grid.
- Restore compact honeycomb geometry next to Live/Review table, shorter viewport density, accessible title and reduced-motion hover behavior.
- A saved workload health category does not establish SM37 execution outcome.

## Fast operator workflow
On `JAHSVR-SPHERE`, run `sphere deploy dev` for the existing guarded frontend-only DEV release, which syncs, builds and deploys without Playwright/QA, preserving release rollback. Alternatively, `npm run build:dev` only builds local `dist` and does **not** publish to /dev/.

Release verification on the website is manual; do not claim visual/data QA PASS without checking.

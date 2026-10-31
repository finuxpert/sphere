# Repository Architecture — SPHERE

Status: **refactoring target**. This file documents stable naming, module ownership
and acceptance criteria. It is not a claim of live deployment.

## Current source baseline (rundeck-sphere-dev)

- Base commit: `98cda92fdce2`
- Git-tracked files: **531**
- CSS files: **106**
- Files by main area: frontend `src/` **243**, backend **101**,
  scripts **69**, operations **51**,
  assets `public/` **29**, docs **26**.
- The monitoring orchestrator `src/tools/components/RundeckMonitoringHistory.jsx`
  currently imports many separate CSS layers. This is a priority refactoring
  candidate, not permission to delete those styles.
- Build output, node_modules and host-local files are excluded from Git counts.

## Canonical organization (target, migrate incrementally)

```text
src/
  app/                    app shell, routes and version metadata
  features/
    overview/
    monitoring/
    infrastructure/
    jobs/
    investigation/
    monthly-review/
    data-collection/
    log-analysis/
    st03n-analysis/
  shared/                 cross-feature UI, hooks, formatting and clients
  styles/                 global theme tokens and Bootstrap overrides
backend/
  api/                    FastAPI HTTP endpoints and request validation
  services/               business logic, evidence and correlation
  db/                     persistence and existing immutable migrations
  tests/                  backend regression tests
scripts/                  build, audit, development and QA
ops/                      deployment scripts, collector units and recovery
docs/                     current documentation, standards and archived records
```

Do not create empty directories or copy source files only to match this diagram.
Use stable names such as `MonitoringPage.jsx`, `monitoringApi.js`,
`Monitoring.module.css`, `monthlyReviewPdf.js` and `job_service.py`
where corresponding code and responsibilities exist.

## File ownership rules

1. A page composes components and interaction state, not standalone API
   logic, long data transformations and print/PDF implementation.
2. Hooks own request lifecycle, loading/refresh/error handling and cancellation.
   API modules own network calls, not DOM or presentation.
3. Domain modules own metrics, quality semantics, host/time attribution and
   unknown/missing states. No fabricated or silently rewritten evidence.
4. CSS belongs to the owning feature or global theme system; use Bootstrap as
   a foundation. Consolidate redundant selectors while retaining cascade order.
5. Keep stable filenames. Do not create `Final`, `Patch`, version or timestamp
   suffixes in new application source. Git tracks the revisions.
6. Preserve applied Alembic migrations, Rundeck/collector contracts, existing
   API endpoints, systemd unit names and compatibility-sensitive log formats.
7. Preserve relevant regression tests even if they still have legacy names;
   update test references during a separate reviewed codemod.
8. Commit related changes as a coherent batch. No breaking rename or deletion
   without reference audit, route test, QA, and rollback path.

## Before / after workstreams

| Workstream | Before | After acceptance |
|---|---|---|
| CSS and naming | 106 stylesheets; incrementally versioned files | Stable names, no redundant imports, preserved behavior |
| Frontend | 243 files under src; many components under tools | Feature-owned components and scoped styles; no missing views |
| Backend | 101 files | Clean API/service/data responsibilities, same endpoint response contracts |
| Tests | Existing scripts/backend/E2E checks | Relevant tests retained, updated imports, no regression |
| Operations | 51 files under ops | Exact deployment and monitoring contracts maintained |
| Documentation/assets | 26 docs and 29 assets | Historical docs archived; identical assets deduplicated after usage audit |
| Release | New branch, not deployed | Merge to DEV after complete QA; separate PROD approval |

## Phase 1 — Changes in this branch

- Combine `src/app/workspace-2026.css` + `workspace-2026-shell.css`
  into `src/app/workspace.css`, preserving original rule order.
- Combine four adjacent LOG CSS layers `SphereWorkspaceV153.css` through
  `SphereWorkspaceV156.css` into `src/tools/LogWorkspace.css`
  with CSS declarations preserved in the same order.
- Update the two importing React modules.
- Leave the monitoring's 36 CSS imports and every backend module unchanged
  until independent QA and source-backed mapping are available.

## Validation gate

Run `npm run qa`, backend regression tests, and real browser/Chromium
visual checks, including DEV base path, layout, monitoring, Jobs & Programs,
monthly PDF and log analysis. Compare build sizes, runtime/API timings,
screenshots and evidence semantics before claiming performance improvement.
DEV deployment is a separate gated step; PROD must not be changed in this
refactoring branch.

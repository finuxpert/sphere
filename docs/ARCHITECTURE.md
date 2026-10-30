# SPHERE Codebase Architecture

## Scope and source of truth

This document sets the stable naming and file-ownership contract for **SPHERE**.
The current frontend is React/Vite and the backend is Python/FastAPI. The
DEV refactoring branch is **not** a deployment instruction and does not modify
PROD. Existing API routes, parser evidence formats, database migrations, and
collector/service names are compatibility contracts.

## Canonical file ownership

| Area | Ownership | Stable naming |
|---|---|---|
| `src/app/` | App shell, route state, application metadata | `App.jsx`, `workspace.css`, `version.js` |
| `src/features/<feature>/` | Feature pages, components, hooks and scoped styles | `MonitoringPage.jsx`, `monitoringApi.js`, `Monitoring.module.css` |
| `src/shared/` | Used by two or more feature modules | `components/`, `hooks/`, `utils/` |
| `src/styles/` | Theme tokens, global baseline and Bootstrap overrides | `tokens.css`, `global.css`, `bootstrap-overrides.css` |
| `backend/api/` | Request/response routing | Feature-oriented FastAPI routers |
| `backend/services/` | Business logic, data enrichment and correlation | `*_service.py` |
| `backend/db/` | Storage, queries and existing migrations | Never rewrite applied migrations |
| `ops/` | Deployed process, service and release contracts | Keep compatibility-sensitive filenames |
| `scripts/` | Build, QA and development tooling | Action-oriented names |
| `docs/` | Current architecture and operating instructions | No dated iterative UI patches |

The paths above are the *target* organization. Do not create empty directories,
duplicate existing modules, or move everything in one commit merely to match
this diagram. A file's role comes from its behavior, not its filename.

## Engineering rules

1. **Stable filenames.** Never add new `V13`, `Final`, `Patch`, `New`, or date
   suffixes to application source files. Put versions in release metadata and Git.
2. **One primary responsibility.** Pages compose views, service modules perform
   data access, transformation modules handle metrics, and CSS handles styling.
3. **Consolidate before deleting.** Track every static/dynamic import, CSS cascade
   order, test fixture, export and deployment reference. Preserve data semantics.
4. **Retain valuable tests.** A test covering legacy evidence or regressions is
   not obsolete solely because its filename includes a version number.
5. **Keep system contracts.** API URLs, DB migration IDs, log/parser markers,
   systemd units and runtime directories require explicit compatibility review.
6. **Avoid giant replacements.** Consolidation may reduce duplicate modules but
   should not produce monolithic pages or global stylesheets.
7. **Release gate.** Verify `npm run qa`, `npm run qa:visual` with Chromium,
   backend tests and the appropriate guarded DEV release before claiming PASS.

## Phase 1: canonical CSS naming

- Consolidate `src/app/workspace-2026.css` and
  `src/app/workspace-2026-shell.css` into `src/app/workspace.css`.
- Consolidate four adjacent LOG incremental stylesheets
  `SphereWorkspaceV153.css` through `SphereWorkspaceV156.css`
  into `src/tools/LogWorkspace.css`; preserve original CSS rule order.
- Update only the imports of the owning components.
- Do not claim page/layout parity without browser testing.

## Future phases (not yet applied)

1. Group monitoring, infrastructure, jobs, monthly review, investigation,
   data collection, log analysis and ST03N modules by existing feature ownership.
2. Consolidate monitoring's many stylesheet imports, resolving selector
   conflicts and establishing design tokens; record screenshots before/after.
3. Extract API and domain services incrementally while retaining public URLs.
4. Audit duplicate assets, unused modules and stale documentation using
   runtime references and the existing repo/CSS hygiene scripts.
5. Merge small reviewed changes into DEV only after QA, and promote to PROD
   only with separate authorization.

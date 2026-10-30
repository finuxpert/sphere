# SPHERE DEV - Bootstrap 5 foundation (30 Oct 2026)

Scope: `rundeck-sphere-dev` only. PROD remains unchanged. Bootstrap 5.3.8 CSS is installed and locked in `package.json` and `package-lock.json`; Popper is an npm peer dependency. Bootstrap JavaScript is deliberately not imported because React already controls all interactive state, drawers, tablists, menus, and dialogs.

## Layout contract
- The new `RundeckBootstrapFoundation.css` imports the complete Bootstrap 5 stylesheet into cascade layer `sphere-bootstrap`. SPHERE's legacy unlayered CSS remains authoritative where needed; this prevents an uncontrolled application-wide visual reset.
- Navbar and sidebar use Bootstrap flex and navigation utilities. The existing React route state and theme selector remain the source of truth.
- Jobs & Programs Current and Review use Bootstrap forms, button groups, tables and pagination buttons, with original API queries, click handlers, row identities, freshness labels, CPU multi-core semantics, and server paging retained.
- Monitoring uses Bootstrap responsive rows and columns for the four ECharts charts and Bootstrap utilities/forms for selected controls. The lower Jobs & Programs / System Health area uses a dedicated 58/42 CSS Grid at desktop widths, not Bootstrap column sizing.
- Reports uses standard Bootstrap select/input/table CSS, with management report contents and PDF generation unchanged.
- Shared modal buttons use Bootstrap primitives but retain React focus handling, drawer state, and existing source-specific visual rules.
- Light/dark mode inherits SPHERE `html[data-theme]` and maps to the Bootstrap variables in `RundeckBootstrapFoundation.css`.

## Validation
Run `npm ci`, `npm run qa`, and `npm run qa:visual` as appropriate. The repository's GitHub workflow also checks a clean React render in Chromium, four-chart geometry, monthly PDF content, and backend unit tests. Verify the active DEV SHA before claiming live deployment.

After SSH onto JAHSVR-SPHERE, inspect a clean working tree before running `SPHERE_DEV_MIGRATION_DECISION=skip bash ops/rundeck/release-dev-fast.sh`. Do not deploy PROD or silently overwrite local changes.

## Not changed
- Source of monitoring / SAP availability evidence, raw observations, retention or collection cadence
- FastAPI endpoints, data models, migrations, or classification thresholds
- ECharts time windows and timestamps; SAP status must not be invented when data is stale

## DEV host dependency synchronization

The combined DEV release checks whether the source lockfile changed after fast-forward and whether the Bootstrap 5 CSS asset is installed. It runs `npm ci --prefer-offline --no-audit --no-fund` before QA only when synchronization is necessary. This resolves the difference between a fresh GitHub runner and an existing host checkout. Direct `qa-build-dev.sh` exits with an actionable diagnostic if Bootstrap is absent.

A Vite warning about minified chunks above 800 kB is not a build failure; monitor actual bundle performance separately.

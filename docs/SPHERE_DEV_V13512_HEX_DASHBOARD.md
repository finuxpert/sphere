# SPHERE DEV v1.35.12 — Hexagon SAP dashboard

2026-10-13 · `rundeck-sphere-dev` only. PROD untouched.

## Changes
- Five source-backed APP hosts become compact, keyboard-accessible hexagon selectors. The selected host card shows CPU, RAM, Critical WP and filesystem with status/freshness from each proper source.
- Hexagon clicks choose a host and synchronize saved Trend APP focus; Full Analysis is a separate button preserving the existing modal and host provenance. Jobs & Programs remains unfiltered across APP.
- Four existing Operational Analysis shortcuts appear between APP selection and Trends.
- Workload Health title includes a hexagon icon. The 1D evaluation dataset and each validated selectable hexagon remain unchanged.
- Cockpit-only layout rules live in `RundeckCockpitHexV13512.css` imported last. Android receives five compact APP selectors and a readable summary without horizontal overflow.
- Generated Playwright / coverage artifacts excluded from ESLint to avoid linting minified bundles.

## Validation / deployment
- Test `npm run qa:unified-cockpit`, `npm run qa:cockpit`, `npm run build:dev`, Playwright at desktop 1366/1536/1920 and Android 360/412.
- Confirm no page overflow at supported desktop heights, no horizontal overflow, four working modal shortcuts and APP-to-Trend focus.
- Production and DB migrations unchanged. For fast DEV deployment use **`sphere deploy dev`** on JAHSVR-SPHERE; the command does Git fast-forward, build, guarded DEV frontend cutover and rollback.
- Do not claim runtime or visual QA PASS without observing actual test / server evidence.

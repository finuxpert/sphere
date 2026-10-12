# SPHERE v1.35.5 DEV — Operator Integrity & Compact Overview

Updated: 2026-10-12. Branch: `rundeck-sphere-dev`. Environment: `/dev/` only. PROD HOLD.

## Implemented

- Shared operator thresholds in `rundeckStatusSemantics.js`: CPU warning/critical 75/90%, host RAM 80/90%, I/O Wait 10/20%, APP critical WP attention from 1 / critical from 3, filesystem warning/critical 75/90%. APP status and Infrastructure chart/status now consume the same limits.
- Distinct SAP and Infrastructure status sources and freshness preserved. Missing/invalid APP, FS, network, storage, and process data are not assumed NORMAL or 1 process. The backend and PDF status consumer continue using shared status semantics.
- Live Job/Program rows keep one keyboard action (job button), while the row remains pointer-clickable. Search clearly indicates it searches only loaded rows (not entire historical observations).
- Repeated healthy Infrastructure notes on five APP cards are hidden. Individual APP metrics/FS readings are not collapsed into a falsely shared host signal.
- Existing flat UI stylesheet is reused to reduce extra status/icon decoration and constrain Overview chart/table height with pager visible on typical desktop viewports.
- Obsolete `[role=button]` selector CSS removed. Version bumped to v1.35.5-dev.

## Targeted tests (no Playwright)

- `scripts/tests/rundeck-unified-host.test.mjs`: CPU/RAM/I/O threshold parity, FS 75/90%, independent freshness.
- `scripts/tests/rundeck-system-health.test.mjs`: unknown resource or critical-WP cannot become NORMAL.
- `scripts/tests/rundeck-workload-metrics.test.mjs`: missing, zero, and valid process counts.

Run, if needed, on JAHSVR-SPHERE after source sync:
`cd /root/rundeck-sphere-dev && node --test scripts/tests/rundeck-unified-host.test.mjs scripts/tests/rundeck-system-health.test.mjs scripts/tests/rundeck-workload-metrics.test.mjs`

## DEV release

Run as root: `sphere deploy dev`.
Expected build label: `v1.35.5-dev`. Build, runtime, and screenshots have NOT been verified by the assistant on the server.
Check browser with Ctrl+Shift+R: page-level scroll, pagination visibility, title duplication, APP data, both combined analysis popups, other modals, source freshness, SAP status, and FS warning/critical lines.

## Explicit non-goals / open checks

- No DB migrations, backend/API changes, SAP collectors, policy changes, or PROD modifications.
- SAP Performance duplicate heading may originate outside the current heading element. The heading pseudo-element is suppressed, but the actual browser result must be verified; do not claim it is fixed without a screenshot.
- All historical CSS styles and the PDF visual design were not globally rewritten or deleted. Only code shown to be unused was removed.
- PROD promotion remains HOLD pending DEV build, manual screenshots, and explicit approval.

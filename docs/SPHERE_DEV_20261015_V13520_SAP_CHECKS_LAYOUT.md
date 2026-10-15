# SPHERE DEV v1.35.20 — SAP Checks modal full-width investigation

Date: 2026-10-15
Branch: `rundeck-sphere-dev`; PROD unchanged.

## Problem addressed

Earlier releases v1.35.17–19 focused on the cockpit and Workload Health, **not** the SAP Checks popup. The SAP Checks screen still placed compact HANA/SSH checks in a tall left column and all SAP indicators/incidents in a crowded right column, leaving a large unused void on the left.

## SAP Checks layout changes

- Keep the existing five verified status metrics (SAP APP, HANA, WEB, Technical and SM37 readiness), timestamps, collection and refresh semantics.
- Below the status rail, place **Technical checks** across the width of the drawer. Inside, show HANA replication/SSH, SAP APP SSH and Other SSH as a compact horizontally grouped strip where screen space permits.
- Place **Current Issues** below Technical checks, taking the full drawer width for source-backed counters, indicator search/APP filter, indicator table and retained active incidents.
- Increase table/technical-check typography to operator-readable values; reduce repeated separator cards and excessive horizontal whitespace.
- Technical checks are identified as **Service Availability source** and Current Issues as **APP signals and retained incidents**, clarifying that they are separate evidence sources.
- For narrow drawers, keep a stacked layout and allow bounded scrolling when a large indicator list cannot fit. Do not truncate/hide records or assume unavailable checks are UP.
- Preserve all existing APP drilldowns, severity thresholds, freshness checks, Critical WP peak/duration data, and explicit SM37 **UNAVAILABLE/UNKNOWN** semantics.

## Code and QA

- `src/tools/components/RundeckSapChecksLayout.css`
- `src/tools/components/RundeckMonitoringHistory.jsx`
- `src/app/version.js`
- `scripts/tests/rundeck-sap-checks-layout.test.mjs` (included in `qa:unified-cockpit`)
- `tests/visual/rundeck-v1356.visual.spec.mjs`

Validation on JAHSVR-SPHERE:

```bash
cd /root/rundeck-sphere-dev
npm run qa:unified-cockpit
npm run qa:basis-investigation
npm run lint
npm run build:dev
```

Run `sphere deploy dev` through the existing guarded process and visually verify the popup at 1536×864, 1366×768 and narrow/mobile viewports. In the modal, check that Technical checks runs horizontally above a full-width Current Issues section, not beside it, and the 5 source-backed status numbers and all indicator/incident rows remain correct.

**Release gate:** GitHub commit alone does not prove lint/build/Playwright/runtime QA. Record source/artifact SHAs and rollback evidence. Do not deploy/promote PROD without separate explicit approval.

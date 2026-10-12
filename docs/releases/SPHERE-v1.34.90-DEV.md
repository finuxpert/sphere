# SPHERE DEV v1.34.90 — Implement mockup into real UI

**Status:** source candidate only. QA/build, live DEV public HTTPS parity and screenshot review **PENDING** until actual JAHSVR-SPHERE release output.

## Why this differs from v1.34.89

v1.34.89 flattened borders but retained miniaturized page geometry. v1.34.90 deliberately changes JSX structure and render dimensions so the actual React application—not a standalone illustration—resembles the approved enterprise SAP Basis redesign.

### Actual code changes

- **Header** now renders a readable **SAP Performance Dashboard** heading. The original data-source buttons, System Health/Collector status and SAP Data freshness remain backed by their current state.
- **Workspace navigation** adds Overview, Infrastructure Analysis and Job / Program Analysis. These open the current real drawers; Job is disabled until a selected Job exists.
- **APP cards** render four meaningful metric cells: actual CPU%, host RAM%, Critical WP **count**, and independent filesystem% with visible progress tracks only for true percentages. Infrastructure collection freshness and I/O wait remain available in the card evidence. Colors do not override source classifications.
- **Trends** are now a substantial three-panel shared chart area with desktop axes/labels, not the 138px legacy geometry. Keeps ECharts and all existing metric/host/range options, bucket timestamps and gap semantics.
- **Operational Analysis** remains one flat six-destination bar. All six real destinations remain wired; Observation History stays disabled without a selected Job.
- **Jobs & Programs** remains an active Live/Review/Search tabbed workspace with the real table and selected row, not synthetic rows from the mockup.
- **Modals** expand to desktop investigation width, with Job controls above the full-width evidence chart, Infrastructure history ahead of current filesystem/network/storage tables, and no duplicate Related Analysis cards.
- **Other views** keep their existing data models and handlers for Correlated Events, Observation History, SAP Issues/Availability, Review/Closing, System Data and PDF Preview. Typography and surfaces inherit the existing flat workspace styles; detailed visual parity for those views is not asserted without screenshot comparison.

## Explicitly not implemented from illustrative images

Do not invent CPU User/System splits, synthetic RAM caches, generic service percentages, baseline deltas, fabricated SAP Jobs, target hostnames, SM37 failures, auto-generated findings, token rotation, or new PDF report metrics. The real screen must show only authoritative backed values. UI navigation into existing functions is allowed, new unproven backend features are not.

## Release validation

1. Verify GitHub SHA and clean `rundeck-sphere-dev`.
2. Run one guarded `ops/rundeck/release-ui-dev.sh <SHA>` on JAHSVR-SPHERE.
3. QA/build must pass; Playwright desktop at 1366px and 1536px validates DOM geometry, modal navigation, and writes actual preview screenshots.
4. Script only switches DEV static root if verification passes. PROD frontend/API, Nginx, SAP, Rundeck, credentials, DB schema and thresholds are unchanged. DB revision checked read-only and migration skipped.
5. Open **https://sphere.astraotoparts.co.id/dev/** at 1536 desktop, compare real Overview and Infrastructure screenshots with approved mockups. Also capture Job, SAP Checks, Events/History, Review, System Data and PDF to review remaining differences.

**Acceptance requires real screenshot review**; neither a successful build nor a mockup image alone proves exact layout parity. If there are gaps, fix the actual JSX/CSS and rerun only affected desktop tests before the next guarded release.

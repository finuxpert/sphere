# SPHERE DEV v1.35.18 — Workload category drilldowns & Technical Load scale

Date: 2026-10-14
Source branch: `rundeck-sphere-dev`
PROD branch: unchanged. Do not promote without QA.

## Changes

1. Workload Health's four saved categories (Review, Watch, Unknown, Normal) are keyboard-accessible buttons. The backend summary counts are not recomputed or inferred in the UI. Clicking a category opens Jobs & Programs **Review**, forces the 1D saved-evaluation window and selects backend filters `REVIEW`, `ATTENTION`, `UNKNOWN` or `NORMAL`. The existing Review list still performs backend pagination and checks `FULL_EVALUATED_POPULATION`. 'Review list' remains a direct shortcut to Review Required. Individual hexagons still open their verified saved row.
2. Technical Load has an independent **Load Y: Full / Typical** toggle. Full is the default and never clips an outlier. Typical uses the actual saved Load values to calculate an optional Y-axis crop. Whenever values are outside that range, the panel reports the source peak, host, timestamp, count of above-range samples and a **Show Full** action. The underlying ECharts series and samples, missing-sample gaps, AVG/Peak mode and source identities are unchanged. Typical is strictly visual and is not a performance-health/causality verdict.
3. Workload Health categories have larger, colored numerals, visible focus/hover targets, and cleaner alignment inside the existing height; no four extra cards or decorative rows. Honeycomb dots remain one-per-validated-evaluation.
4. APP 3+2 layout stays fixed, with a slightly shorter left-to-right gap to Selected APP. No changes to severity or APP/Infrastructure mapping.
5. Current workload APP selector now explicitly says **All APP · global**, separate from Trend APP Focus; the selected APP does not silently filter Current Jobs.
6. New CSS is scoped to the active cockpit; no blanket removal of legacy styles without matching behavior tests.

## Files

- `src/tools/components/RundeckWorkloadHealth.jsx`
- `src/tools/components/RundeckJobsProgramsWorkspace.jsx`
- `src/tools/components/RundeckPerformanceReview.jsx`
- `src/tools/components/RundeckServerTrend.jsx`
- `src/tools/components/rundeckTechnicalLoadScale.js`
- `src/tools/components/RundeckCurrentWorkload.jsx`
- `src/tools/components/RundeckCockpitHexV13512.css`
- `src/app/version.js`
- `scripts/tests/rundeck-hex-dashboard-v13512.test.mjs`
- `scripts/tests/rundeck-technical-load-scale.test.mjs`
- `tests/visual/rundeck-v1356.visual.spec.mjs`
- `package.json`

## DEV acceptance criteria

- Clicking any of the four categories changes to Review and selects the **correct backend health filter** for the same 1D window. Counts remain consistent with full saved evaluation population.
- Clicking an individual hexagon still selects exactly its saved evaluation, with correct identity and time.
- Technical Full shows the original peak. Typical improves low-value readability while explicitly reporting any excluded peak and allowing Full restore. No graph claim of SAP outage solely from a Load spike.
- Zero or missing source samples never create fake peaks. Both chart modes retain source data and collection gaps.
- Active APP does not modify the global Current Jobs filter without user selection.
- Laptop/desktop 1366×768, 1536×864, 1920×1080 plus Android; no page overflow, clipped hexagons, modal viewport violation or bad keyboard focus.
- Run `npm run qa:unified-cockpit`, `npm run qa:trend-focus`, `npm run qa:basis-investigation`, `npm run lint`, `npm run build:dev`, and visual/browser QA. Do not mark QA PASS from source checks alone.

Deploy from JAHSVR-SPHERE with `sphere deploy dev` and record SOURCE_SHA, ARTIFACT_SHA and any rollback point. PROD remains unchanged until separately authorized.

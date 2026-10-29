# SPHERE — Enterprise UI Standard

**Applies to:** Monitoring, Jobs & Programs, Data Collection, Reports/Monthly Review and investigation dialogs on `rundeck-sphere-dev`. This is the maintained **source-level UI contract**. It does not establish a live deployment or passing browser screenshot inspection.

## Navigation and operator hierarchy

- Keep the two top-level workspaces: ST03N Analysis and Performance Analysis.
- Keep the **four** primary Performance sidebar labels: **Monitoring**, **Jobs & Programs**, **Data Collection**, **Reports**. Related Events, SAP Checks, Infrastructure and history remain reachable in detail/deep-link flows, not duplicated in the main navigation.
- Monitoring order: **SAP APP Landscape → Performance Trends → Jobs & Programs/System Health**.
- Present status, source freshness, severity, key metric and exact WIB timestamp before explanatory text. Use common SAP Basis, Infrastructure, Functional and management terminology.

## Design system and Bootstrap scope

- Use **Bootstrap 5 Grid** for the four trend panels and the lower Monitoring two-column split. The remainder of SPHERE still uses custom CSS compatibility layers; do not call the app 'full Bootstrap'.
- Existing Bootstrap responsive grid: four charts in one row on wide desktops, two on medium viewports, one on narrow.
- The bottom panels use a 5/7 column ratio at desktop widths where it fits, stacking on smaller screens.
- Prefer consistent Bootstrap spacing, typography and form primitives when progressively consolidating CSS. Keep necessary SPHERE semantic tokens and domain-specific styles for APP state, ECharts and specialized investigations.
- Do not add React-Bootstrap or Bootstrap JavaScript merely to duplicate existing React/Radix interactions. Do not delete old CSS by filename alone: inspect imports/selectors and run browser regression before consolidation.
- Use restrained flat enterprise surfaces, minimal borders, readable tabular numbers, stable APP colors, accessible focus styles, no decorative filler/animation or overlapping controls.

## Performance Trends

Four configurable ECharts plots, initially CPU, Memory, Network and Critical WP. Preserve all metric dropdowns, shared Time Range, Interval, Aggregation, APP highlight, Network RX/TX and Typical/Full controls, percentage Y-axis focus, click-to-detail, and gap evidence.

- Exact saved peak **value + APP + date/time WIB** must be clear for each chart.
- Keep thresholds truthful; display-only axes never change the source readings, peak or warning/critical limits.
- ECharts instance/ResizeObserver lifecycle must be cleaned up; avoid duplicate resize observers and unnecessary chart work.
- Preserve source-backed gaps as gaps, not zeros. Network measurements are Infrastructure samples, not SAP execution telemetry.

## Desktop height and overflow

- **1536 × 864 at browser zoom 100%** is the principal one-screen Overview acceptance target; also check 1366 × 768 and 1920 × 1080.
- Dashboard summary may be compact; details remain available through View Details/View All/modals.
- For compact Monitoring, preview up to **two priority programs and two current workloads**. This only changes the preview, not saved/full backend records.
- Do **not** set global `overflow:hidden` to conceal unfinished content; unexpected warnings, expanded sections and narrow/mobile views may scroll naturally.
- Four charts must keep legible axes, thresholds and peak timestamps. A no-scroll result is invalid if text is clipped, chart is squashed or controls become inaccessible.

## Data trust and visual state

- Distinguish stale/partial/unverified/missing from healthy or zero.
- Separate APP status, collector status, data quality, Infrastructure snapshots, and SAP service availability.
- Historical point timestamp is different from exact peak timestamp. WP trace may be historical; SM37 is authoritative for SAP job completion.
- Keep PSS workload memory separate from host RAM. Grouped CPU may exceed 100%.
- Correlation is not a causal finding. Severity and counts must use the correct verified source and observed period.

## Verification and modernization guardrails

- `npm run qa` must pass lint, source integrity, trend/data-quality, bootstrap-overview regression and build.
- Run browser boot, full-width evaluation geometry, light/dark, desktop/mobile, keyboard/modal, exact click and report QA; see [VISUAL-QA.md](VISUAL-QA.md).
- Compare pre/post DOM geometry, compiled CSS bytes, request waterfall and Lighthouse/Core Web Vitals before claiming performance improvement.
- The **next** broader CSS consolidation or modular Bootstrap migration is **planned, not completed** by the four-chart implementation. Preserve responsive behavior and roll back source changes if visual QA regresses.
- Only release through the guarded DEV process with an explicit no-migration review; PROD remains unchanged without separate approval.

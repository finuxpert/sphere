# SPHERE — Current Visual and Functional QA (DEV)

This is the current checklist for `rundeck-sphere-dev`. **GitHub QA success is not proof that the current source is deployed or that a one-screen target is met in a live browser.** Take screenshots and record deployed SHA separately.

## Required viewport matrix

| Viewport | Required check |
|---|---|
| 1536 × 864 desktop, 100% zoom | Target: whole Monitoring Overview visible without browser page scroll, with no clipped information |
| 1366 × 768 desktop | Legibility and controlled natural scrolling where necessary |
| 1920 × 1080 desktop | Full-width layout and four charts in one row |
| 393 × 852 Android/mobile | No horizontal overflow, correct stacking, functional dialogs |
| Desktop light/dark | Contrast, focus, status colors, tooltips |

Record `window.innerWidth/innerHeight`, `document.documentElement.scrollHeight/clientHeight`, browser zoom and displayed/active DEV source SHA when assessing one-screen fit. Do not report PASS if important information is clipped using `overflow:hidden`.

## Monitoring

- Top navigation and sidebar are not duplicated; primary sidebar is Monitoring, Jobs & Programs, Data Collection, Reports.
- SAP APP1–APP5 labels, CPU, RAM, Critical WP and actual source timestamps stay aligned; clicking each APP selects the same host's evidence (especially APP5).
- Four metric dropdowns remain usable. Default charts are CPU Usage, Memory Usage, Network and Critical WP.
- At wide desktop width: **4 charts × 1 row**. At smaller widths: 2 or 1 columns. No overlap, blank panels, clipped axes or horizontal page scrollbar.
- Shared 1D/7D/30D/Last Month/3M/6M, Short, Custom, Interval, Avg/Peak and APP filter work and preserve selected data semantics.
- Every chart with data presents readable peak **value, APP, date, time (WIB)**; verify exact timestamp against tooltip and selected bucket detail.
- Network RX/TX, Y: Typical/Y: Full, source NIC/peak and Missing Samples/Full Range controls work without hiding actual peak.
- Warning/Critical thresholds remain accurate across APP-focus and zoom; unobserved windows show gaps rather than zero.
- Bottom row is Jobs & Programs and System Health. Preview shows a bounded two-row priority list and two current workloads, while View Details/View All exposes complete records.
- System Health shows separate availability, SAP issues, server health, events and collection summary with independent missing/stale states.
- No vertical scroll at **1536 × 864** only if all essential overview content is genuinely visible; scroll on smaller screens is acceptable.

## Click and modal flows

- APP card → APP analysis and selected host identity.
- Trend point → saved exact point/bucket detail; workload selection → shared Job/Program Analysis.
- Jobs & Programs Current/Review/Search and pagination have no fabricated completeness.
- Related Events, SAP Checks, Infrastructure, Data Collection and Reports remain reachable.
- Modal Close, Back, Tab, Escape, backdrop and focus restore; no modal content outside viewport. Reduced-motion preference is respected.
- Manual Upload remains a Data Collection action, not Monthly Review's manual findings workflow.

## Evidence semantics

- A missing or stale performance or availability observation is UNKNOWN/PARTIAL, not NORMAL/UP/DOWN by inference.
- APP Critical WP ≠ individual failed SAP job; review candidate ≠ SM37 execution failure.
- CPU for grouped processes may exceed 100%; host RAM ≠ workload PSS.
- WP Trace Error is clearly AT SNAPSHOT or HISTORICAL, not automatically current.
- Historic Avg bucket vs exact Peak At/Peak Value/Collection ID must remain distinct; no nearest-bucket rewrite.
- API/network/collection errors are shown, not replaced by last good values as current.

## Monthly Review / PDF

- Review month and all four Monthly Review tabs are navigable.
- Programs/jobs and confirmed trace errors are sourced from saved SPHERE evidence.
- Table headers, timestamps and thresholds are readable; report copies use common English SAP/IT terms.
- PDF page breaks and long program names remain readable and do not imply unavailable errors or jobs succeeded/failed.

## Validation and sign-off

1. Run `npm run qa` and repository/Trend/Bootstrap tests.
2. Run `npm run qa:visual`, browser boot/geometry QA and any applicable Python unit tests; record actual outcomes.
3. Use guarded DEV release (see [rundeck-development.md](rundeck-development.md)), not a build-only shortcut.
4. Validate public `/dev/` SHA and API health, compare screenshots at the matrix above, and record scroll dimensions.
5. If QA or data trust regresses, rollback DEV. Do not promote PROD based solely on GitHub CI.

Visual sign-off must state date, commit SHA, deployed SHA, tested browser/viewport, PASS/FAIL and any remaining scroll or content limitation.

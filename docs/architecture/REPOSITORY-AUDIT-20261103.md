# SPHERE DEV repository audit — 2026-11-03

## Scope and evidence

This is a **GitHub source-tree audit**, not a statement about deployed files or database state.

- Repository: `finuxpert/sphere`
- Immutable source checkpoint: `dc9a4753d1322b0be62ff7c55d64749c0d9a8f3d`
- Target: `rundeck-sphere-dev` through a maintenance PR; no DEV or PROD deploy.
- PROD UI baseline: `d6ed5eab59937c85080de35d994a8bc6f6592f4d`
- PROD API baseline: `6089dcd054e71845752e47e803a1273dacb94fcf`
- Database `sphere_rundeck_dev` is shared with PROD. **No schema changes, backfills or heavy SQL/load tests in this maintenance batch.**
- The recursive Git tree is complete (`truncated=false`). File size means blob byte size, **not** Vite bundle size.

## Source inventory — before this maintenance PR

| Classification | Files | Total tracked bytes |
| --- | ---: | ---: |
| All tracked files | 562 | — |
| `src/` | 262 | 2,960,076 |
| `backend/` | 106 | 811,266 |
| `scripts/` | 74 | 532,357 |
| `ops/` | 51 | 238,415 |
| `docs/` | 27 | 109,142 |
| `.github/workflows/` | 2 | 6,894 |
| CSS (`*.css`, all folders) | 111 | 1,665,502 |
| JSX (`*.jsx`) | 70 | 851,104 |
| Python under `backend/` | 103 | 809,997 |
| Node test files under `scripts/tests/` | 60 | 307,628 |

There are **zero matching tracked build/cache/temp files** under the scanned patterns (`node_modules`, `dist`, `coverage`, `test-results`, `playwright-report`, `__pycache__`, `.pytest_cache`, `*.pyc`, `*.bak`, `*.orig`, `*.swp`). This is not proof that every generated or obsolete file is absent.

## Verified dependency slices

These edges were read from imports at the checkpoint, not inferred from filenames:

```text
src/main.jsx
  -> src/App.jsx
  -> src/index.css and src/app/*.css

src/tools/components/RundeckMonitoringHistory.jsx
  -> RundeckMonitoringHistoryCore.jsx
  -> RundeckJobsProgramsWorkspace.jsx
  -> RundeckPerformanceNavigation.jsx
  -> RundeckAvailability.jsx / RundeckPerformanceReview.jsx
  -> RundeckWorkspaceDrawer.jsx / RundeckSystemHealth.jsx
  -> RundeckMonitoringHistory.css and multiple cascade/polish layers

src/tools/components/RundeckMonthlyReview.jsx
  -> rundeckMonthlyPdf.js
  -> rundeckMonthlyEnterprisePdf.js
  -> RundeckMonthlyReview.css
  -> RundeckMonthlyFinal20261030.css
  -> RundeckUnifiedExperience20261030.css

backend/rundeck_api.py
  -> backend/rundeck_api_core.py
  -> backend/rundeck_workload_explorer.py
  -> backend/rundeck_job_intelligence.py

backend/rundeck_api_core.py
  -> backend/rundeck_evaluation.py
  -> backend/rundeck_infra_api.py
  -> backend/rundeck_monitoring.py

backend/rundeck_evaluation.py
  -> backend/db/session.py
  -> backend/rundeck_monthly_pressure.py
  -> backend/rundeck_monthly_errors.py
```

This is a **sampled dependency slice**, not a whole-repository proof of unused code or absence of circular imports. Dynamic imports, Vite assets, backend runtime imports, and workflow references require further graph validation before deletion.

## Disposition by risk and verified evidence

| Action | File(s) | Evidence / decision |
| --- | --- | --- |
| **KEEP** | `src/tools/components/RundeckMonitoringHistory.css` (89,742 B) | Monitoring explicitly imports the stylesheet; current selector cascade is unverified for deletion. |
| **KEEP** | `src/tools/components/RundeckCockpitHexV13512.css` (52,851 B) | Referenced from Monitoring; the historical-looking version name does not mean it is dead code. |
| **KEEP** | `src/tools/components/RundeckJobHistory.jsx` (65,136 B) and `.css` (51,476 B) | Live component/stylesheet pair; postpone extraction pending behaviour and visual regression coverage. |
| **KEEP** | `src/tools/components/RundeckMonthlyReview.jsx` (57,740 B) and PDF modules | Monthly and management exports use both PDF implementations; not interchangeable without contract tests. |
| **KEEP** | `backend/rundeck_evaluation.py` (64,168 B) and `rundeck_infra_api.py` (19,366 B) | Calculation and DB-facing code; preserve endpoint contracts and shared-DB safety. |
| **KEEP** | `ops/rundeck/release-dev-fast.sh`, `release-dev-offline.sh` | Separate online/offline release paths, not automatically duplicates. |
| **EXTRACT (this batch)** | Eight pure formatting/interval helpers from `RundeckServerTrend.jsx` | Moved without reimplementing math, timestamps, WIB labels, interval selection or missing-value normalization. |
| **REVIEW FOR CONSOLIDATION (later)** | `RundeckMockupParity.css`, `RundeckVisualRedesignV136.css`, `RundeckUnifiedExperience20261030.css` | Large design layers. Need selector/cascade comparison and deterministic browser screenshots; no deletion authorized yet. |
| **REVIEW FOR SPLITTING (later)** | `scripts/qa-basis-investigation.mjs` (127,178 B), `RundeckJobHistory.jsx`, `rundeck_evaluation.py` | Multi-responsibility candidates by size and code structure, not evidence of unused functionality. |
| **REVIEW DOCS (later)** | `ops/rundeck/OPERATIONS.md` (69,109 B) | Long operational runbook; verify active commands and cross-links before reorganizing. |
| **DELETE** | None in this batch | No complete import/runtime graph or visual proof justifies deleting active files. |

## Maintenance implementation — step 1

- Added `src/tools/components/rundeckTrendFormatting.js`; moved eight existing pure helpers out of `RundeckServerTrend.jsx`: `formatTrendAxis`, `numericTrendSample`, `formatSavedBucketWindow`, `trendAxisSplitNumber`, `gapDurationText`, `gapTimeRangeText`, `gapLabel`, and `resolvedGapIntervalMs`.
- Preserved function implementations and their original formatting/time-zone/cadence constants. Kept component dependencies and API calls unchanged.
- Updated `scripts/tests/rundeck-trend-series.test.mjs` to assert real formatting and interval behaviour instead of matching a function body's source text; registered the suite in `qa:integrity`.
- No CSS selectors, endpoints, SQL queries, migrations, package dependencies, release scripts or PROD files were modified by the refactor.
- Source component moved from 1,395 to 1,328 lines. The additional helper module means **file count increases**, intentionally; this is modularization, not a claim of global file reduction.
- Before/after Vite bundle sizes, latency and pixel parity remain **UNMEASURED** until CI/browser evidence is available.

## Acceptance gates and next steps

1. Confirm branch-only diff and that each moved helper's body matches the original exactly.
2. GitHub PR QA: ESLint, full existing UI regressions, Vite build, Chromium browser boot/layout, management PDF generation, backend monthly tests.
3. Compare output/geometry against pinned release baseline. A geometry/fixture pass alone is **not proof of pixel-identical PROD rendering**.
4. Merge only when all mandatory QA and parity evidence are acceptable; separate DEV deployment approval after merge.
5. Next batches: CSS import/cascade graph, smaller feature-module extractions, then backend route/service/repository slicing without changing calculations. Profile Monthly Evaluation/Storage only with read-safe controlled measurements.

**No PROD branch, service or PostgreSQL mutation is part of this audit.**

## CSS cascade safety — phase 2 (GitHub source only)

- Added `scripts/qa-css-cascade.mjs`, a **read-only**, context-aware inventory of repeated selectors in each CSS file, with `@media`/other at-rule contexts kept separate. This is a *review list*, not proof that rules are redundant or safe to remove.
- Captures Monitoring's direct stylesheet-import order from `RundeckMonitoringHistory.jsx` and ranks stylesheet override pressure alongside `!important` counts and tracked source bytes.
- Added five Node regression checks for selector context, comment/quote/keyframe handling, stable import order and duplicate QA test scheduling. Registered the audit with `npm run qa`.
- Removed the duplicate `rundeck-trend-series.test.mjs` invocation from `qa:trend-focus` (test coverage is retained).
- **One safe CSS consolidation:** In `src/app/accessibility-theme-v13412.css`, two immediately adjacent, identical eight-selector rule lists were merged in place. All six property declarations retain their original order, importance and values; this removes one redundant selector prelude without moving a rule across any cascade boundary. Broader stylesheet deletion and override consolidation still require route-specific browser screenshot comparisons. No CSS file paths, Vite config, backend, database or deployment state changed.

Review the generated audit in GitHub Actions job `Full frontend QA and Vite build`. Run `npm run qa:css-cascade -- --json` for machine-readable evidence.

## Monitoring stylesheet deduplication — phase 3 (source-only)

- Target: `src/tools/components/RundeckMonitoringHistory.css` (no import-path changes).
- Removed **16 earlier declarations** for which a **later identical property and value** exists under the exact same selector text and the same `@media`/at-rule context. Removed the **two empty rules** that resulted. CSS order of all retained declarations remains unchanged.
- Before: 89,742 Git blob bytes, 671 occurrences of `!important`, 512 parsed qualified rules. After: 89,138 Git blob bytes, 657 `!important`, 510 parsed qualified rules. Savings: **604 bytes**, **14 `!important`** and **2 empty rules**.
- Independent in-memory static comparison before GitHub commit: the final normalized value for all **1,335 selector/context/property keys** was identical before and after. This is static declaration parity, **not an exhaustive browser pixel-comparison**.
- Extended CSS regression checks to retain important Monitoring evidence styles and reject the two emptied rules.
- CSS import order, APIs, backend, PDF generation, dependencies, database, deployments and PROD stay unchanged. Full frontend/build, Chromium Monitoring, PDF and backend CI are required before DEV merge.


## Cross-stylesheet safe CSS deduplication — phase 4

Scope: **GitHub DEV source only** from baseline commit 94e5226d671409709114b74e08882774b0245328. Fourteen active CSS files were updated; no CSS import paths or selector lists were renamed. The other stylesheets remain unchanged.

| CSS module | Earlier identical declarations removed | Source bytes reduced |
| --- | ---: | ---: |
| RundeckInfrastructure.css | 24 | 733 |
| RundeckJobHistory.css | 12 | 360 |
| RundeckLiveOverview.css | 4 | 110 |
| RundeckWorkspace.css | 5 | 145 |
| accessibility-theme-v13412.css | 5 | 154 |
| RundeckCockpitHexV13512.css | 2 | 31 |
| RundeckMockupParity.css | 3 | 80 |
| RundeckOperatorFlatV1354.css | 8 | 201 |
| RundeckVisualRedesignV136.css | 2 | 51 |
| RundeckUnifiedExperience20261030.css | 1 | 21 |
| RundeckEvidenceTimeline.css | 4 | 97 |
| RundeckWorkspaceDrawer.css | 2 | 61 |
| RundeckSource.css | 2 | 72 |
| RundeckMonitoringHistory.css | 6 | 252 |
| **Total** | **80** | **2,368** |

Removal criteria: a declaration was eligible only when a later declaration with the **same property name and exact trimmed value** appeared in a rule with the **same normalized selector text** and the **same at-rule context**. String-containing values, ambiguous declarations and candidate removals that would empty an existing CSS block were skipped. All retained declaration ordering stayed intact; no selector list, CSS import, variable, or stylesheet file was deleted.

Source comparison independently confirmed identical final normalized values for **10,079 selector/context/property keys** across all 14 files. Source !important occurrences decreased by **66**. Fourteen fixed-fingerprint tests in scripts/tests/css-cascade-scan.test.mjs enforce the approved winning-value map. This is **static parity**, not full computed-style or pixel-by-pixel proof; the Chromium/layout/browser and PDF QA gates are still required before merging.

**Excluded from this pass:** merging different selector lists, reorganizing media-query blocks, renaming versioned CSS imports, removing used CSS files, changing backend/SQL/API behavior, database maintenance, PROD deployment, or DEV deployment. Remaining repeated rules often encode intentional cascade changes; defer them until route-specific computed-style and visual snapshots can establish safety.


## Job History data-module extraction — phase 5

Scope: **DEV repository refactoring only**, starting from SHA 944da649fd33ab6c7b8b40ef15b954a018fe0359. The large React component src/tools/components/RundeckJobHistory.jsx delegates pure episode/metric/formatting functions to src/tools/components/rundeckJobHistoryData.js. The module reuses the existing sapUiFormat.js formatWib function.

- Ten pure helpers are imported by the React component: rowMetric, selectObservationEpisode, episodeStats, durationText, chartAxisText, chartAxisSplitNumber, temporalText, nearestRow, metricSeriesData and chartProfile. Their internal helper dependencies (numeric, observationEpisodes, average and peakObservation) move with them.
- All three moved source regions were confirmed **byte-identical** to the previous JSX implementation. Reconstructing the previous component by reversing the extraction and import yielded a **byte-identical remainder**. In particular, API fetches, chart component JSX, issue marker placement and React hooks were not changed.
- The component source decreases from 65,011 to 57,340 text characters (7,671 fewer). This is **separation of responsibilities, not an overall repository byte/file-count reduction**; one helper module and one dedicated regression-test file were added.
- Six new behavior tests in scripts/tests/rundeck-job-history-data.test.mjs cover nullable CPU/PSS/WP metrics, 25-minute episode boundaries, selected episode, peak/average statistics, explicit chart gap separators, WIB labels, and profile selection.
- The existing integrity suite runs these tests. Full frontend QA, Chromium Monitoring geometry, management PDF and backend tests remain merge gates. No DB, API, SQL, collector, deployment or PROD changes occurred.

## Monthly period helper extraction — phase 6 (GitHub maintenance PR)

- Baseline: `d018f9838c7671403407364f59ba2e6084255b8f`; `sphere-prod` baseline: `e8d515d0d1400031dc76ad7f266128e9013c67a8`. GitHub tree contains 568 blobs; `src/` 264, backend 106, scripts 77, docs 28. Byte totals represent tracked Git blobs, not deploy artifacts.
- Extracted `monthOptions`, `weekOptions`, `customDayCount`, and custom date validation into the pure `rundeckMonthlyPeriod.js` module. The rendering component retains its existing `MONTHS`/`WEEKS` initialization, `TODAY_WIB` constant, form controls, fetching, chart and PDF logic. The validator receives exactly the existing frozen WIB date through its wrapper.
- Original function bodies were copied unchanged except adding module exports and substituting the explicit `todayWib` parameter for the prior closed-over `TODAY_WIB` variable. Verified by a programmatic reconstruction of `RundeckMonthlyReview.jsx` that is **byte-identical to baseline** after undoing the extraction.
- Added dedicated validation/period-selection tests to the existing integrity QA suite. No CSS, backend, SQL, API, schema, dependency version, visual markup, report calculations or deployment scripts changed.
- No claims of latency, bundle-size or computed-style improvement until benchmark and Chromium evidence. PR parity CI must pass before squash merge.

## Infrastructure chart separation — phase 7 (GitHub maintenance PR)

- Base DEV SHA: `6b2e3384b881817864f2c298bfbc94098db2c4ee`, untouched PROD `sphere-prod` SHA: `e8d515d0d1400031dc76ad7f266128e9013c67a8`.
- Separated the original `SparkChart` SVG React component from `RundeckInfrastructure.jsx` into `RundeckInfrastructureTrend.jsx`. Shared existing metric, sample validity, and WIB/time-axis formatters now live in `rundeckInfrastructureFormatting.js` to avoid code duplication.
- Chart's series ranking, drop-gap segmentation, thresholds, geometry, class names, labels, and React hooks were transferred unchanged; no API, data contract, CSS, SAP signal state, storage logic, database or PDF change.
- Verified source was mechanically reconstructible **byte-identically** by reversing the extraction and import changes. Added numeric/timezone and chart invariants to `qa:integrity`; Chromium/Monitoring regression and backend parity CI are still mandatory before merge.
- Source sizes and bundling must be measured from GitHub/Vite results. Extraction is not proof of runtime speedup or pixel-identical rendering.

## Server trend chart isolation — phase 8 (GitHub maintenance PR)

- DEV baseline: `c52ef60244fd07a158c09a3ef3384913c6f666b9`; protected production branch `sphere-prod` untouched. Repository-only refactor, never a deployment or DB operation.
- Moved the complete `TrendChart` ECharts component into `RundeckServerTrendChart.jsx`, preserving all React hooks, option-building, tooltip escaping, null-gap segmentation, click drilldown, resizing, focus, saved peak annotation and time-axis behavior by exact source transfer.
- Shared labels, bucket list and CSS token palette in `rundeckServerTrendShared.js`; missing observation rules in `rundeckServerTrendGaps.js`. Parent retains saved trend requests, monitoring controls, modal and optional canvas effects. No CSS, API/SQL, backend, monthly PDF or schema changes.
- Dedicated tests check synthetic collection gaps vs explicit availability gaps, retention boundaries, interval precedence, and chart source wiring. Existing source-assertion tests point to the new owning modules, not back to the former parent file.
- A smaller component file does **not** itself prove faster runtime or smaller bundle; keep CI gate and compare baseline before performance claims.

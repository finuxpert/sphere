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

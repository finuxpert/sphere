# SPHERE Engineering Refactoring Roadmap

Baseline date: 24 November 2026 WIB.

Phase: DEV architecture stabilization.
PROD: ON HOLD.

## Measured repository baseline

The read-only tracked-source inventory reported:

| Metric | Baseline |
| --- | ---: |
| Tracked files | 643 |
| Frontend files | 280 |
| Files under src/tools | 232 |
| Backend files | 123 |
| Scripts files | 92 |
| Operations files | 75 |
| CSS files | 112 |
| CSS LOC | 45082 |
| Python files | 137 |
| Python LOC | 25016 |
| JS/React files | 263 |
| JS/React LOC | 34940 |
| Source files over 1000 LOC | 14 |

These are historical baseline measurements, not fixed
expectations for future source revisions.

The baseline includes tracked tests and tooling.
The LOC totals exclude other language categories.

### Unused PDF exporters

At integrated DEV baseline `a4a8888e`, the tracked import graph and repository references had no callers for `src/features/pdf/structuredPdf.js` or `src/tools/components/rundeckMonthlyManagementPdf.js`. The former's last import was removed by `3bf03f33`. The monthly exporter was replaced by the enterprise renderer in `ec6a0d0b`. The current Reports export controller uses the enterprise renderer for Management and A3 and retains the lazy technical export. The historical modules were outside the public asset tree and the Vite entrypoints.

Removing both files reduces tracked files from 648 to 646, tracked source files from 513 to 511 and source lines from 105,086 to 104,256. Relative to this independent baseline, the candidate retains 112 stylesheets, 45,082 CSS lines, 11,658 written `!important` declarations and 15 direct frontend dependencies.

All 39 focused report and code-split tests passed offline. The existing monthly technical, 16:9 Management, A3 and weekly slide fixtures generated expected PDFs. GitHub maintenance CI validates production bundles and browser smoke. Rollback is a source revert.

### Validation at DEV source `cb490c36382ab73eec890d41eec7203ac5182a3b`

The GitHub DEV tip matched the requested baseline at checkout. `git ls-files` reports 647 tracked files, including 280 under `src`, 232 under `src/tools`, 123 under `backend`, 92 under `scripts` and 75 under `ops`. The difference from 643 is the four files introduced by standards PR #127. The tracked extension counts remain 112 CSS, 137 Python and 263 JS/JSX/MJS.

The listed hotspots retain their reported LOC. They represent different boundaries. `RundeckMonitoringHistory.jsx` composes several domains and lazy-loads Reports. `RundeckJobHistory.jsx` and `RundeckSource.jsx` each import their corresponding stylesheet. CSS dependency review must still trace selector ownership, cascade and emitted chunks. PR #117 is the measured precedent for preserving the existing Reports CSS budget.

At this baseline, `rundeck_evaluation.py` combined report orchestration, SQL, cache/locking and deterministic assessment after the period and view extractions in PRs #118 and #119. The assessment function consumes normalized observations without database access. Its environment-backed thresholds are also emitted in report metadata, so they must retain a single definition. Numeric helpers with the same name in other backend modules require a separate contract comparison before consolidation.

## Current source ownership

| Domain or responsibility | Existing owners and dependencies |
| --- | --- |
| Application Shell | `src/main.jsx`, `src/App.jsx`, `src/app/useRoute.js` and the tool registry in `src/tools/index.js` own boot, hash routing and tool loading. |
| Monitoring | `RundeckMonitoringHistory.jsx` coordinates navigation and detail views. `RundeckMonitoringHistoryCore.jsx`, `RundeckServerTrend.jsx`, `RundeckLiveOverview.jsx` and System Health components own Monitoring presentation. |
| Jobs & Programs | `RundeckJobsProgramsWorkspace.jsx` and `RundeckJobHistory.jsx` compose Current, Review and Search with workload and SM37 drilldowns. |
| Reports | `RundeckMonthlyReview.jsx` owns state, requests and lifecycle. Management, evidence, header and PDF/PNG modules already own their respective presentation and exports. |
| Data Collection | `RundeckDataCollection.jsx`, `RundeckSource.jsx` and `RundeckSystemData.jsx` cover source, collection history and manual-upload entry points. |
| ST03N Analysis | `ToolSt03nAnalysis2026.jsx`, `st03nParser.worker.js`, `st03nParser.js` and `st03nAnalysis2026.js` own the browser analysis path. |
| Workload Intelligence | `rundeck_workload_observations.py`, `rundeck_workload_explorer.py`, `rundeck_workload_activity.py` and `rundeck_job_intelligence.py` serve workload observations and distinct SM37 execution evidence. |
| Performance Intelligence | `rundeck_monitoring.py`, `rundeck_trends.py`, `rundeck_network_trends.py` and `rundeck_top_consumers.py` own monitoring and historical analysis. |
| Report Engine | `rundeck_api_core.py` exposes report routes. `rundeck_evaluation.py` owns SQL, cache/locking and response assembly, and calls the reporting period, evaluation view, and monthly pressure/error modules. `rundeck_workload_assessment.py` owns deterministic classification of normalized SAP observations and the shared thresholds used in report metadata. |
| Availability Engine | `rundeck_availability.py` owns service availability separately from performance samples. |
| Evidence Engine | `rundeck_evidence.py` composes saved operational evidence. `evidence_api.py` and the `evidence_*_service.py` modules own analysis history and uploads. |
| Snapshot Engine | `rundeck_report_snapshots.py` and `rundeck_trend_snapshots.py` own snapshot read/freshness behavior. Their respective precompute modules build snapshots. |
| Telemetry Pipeline and Persistence Layer | `rundeck_runner.py`, pollers and store modules handle collection and ingest. `backend/db` owns session, models, repositories and migrations. Several domain modules still issue SQL directly. |
| Release Pipeline, Quality Gates and Repository Maintenance | `ops/rundeck` owns guarded releases and repository maintenance. `scripts`, `backend/tests` and `.github/workflows` own build and regression gates. |

## Priority hotspots

| File | LOC |
| --- | ---: |
| RundeckMonitoringHistory.css | 2667 |
| RundeckJobHistory.css | 1707 |
| rundeck_evaluation.py | 1340 |
| RundeckSource.css | 1283 |
| accessibility-theme-v13412.css | 1281 |
| RundeckLiveOverview.css | 1260 |
| RundeckCockpitHexV13512.css | 1229 |
| index.css | 1141 |
| evidence-history-ux.css | 1130 |
| RundeckServerTrend.jsx | 1074 |

Assess dependency ownership and actual usage before
moving, renaming, extracting or deleting code.

Duplicate basenames alone do not prove duplicated logic.

## Execution roadmap

- [x] Repository hygiene Phase 1 and Phase 2.
- [x] Permanent hygiene guardrails.
- [x] Weekly OS-level GitHub audit.
- [x] Initial architecture inventory.
- [x] Merge canonical engineering standards in PR #127.
- [ ] Complete dependency and duplicate assessment.
- [x] Map existing frontend and backend ownership.
- [ ] Establish naming migration plan.
- [ ] Extract coherent backend responsibilities.
  - [x] Extract and validate deterministic workload assessment in the source of PR #128.
- [ ] Incrementally modularize frontend domains.
- [ ] Consolidate CSS with visual and bundle parity.
- [ ] Review dependencies and dead-code candidates.
- [ ] Establish automated architecture regression checks.
- [ ] Measure API and frontend performance.
- [ ] Perform guarded consolidated DEV release.
- [ ] Complete integrated functional and visual QA.
- [ ] Evaluate separate PROD approval.

## Selected scope

The extraction moved deterministic workload assessment into `backend/rundeck_workload_assessment.py` (280 lines). `rundeck_evaluation.py` now has 1,092 lines, down from 1,340 at baseline. It still exposes `assess_workload` at its original import path. Both classification and report metadata use the same thresholds. SQL, cache, period handling and response assembly remain in the report service.

The review branch is `refactor/dev-workload-assessment`, tracked in [PR #128](https://github.com/finuxpert/sphere/pull/128). The recovered local source and the published extraction at `185c6ae6c61ae942eb4160608521c09c8f482a0a` had the same Git tree. The [development workflow](../standards/ai-coding-workflow-style.md#engineering-agent-execution) records autonomous execution and operator approval boundaries.

### Validation checkpoint

| Scope | Evidence |
| --- | --- |
| Source | AST parity for all 27 original module-level functions and 28 top-level assignments across the two modules. The original import resolves to the extracted callable. The assessment module imports only Python standard-library modules. |
| Offline backend | Python 3.12 in the isolated virtual environment passed compilation. Targeted classification, paging, weekly/monthly report, snapshot and workload regression ran 83 tests with 82 passes and one PostgreSQL fixture skip. |
| Offline build and bundle | The full `npm run qa` chain passed on Node 20.19.4, including Vite and all five bundle checks. Reports used 68,004 of 78,000 bytes for JS and 18,464 of 20,000 bytes for CSS. The sandboxed attempt failed on subprocess permissions. Node 26 ran in GitHub Actions because the local host lacks `libatomic.so.1`. |
| GitHub CI | At `185c6ae6c61ae942eb4160608521c09c8f482a0a`, [maintenance parity](https://github.com/finuxpert/sphere/actions/runs/45329539089) passed full Node 26 QA, Vite build, all five bundle checks, browser smoke, PDF regression and backend report regression. Reports used 67,978 of 78,000 bytes for JS and 18,464 of 20,000 bytes for CSS. [PostgreSQL aggregate parity](https://github.com/finuxpert/sphere/actions/runs/45329539073) and [snapshot contracts](https://github.com/finuxpert/sphere/actions/runs/45329539057) passed separately. |
| Live runtime | Pending for this candidate. This is a backend source change with documentation. Any separately authorized release uses the guarded full-stack DEV process. PROD remains ON HOLD. |

The evidence contracts retain APP and collection identity, missing-evidence handling, confidence limits and the distinction between sampled WP signals and authoritative SM37 execution. No performance measurement was taken for this extraction. Source rollback is a revert of the refactor commit.

Final review extended the existing workflow path filters to cover changes confined to the assessment module. DEV maintenance CI also runs the existing workload classification suites on each DEV pull request. The resulting backend test list passed all 90 tests locally. Engineering-owner approval governs the merge of PR #128.

After review of this scope, assess the remaining SQL and cache ownership independently. Keep Issue #111 performance work measured and separate. Defer CSS relocation until the import and selector audit identifies a bounded change that can satisfy the current bundle budget and visual parity gates.

## Acceptance criteria

- No unexplained behavioral regression.
- No public API or data contract breakage.
- No invented SAP evidence.
- No unjustified bundle budget regression.
- No uncontrolled expansion of CSS override layers.
- No arbitrary new versioned source filenames.
- No duplicated implementation without justification.
- No deployment outside canonical release procedures.
- No unexpected PROD change.

## Execution policy

Use small independently reviewable PRs.

Do not start all refactoring workstreams simultaneously.

Complete assessment before selecting implementation scope.

Do not claim source cleanup is a deployed runtime change.

Record before/after measurements for each optimization.

### Frontend dependency cleanup checkpoint

At DEV baseline `cb490c36382ab73eec890d41eec7203ac5182a3b`, the tracked source, worker, CSS, HTML, QA and release references did not use `date-fns`, `dexie`, `framer-motion`, `idb-keyval` or `sql.js`. Remove these five direct runtime declarations and their orphaned lock entries. Retain `react-is` for the Recharts peer dependency.

The candidate reduces direct runtime dependencies from 20 to 15 and package-lock entries from 375 to 368. No retained lock entry changed. The dependency manifests removed 80 physical lines. The 512 tracked CSS, Python and JS/JSX/MJS source files, their 105,038 lines at this independent baseline, and the application import graph are unchanged.

`npm ci`, lint and all 22 focused frontend tests passed in the isolated worktree. The [PR #130 maintenance workflow](https://github.com/finuxpert/sphere/actions/runs/45340731707) passed the clean Node 26 locked install, full QA, Vite build and browser smoke at `ff718f24acc9692f771b7e2cf39c24ccbfbf75fe`. All five budgeted assets had the same byte sizes as the [PR #129 baseline](https://github.com/finuxpert/sphere/actions/runs/45340260338). Reports JS measured 67,978 bytes and Reports CSS 18,464 bytes in both runs. Application performance was outside this measurement.

[PR #129](https://github.com/finuxpert/sphere/pull/129) covers the CSS audit correction. [PR #130](https://github.com/finuxpert/sphere/pull/130) changes the build dependency manifest and lockfile. Both await engineering-owner approval. Release requires separate approval. Source rollback is a revert of the relevant commit.

## Current operational checkpoint

Repository hygiene is complete.

PR 126 merged at DEV source 7378c36.
Offline hygiene regression tests: 28 PASS.
GitHub maintenance parity CI: PASS.

Automatic maintenance:

- Host: mail
- OS: AlmaLinux 8.10
- User: sadmin
- Schedule: Sunday 03:00 Asia/Jakarta
- Initial service execution: PASS
- GitHub branches: 6
- Actions runs scanned: 371
- Branch candidates: 0
- Actions candidates: 0
- Mode: audit-only

No application deployment or PROD change resulted
from repository hygiene or scheduler installation.

Read AGENTS.md and the canonical documentation index
before continuing this roadmap.

## DEV source assessment and CSS audit checkpoint

The assessment used DEV source `cb490c36382ab73eec890d41eec7203ac5182a3b` after standards PR #127 merged. [PR #128](https://github.com/finuxpert/sphere/pull/128) completed final review at `5c1f8f5069b0ca16e52b222cf8276e441dcd6d14` with maintenance, PostgreSQL parity and snapshot CI passing. Its merge awaits engineering-owner approval. The CSS audit correction is independently based on DEV.

| Metric | DEV baseline | After audit correction |
| --- | ---: | ---: |
| Tracked files | 647 | 647 |
| Tracked CSS, Python and JS/JSX/MJS source files | 512 | 512 |
| Physical lines in those extensions, including tests and tooling | 105,038 | 105,054 |
| CSS files / physical lines | 112 / 45,082 | 112 / 45,082 |
| CSS `!important` declarations | 11,658 | 11,658 |
| Source files above 1,000 lines | 14 | 14 |
| Adjacent duplicate declaration hits across tracked CSS | 9 false positives | 0 hits |

The change adds a 16-line QA fixture. A property-name suffix could previously make `min-height` and `height`, or `-webkit-text-size-adjust` and `text-size-adjust`, appear identical. The scanner now requires a declaration boundary and compares the whole property name. All nine matches were reviewed in context. The 29 focused tests passed, including the new fixture and the existing effective-style checkpoints. The diff touches QA and this roadmap. Rollback is a source revert.

### Findings and next scopes

| Area | Evidence and decision |
| --- | --- |
| CSS ownership and cascade | Existing hygiene QA found references for all 112 stylesheets, zero byte-identical stylesheets and zero unreferenced candidates. The lexical cascade scan found 493 repeated selector/context groups and 643 extra blocks within files. Across files it found 703 distinct selector strings and 618 distinct selector/context pairs present in multiple files. These use the existing cascade scanner's normalized selector and at-rule context, a separate count from the earlier 685-candidate inventory. |
| CSS import order | The source graph contains 117 stylesheet import statements from 38 owners, including 38 ordered Monitoring imports and 13 enterprise theme imports. Start the next CSS scope with one selector family under a single owner. Compare matches and specificity under each relevant media query, state and layer, including the Bootstrap layer and theme/accessibility overrides. Compare computed desktop/mobile styles and emitted chunks before consolidating. Existing visual and bundle budgets govern the change. |
| Static dependencies and dead-code review | Literal JS imports, re-exports and worker URLs produced 156 application modules, 295 edges and zero cycle members. The Python AST graph covered 73 backend modules and 160 local import edges, excluding tests and migrations, with zero cycle members. These static counts use narrower scopes than the earlier frontend inventory. Eleven JS modules were unreachable from `src/main.jsx` in this graph. Several are read or imported by QA, including `RundeckLiveOverview.jsx` and `rundeckInfraDisplaySemantics.js`. Check all entrypoints and contract tests before removing a domain-local cluster. |
| File and logic duplication | SHA-256 found zero duplicate source files and five byte-identical pairs of public icon/favicon assets. Preserve published asset paths referenced by HTML, manifests and branding. A static comparison found four Python signature/body groups and six JS function-token groups across files. Review call-site contracts before reuse. Candidates include Evidence Engine list normalization and a Cases date formatter. The identical `_engine` wrappers belong to separate persistence callers. Seven Python top-level imports lacked a local AST reference, including `_evaluation_health`, which is a tested re-export. |
| Package dependencies | Six direct npm packages had no literal imports. Recharts declares `react-is` as a peer, so retain it. Review `date-fns`, `dexie`, `framer-motion`, `idb-keyval` and `sql.js` in one dependency scope using a clean locked install, the full QA gate and before/after bundle output. Count a removal only after that comparison. |
| Naming and compatibility | Filename heuristics found 55 version/date/temporary-name candidates and 87 CSS filenames outside kebab-case. Review per owner before renaming. Keep version markers required by parser compatibility, retained telemetry, migrations or deployment contracts. The V15 parser's UI/worker parity is covered by an existing test. |
| Backend ownership and performance | Assess report SQL and cache/locking after PR #128 lands. Use the existing query and snapshot parity suites. Establish a controlled cold/warm benchmark with fixtures before claiming performance gains. Record API P50/P95, query work, payload, cache behavior, CPU, memory and frontend load/render metrics in the scope that measures them. |

Application deployment and live runtime validation are outside this source checkpoint. PROD remains ON HOLD.

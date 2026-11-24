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
- [ ] Merge canonical engineering standards.
- [ ] Complete dependency and duplicate assessment.
- [ ] Map existing frontend and backend ownership.
- [ ] Establish naming migration plan.
- [ ] Extract coherent backend responsibilities.
- [ ] Incrementally modularize frontend domains.
- [ ] Consolidate CSS with visual and bundle parity.
- [ ] Review dependencies and dead-code candidates.
- [ ] Establish automated architecture regression checks.
- [ ] Measure API and frontend performance.
- [ ] Perform guarded consolidated DEV release.
- [ ] Complete integrated functional and visual QA.
- [ ] Evaluate separate PROD approval.

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

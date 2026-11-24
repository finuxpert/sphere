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

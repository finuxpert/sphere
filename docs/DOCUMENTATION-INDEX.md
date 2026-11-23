# SPHERE Documentation

**Index reviewed:** 24 November 2026 (WIB). This index prioritizes the current `rundeck-sphere-dev` source, latest DEV maintenance decision and live deployment safeguards. Dated snapshot/release records remain historical evidence, **not assertions about the active runtime**. Verify deployed DEV web/API SHA separately before claiming a release is running.

## Start here

| Reference | Purpose |
|---|---|
| [Current DEV maintenance / PROD release gate](../ops/rundeck/DEV_FIRST_MAINTENANCE_AND_PROD_PROMOTION.md) | **Primary change status:** cleanup first, consolidated operator QA later; PROD ON HOLD |
| [GitHub branch and documentation hygiene](operations/REPOSITORY_HYGIENE_20261124.md) | **24 Nov audit:** 54 branches, 40 merged-PR cleanup candidates; safe deletion policy and dry-run script |
| [Repository audit — 3 November 2026](architecture/REPOSITORY-AUDIT-20261103.md) | Historical measured tree/dependency audit, not a 24 Nov live inventory |
| [Project README](../README.md) | Architecture, environment boundaries and quick start |
| [Current Features & Flow](CURRENT-FLOW-AND-FEATURES.md) | Current operator workflow and evidence semantics |
| [Rundeck Development](operations/rundeck-development.md) | **Primary DEV full-stack release procedure** and migration guard |
| [Operations & Rollback](../ops/rundeck/OPERATIONS.md) | Production safety, credentials, recovery and rollback |
| [Enterprise UI Standard](standards/SPHERE-ENTERPRISE-UI-STANDARD.md) | Layout, terminology, responsive rules and data integrity |
| [Visual QA](standards/VISUAL-QA.md) | Browser, viewport, interactions and accessibility acceptance |

## Technical references

| Reference | Purpose |
|---|---|
| [Rundeck Integration](operations/RUNDECK_INTEGRATION_RUNBOOK.md) | Collection/readiness, REST API access and role boundaries |
| [SAP Job Intelligence](technical/BASIS-JOB-INTELLIGENCE.md) | CPU, memory, WP trace and SM37 interpretation |
| [Six-month History](technical/rundeck-historical-analysis-six-months.md) | Time windows, aggregation and retention |
| [Monthly Review WP Errors](technical/monthly-review-wp-error-dev-validation.md) | Source-backed review and historical trace evidence |
| [Legacy Telemetry Compatibility](technical/LEGACY-TELEMETRY-COMPATIBILITY.md) | Legacy ingest/data contract |
| [Development Workflow](standards/ai-coding-workflow-style.md) | Change review and validation rules |
| [Observability](../ops/observability/README.md) | Collector metrics and alert rules |
| [Offline DEV Deployment](../ops/rundeck/OFFLINE-DEPLOY-DEV.md) | Approved offline contingency, separate from the normal release |
| [Persistent Report Snapshots V1 — DEV](../ops/rundeck/REPORT_PERSISTENT_SNAPSHOT_DEV_ROLLOUT.md) | **Operational checkpoint 6 Nov 2026**: deployment SHA, five snapshots, measured HTTP latency, scheduled worker, rollback, pending validation |
| [Split DISTINCT DEV SQL](../ops/rundeck/REPORT_SPLIT_DISTINCT_DEV_ROLLOUT.md) | DEV-only SQL feature gate and query-parity background |
| [Reports frontend modularization — phase 1](../ops/rundeck/REPORT_FRONTEND_REFACTOR_PHASE1_20261123.md) | Management/chart component extraction, PR #115 (merged); confirmed UI-only deploy |
| [Reports evidence/header/export — phase 2](../ops/rundeck/REPORT_FRONTEND_REFACTOR_PHASE2_20261123.md) | Evidence, selectors and PDF/PNG module boundaries, PR #116 (merged); confirmed UI-only deploy |
| [Backend reporting WIB periods](../ops/rundeck/REPORT_BACKEND_PERIOD_REFACTOR_20261123.md) | Pure calendar helpers, PR #118 (merged in GitHub; backend runtime not verified) |
| [Backend evaluation presentation](../ops/rundeck/REPORT_BACKEND_EVALUATION_VIEW_REFACTOR_20261123.md) | Pagination/assessment view helpers, PR #119 (merged in GitHub; backend runtime not verified) |

## DEV source vs deployment checkpoint — 23/24 November 2026

- **Latest operator-confirmed DEV UI-only deployment:** `5978b757`, `FINAL=PASS MODE=DEV_UI_ONLY`, `BACKEND=UNCHANGED`, `PROD=UNCHANGED`. This is not proof that subsequent backend merges are active.
- **GitHub backend source refactors:** PR #118 and #119 merged and passed automated QA, but the DEV backend runtime has not been re-deployed or verified for those commits.
- **CSS refactor PR #117:** closed **without merge** after exceeding existing Reports bundle limit; original CSS remains the source of truth. Do not silently increase the budget.
- **Future manual QA:** finish approved DEV maintenance first; perform one consolidated browser/data/PDF/performance QA at the final candidate. Automated PR/CI regression is mandatory throughout. PROD remains ON HOLD.
- **Open work:** [Issue #111 — SQL/cold evaluation](https://github.com/finuxpert/sphere/issues/111) requires measured DEV performance and explicit release gating.

## Historical records — not active runbooks

Retained for audit and recovery provenance. Do **not** run dated commands, assume historical QA is a current PASS, or treat old UI specifications as the present layout.

- [DEV Monitoring one-screen implementation, 30 October](archive/DEV_MONITORING_ONE_SCREEN_20261030.md) — implementation record; current CSS is authoritative.
- [Bootstrap foundation implementation, 30 October](archive/SPHERE-BOOTSTRAP-DEV-20261030.md) — staged adoption record; Bootstrap is not the entire styling system.
- [DEV full-stack recovery, 15 October](archive/SPHERE_DEV_FULLSTACK_RELEASE_RECOVERY_20261015.md) — incident and recovery context.
- [25-point DEV finishing, 20 October](archive/rundeck-finishing-25-dev-20261020.md) — change/evidence manifest.
- [Frontend-only UI promotion](operations/SPHERE_PROMOTE_DEV_UI_TO_PROD.md) — specialized, independently approved procedure; **not** the default deployment path.
- [v1.35.0 UI promotion](archive/SPHERE_V135_PROD_UI_PROMOTION.md) — pinned historical PROD promotion.
- [DEV v1.34.x release history](releases/README.md) — retained release records.
- [Presentations](presentation/) — competition/deck evidence, not production guidance.

## Source of truth and documentation maintenance

1. **Runtime:** observe the live DEV/PROD release SHA and service checks; a commit, documentation page or CI PASS does not prove deployment.
2. **Source:** verify the current `rundeck-sphere-dev` code, tests and API contracts before updating behavior descriptions. For Monitoring, Bootstrap provides the four-chart grid; `src/tools/components/RundeckOneScreenDev.css` defines the desktop lower-panel **58% Jobs & Programs / 42% System Health** split.
3. **Release:** use the guarded DEV wrapper only after independent migration review. PROD is a separate explicit approval. Never use historical one-off commands as a shortcut.
4. **Evidence:** preserve missing/stale/unknown states and the SM37 trust boundary; historical WP errors are not automatically failed SAP jobs.
5. **Branch cleanup:** use the [live GitHub audit and guarded dry-run procedure](operations/REPOSITORY_HYGIENE_20261124.md); preserve active branches, open PR heads/bases and closed-unmerged work.
6. **Documentation cleanup:** update this index when moving documentation. Preserve audit history and check links before removing or renaming files. Never delete source CSS or tests merely because a dated document is obsolete.

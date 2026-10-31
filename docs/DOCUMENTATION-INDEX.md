# SPHERE Documentation

**Current scope:** `rundeck-sphere-dev` source, reviewed 30 October 2026. Documentation describes the repository, not necessarily the version running on JAHSVR-SPHERE. Confirm the deployed web/API SHA separately.

## Start here

- [Repository Architecture and Refactoring](standards/REPOSITORY-ARCHITECTURE.md) — stable filenames, module ownership and before/after gates.

| Reference | Purpose |
|---|---|
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
5. **Cleanup:** update this index when moving documentation. Preserve audit history and check links before removing or renaming files. Never delete source CSS or tests merely because a dated document is obsolete.

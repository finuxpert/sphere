# SPHERE Documentation Index

**Current scope:** Rundeck-integrated SPHERE `rundeck-sphere-dev`. Updated 30 October 2026 from repository source. The source and deployment runtime may differ. Confirm live web/API release SHA on the host before claiming an implementation is deployed.

## Maintained product and operations references

Architecture and file naming: [SPHERE Codebase Architecture](ARCHITECTURE.md).

| Document | Authority |
|---|---|
| [README](../README.md) | Project entry, branch topology, current feature summary |
| [Current Flow and Features](CURRENT-FLOW-AND-FEATURES.md) | Current source-level user workflow and evidence semantics |
| [Enterprise UI Standard](SPHERE-ENTERPRISE-UI-STANDARD.md) | Four-chart Monitoring, partial Bootstrap, responsive design, data-safe one-screen target |
| [Visual QA](VISUAL-QA.md) | Desktop/mobile/scroll/keyboard/modal acceptance |
| [Rundeck Development](rundeck-development.md) | Current guarded DEV full-stack release, migration checks, runtime separation |
| [Rundeck Integration](RUNDECK_INTEGRATION_RUNBOOK.md) | Collector and Rundeck access contract |
| [SAP Basis Job Intelligence](BASIS-JOB-INTELLIGENCE.md) | WP/trace/SM37 trust boundary |
| [Six-month Historical Analysis](rundeck-historical-analysis-six-months.md) | Historical range, bucket and retention semantics |
| [Monthly Review WP Errors](monthly-review-wp-error-dev-validation.md) | Source-backed review/error validation |
| [Legacy Telemetry Compatibility](LEGACY-TELEMETRY-COMPATIBILITY.md) | Necessary legacy input/data contract |
| [Development Workflow](ai-coding-workflow-style.md) | Change, QA, documentation rules |
| [Operations](../ops/rundeck/OPERATIONS.md) | Operational recovery, permissions, rollback and retention |
| [Observability](../ops/observability/README.md) | Prometheus collector metrics and alert rules |

## Specialized or historical material (not current release instructions)

- [Frontend-only promotion](SPHERE_PROMOTE_DEV_UI_TO_PROD.md) and [Historical v1.35.0 PROD approval](SPHERE_V135_PROD_UI_PROMOTION.md): only for separately approved, frontend-only release/promotion procedures. Do not use them for full-stack changes.
- [15 October full-stack recovery](SPHERE_DEV_FULLSTACK_RELEASE_RECOVERY_20261015.md) and [20 October 25-point finishing evidence](rundeck-finishing-25-dev-20261020.md): historical incidents/change records, **not** active release procedures.
- [Release history](releases/README.md) and [Presentations](presentation/): audit/presentation history, not the runtime source of truth.
- [Offline DEV release](../ops/rundeck/OFFLINE-DEPLOY-DEV.md): separate guarded offline contingency.

## Cleanup decision

Per-version UI iteration notes from 12–15 October (old hexagon/honeycomb, outdated three-chart layout, v1.35.2–1.35.6 snapshots) and the old build-only/CLI walkthroughs have been removed from the active docs tree because they conflict with the current four-chart Monitoring, compact preview and guarded full-stack deployment procedure. Their commits remain recoverable in Git history. **Do not delete source CSS or tests solely because a historical documentation file was removed.**

## Release rule

For a reviewed no-schema-migration DEV release, use `SPHERE_DEV_MIGRATION_DECISION=skip bash ops/rundeck/release-dev-fast.sh` from the clean DEV checkout. The wrapper guards QA, backend tests and deployment. Do not claim visual or performance success without browser/benchmark evidence. PROD changes always require explicit independent approval.

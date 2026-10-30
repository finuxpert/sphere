# SPHERE — Development Workflow

This is the maintained coding and review guidance for `finuxpert/sphere`. DEV and PROD are distinct release lines sharing JAHSVR-SPHERE.

## Change sequence

```text
Audit source → isolate requirement → edit DEV → regression QA → browser review → guarded DEV release → verify active SHA → separate PROD approval
```

- DEV branch `rundeck-sphere-dev`, PROD branch `rundeck-sphere-prod`; `sphere-dev`/`sphere-prod` belong to the separate Manual Upload Logs line.
- Preserve raw SAP evidence, stable APP/collection identity, independent freshness, SM37 authority and missing-data semantics.
- Do not fabricate backend measurements, issue verdicts or performance-improvement claims.
- Prefer small, reversible changes with an explicit rollback path. Avoid new CSS override layers when an existing component/style can be consolidated safely.

## Active frontend workspaces

- `#/tool/analyzer` — ST03N Analysis
- `#/tool/logs` — Performance Analysis
- Primary Performance sidebar: Monitoring, Jobs & Programs, Data Collection, Reports.
- Four configurable ECharts panels in Monitoring; Bootstrap Grid is partial, not a full design-system migration.
- APP/Job/System investigations are source-aware dialogs/drawers; do not duplicate primary navigation for existing detail destinations.

## Backend/data boundary

Rundeck collects SAP-side telemetry; Python ingestion normalizes retained evidence; PostgreSQL retains data; FastAPI exposes API; React renders. Correlation is evidence, not proof of causation. Sampled WP statuses or trace errors must not be called failed SM37 job executions without authoritative evidence.

## Validation

- `npm run qa`: lint, contract/data/Trend/cockpit tests and build.
- `npm run qa:visual` and actual desktop/mobile browser inspection are separate, necessary for visual changes.
- `npm run perf:baseline:dev -- --samples=10`: sequential read-only DEV API baseline; do not call it a real-world page load score.
- Verify source branch, DEV API/web active SHA, public route, and no unexpected PROD changes.

For reviewed **no-migration** DEV releases, use the single guarded `ops/rundeck/release-dev-fast.sh` wrapper. Never bypass required migration review, forcibly reset a checkout or substitute frontend-only deployment when backend code changed.

## Documentation contract

- [Documentation Index](../DOCUMENTATION-INDEX.md) is the canonical map.
- [CURRENT-FLOW-AND-FEATURES.md](../CURRENT-FLOW-AND-FEATURES.md) describes current product behavior.
- [SPHERE-ENTERPRISE-UI-STANDARD.md](SPHERE-ENTERPRISE-UI-STANDARD.md) describes intended UI structure, accessibility and Bootstrap scope.
- [VISUAL-QA.md](VISUAL-QA.md) is the browser acceptance checklist.
- [rundeck-development.md](../operations/rundeck-development.md) is the guarded release runbook.
- [../ops/rundeck/OPERATIONS.md](../../ops/rundeck/OPERATIONS.md) owns production operational/rollback safeguards.

Versioned design experiments and build-only shortcut notes are **not** active runbooks. When modifying source, update current docs without claiming GitHub CI equals live deployment.

## Change record format

Record: branch, source commit, files affected, behavior changed, QA result, live deployment status, measured result (if any), PROD impact, rollback, outstanding issue. Use clear commit messages such as `docs: sync current DEV contract and remove superseded UI notes`.

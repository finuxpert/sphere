# SPHERE v1.35.0 DEV — Hybrid analysis workspaces

Status: **GitHub source implemented; server build/deploy and operator visual acceptance pending.**
Repository: `finuxpert/sphere`, branch `rundeck-sphere-dev`.
Keep `rundeck-sphere-prod`, backend, database, Rundeck credentials and jobs unchanged.

## What changed

- New `SphereAnalysisWorkspace.jsx` and `.css`: full viewport investigation surface, keyboard-accessible navigation and shared Back/Close behavior via the existing `RundeckWorkspaceDrawer` focus/escape contract.
- Existing APP quick detail remains a compact dialog. Job Performance, Jobs Review, SAP Issues / Availability, Correlated Events / Observation History, Infrastructure and System Data use the new workspace presentation. This is a **full-screen portal workspace**, not an entirely new URL router.
- Jobs & Programs Review now offers a real-data two-column detail panel: selected workload, evaluation reasons, CPU Avg/Peak, PSS Avg, process count, and observation count. The drilldown reuses the pre-existing selected-job flow. No review status, recommendation or SM37 execution status is invented.
- Overview Live workload page size adapts from 3 to 9 retained rows based on viewport height; total vs loaded counts and searching only loaded observations are unchanged.
- Job History, Correlated Events, Observation History and Review Quick Analysis are lazy-loaded with visible loading fallbacks. Chart and API semantics are unchanged.
- Version label is v1.35.0-dev.

## Grounding and limitations

All job/host timestamps, availability and freshness, SAP indicators, filesystems and workload metrics remain backed by existing SPHERE components/APIs. SAP WP Critical count is never substituted with a percentage; PSS and host RAM remain distinct; grouped multicore CPU may exceed 100%; correlation is not proof of causation. SM37 remains authoritative for execution status and cannot be inferred from observation history.

The SAP Checks workspace navigates between Issues and Availability tabs using existing data. The System Data workspace keeps the existing PDF action, which opens the current PDF preview workflow rather than embedding an unverified document. Visual design references are not used as source data.

## Release (operator)

The installed frontend-only `sphere deploy dev` fetches DEV, builds with Vite, verifies artifact SHA, switches the DEV web symlink, checks HTTPS and keeps rollback. It does **not** run Playwright, UI snapshot suites, lint, database migrations or backend deploy. On an already-current SHA, it skips redundant build/deploy.

```bash
sphere deploy dev
```

The command above is to be run as root on JAHSVR-SPHERE **after reviewing GitHub diff**. It is not executed through this document. Build success, deployed status and operator screenshot acceptance must be reported separately. Do not promote to PROD without separate approval.

## Operator screenshot checklist (manual)

Review desktop Overview, Job / Program Performance, Jobs & Programs Review with selected row, SAP Issues and Availability, Correlated Events and Observation History, Infrastructure, System Data/PDF action, APP quick detail, and small-screen workspace navigation. Report regressions with screenshots and commit SHA. No automated visual suite is required for routine UI iterations.

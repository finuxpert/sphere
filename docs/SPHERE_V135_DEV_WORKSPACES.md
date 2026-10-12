# SPHERE v1.35 DEV — Popup-first analysis

**Status:** GitHub DEV updated, server build/deploy and operator screenshot check pending.
Repository: `finuxpert/sphere`, branch `rundeck-sphere-dev`.

## UX decision (2026-10-12)

All analyses **remain popup dialogs layered over the Overview**, not new pages and not full-screen routes. The prior fullscreen workspace experiment was reverted on user request, and the unused `SphereAnalysisWorkspace.jsx` and `.css` files were deleted.

The existing `RundeckWorkspaceDrawer.jsx` continues to own accessible popup Back, Close, Escape, focus trapping and scroll behavior. Existing related-analysis tabs remain only where appropriate (Issues/Availability, Evidence/History). The dashboard remains visible behind its dimmed backdrop. APP Analysis, Job / Program Performance, SAP Checks, Correlated Events, Observation History, Infrastructure, System Data and Review retain their existing popup flows and APIs.

## Retained improvements

- Live Jobs & Programs can display 3–9 **real loaded rows** depending on viewport height; pagination and observed-vs-loaded semantics remain.
- Job History, Correlated Events, Observation History and Review Quick Analysis are lazy-loaded only on use, with loading fallback. No changes to SAP API payloads.
- APP cards, compact six-button Operational Analysis grid, per-APP selection, timestamp and source provenance remain from the current DEV cockpit.
- Version label stays `v1.35.0-dev` for this DEV iteration, not PROD.

## Data correctness

Grouped multicore CPU can be above 100%; PSS workload is not RAM host; Critical WP is a count; SM37 execution status remains authoritative and **must not be inferred** from workload observations. Infrastructure freshness and SAP source freshness must remain separate. Correlation does not establish causality. No reference screenshot sample numbers are imported.

## Release instructions

Run as root on JAHSVR-SPHERE:

```bash
sphere deploy dev
```

This fetches the DEV branch, performs a Vite build, releases frontend-only, verifies HTTPS and retains prior release for rollback. It does not run Playwright or UI screenshot QA, backend deployments, DB migration, or modify PROD. If the build fails, do not deploy.

After `FINAL=PASS`, visually review the Overview and at least Job Performance, SAP Checks, Infrastructure and Correlated Events **as popups**; send screenshots for follow-up correction.

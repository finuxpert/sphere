# SPHERE DEV — 25-point SAP Basis finishing package (20 Oct 2026)

Scope: `rundeck-sphere-dev` **only**. No PROD deployment, migration or backend
threshold modifications. This manifest records source changes, not a claim of
successful build/visual/runtime QA.

## A. Performance Trends and Time Range

1. [x] Flat direct presets: 1D / 7D / 30D / Last Month / 3M / 6M with thin selected underline.
2. [x] One compact Short dropdown (30M, 1H, 3H, 6H) + Custom date range.
3. [x] Real ECharts remains the primary idle data surface; braid is low-opacity and pointer-transparent.
4. [x] Retain WIB daily buckets, saved-sample coverage and missing ≠ zero; 6M can have gaps if data was purged.

## B. Jobs & Programs Review

5. [x] Hide duplicate Jobs & Programs title inside the modal, retaining the outer accessible modal heading.
6. [x] Show saved-evaluation host evidence under each job/program, or explicit unavailable.
7. [x] Make Review filters, period selections and tab treatments subdued and consistent.
8. [x] Increase Basis Reason contrast, preserve source reason and baseline tooltip; row click opens analysis.
9. [x] Retain true paginated Review/Current view without an additional constrained vertical table scroller.

## C. Related Events and Rundeck Collections

10. [x] Clarify Outside Correlation Window independently from overall timeline count.
11. [x] Rename Run History to Rundeck Collection History (not SM37 execution history).
12. [x] Explicitly label host-scoped Critical WP in each collection observation.
13. [x] Keep original source timestamps and selected collection refs visible.
14. [x] Add Investigation Summary with **Cause not established**; timing is not causation.

## D. SAP Checks

15. [x] Separate verified Active Findings, unknown/unavailable evidence, and Normal counts.
16. [x] Display availability freshness and last verified source timestamp; stale is not current.
17. [x] Replace ambiguous LAST counts with “Last check: n/n UP / PASS”.
18. [x] Move Incident History to the full-width section below Technical Checks + SAP Indicators;
       allow the drawer body to own vertical scrolling.
19. [x] Keep SM37 readiness separate from execution status; unavailable does not mean failed SAP jobs.

## E. Job / Program Performance Analysis

20. [x] Distinguish Selected Period saved observations from Latest Collection and selected snapshot.
21. [x] Separate Snapshot Errors from Retained Historical Trace Errors; historical ≠ active.
22. [x] Preserve real gaps and missing WP/process/I/O measurements instead of inventing 1/0 values.
23. [x] Preserve multi-core CPU readings above 100% with a data-aware chart axis.
24. [x] Show timestamp of retained WP trace error only if a valid timestamp exists in evidence.
25. [x] Improve WP/Trace details, keyboard Escape/focus return and add Investigation Context;
       do not infer causality. Counter interpretation remains source scoped.

## Data-trust invariants

- PSS is workload PSS, not host memory or HANA DB RAM.
- APP Critical WP refers to host-level observation, not program status.
- SM37 is authoritative for execution state.
- Retained historical error ≠ current error.
- Unknown and missing data ≠ Normal or 0.
- SAP thresholds and backend collection/evaluation algorithms were not changed.
- The UI six-month option does not change 90D default retention; extend via
  separate approved DEV capacity + backup procedure if required.

## QA and release

New: `npm run qa:basis-finishing-25` (five groups of source/evidence
contracts, added to `qa:unified-cockpit`). Legacy release assertions
expecting the former strings/layout were updated without disabling the checks.

Run from `/root/rundeck-sphere-dev` after fast-forwarding from origin:

```bash
npm run qa:basis-finishing-25
npm run qa:history-6m
npm run qa:unified-cockpit
node scripts/qa-basis-investigation.mjs
SPHERE_DEV_MIGRATION_DECISION=skip bash ops/rundeck/release-dev-fast.sh
```

Release MUST stop on failed QA. Check desktop + Android responsive behavior,
modal focus return, WP trace paging, the APP host filters and chart timeline
against actual retained API data. Do not claim successful live deployment until
the release script reports `FINAL=PASS`.

# SPHERE v1.34.87 — DEV UI/UX Consolidation

**Stage:** GitHub DEV source candidate; **server QA, real-viewport screenshots and DEV static-web deployment have not yet been verified**. PROD remains at v1.34.86 finishing SHA `5e2aed9cac67330da63044edfbe343d9b4e8f202` per user-provided deployment output.

## Scope

- Three semantic analysis groups replace six repeated visual tiles: Events & History, SAP Checks, and Infrastructure; all original destinations remain available, while System Data becomes a header utility.
- A single APP Focus selector spans all three trend plots; selecting APP in the top cards or trend toolbar shares host context. All resets only focus, never metric data.
- ECharts tooltip placement is bounded and zero observations can be grouped without replacing missing values with zero; exact Peak/Avg and bucket/sample evidence remains in drilldowns.
- Server Trend headings use the active metric; host time range, interval, thresholds, collection gaps, no-observation semantics and historic source identity are unchanged.
- Jobs & Programs table columns and numeric alignment are improved without changing API/limit semantics.
- SAP and Infrastructure states stay separate; fresh/stale/missing Infrastructure samples are not promoted to SAP status.
- Header SAP Data label is protected from cramped spacing; a theme change reuses current React + ECharts theme state without full page reload.
- Read-only filesystem provenance diagnostic `ops/rundeck/audit-infra-fs-dev.sh` prints host, mount, source collection and time for AOP infrastructure, with **no conclusion** inferred from equal percentages alone.
- Browser QA covers desktop/Android group geometry, related modal navigation, shared APP focus, light theme and reduced motion.

## Release guard

**DEV only**: `ops/rundeck/release-ui-dev.sh` with the exact GitHub SHA. It performs one fresh QA/build, Playwright against a local DEV preview, read-only DB revision `20260929_0007`, atomic DEV static-web cutover and automatic symlink rollback if verification fails. PROD web/API symlinks and PROD HTML hash must remain unchanged. No backend, schema, threshold, SAP job, credentials, or Nginx changes. Capture exact SHA and stdout from JAHSVR-SPHERE before marking DEV PASS.

## Pending

- Runtime/final visual PASS awaiting JAHSVR-SPHERE release output. Do not infer PASS from GitHub commit.
- Filesystem 89% provenance requires actual API evidence; no silent correction of source data.
- No PROD v1.34.87 promotion authorized here.

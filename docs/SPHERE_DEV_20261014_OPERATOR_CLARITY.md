# SPHERE DEV — operator clarity and compact cockpit refinement

Date: 2026-10-14
Target: rundeck-sphere-dev only. No production files or branches intentionally changed.

## Changes
- APP summary states that Attention/Critical are counts of APP severity, separate from the APP Critical WP metric. The source-backed status calculations are unchanged.
- Current Jobs & Programs explicitly labels its total as belonging to the current saved collection; this is a different population/window from Workload Health.
- Workload Health displays the saved 1D evaluation count and window end, with the full window available in the title. Every verified hexagon retains the same click handler and carries its saved status, possible source APP, grouped CPU, PSS, and window in its tooltip. Unknown does not imply Normal or SM37 job status.
- Compact typography improvements and a centered desktop 3+2 APP hex cluster. No new cards, scroll panes, thresholds, endpoints, inferred host mapping, or changes to evaluation counts.

## Manual QA required before DEV deployment
1. Desktop 1536×864 and laptop 1366×768: no page-level vertical/horizontal overflow, all three trends and both Jobs/Health panes visible.
2. Phone 390×844: APP picker and tabs remain usable; no clipped controls.
3. Confirm APP status severity counts against five verified APP states. A Critical WP count is **not** the number of critical APPs.
4. Compare Current collection count with the current-collection API only. Compare Workload Health legend totals with the validated saved 1D evaluations; never reconcile them as the same population.
5. On each Workload Health hexagon, verify hover/focus label reflects an actual saved row and click opens the original saved evaluation detail; Review category clicks filter without data fabrication.
6. Verify UNKNOWN/insufficient data are never displayed as NORMAL or SAP SM37 job states, and stale performance/availability remain separate.
7. Run existing lint, unit QA, Playwright visual QA, build and API smoke checks, then `sphere deploy dev` on JAHSVR-SPHERE if all required gates pass.

No automated or runtime QA is implied by this source commit. Production must remain unchanged.

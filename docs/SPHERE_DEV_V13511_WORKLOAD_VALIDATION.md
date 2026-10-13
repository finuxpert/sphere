# SPHERE DEV v1.35.11 — Workload audit (2026-10-13)

Branch: `rundeck-sphere-dev`. PROD branches and routing unchanged.

- CPU cell highlighting uses explicit CPU evidence, never generic review, high PSS or multi-core >100% by itself. Missing CPU shows unavailable.
- Workload Health remains a saved 1D evaluation; existing multi-page row identity, 1D period and severity-total validation are preserved.
- All hexagons represent real evaluated records; measured layout adapts 10–6px and falls back to Review instead of clipping records.
- Unknown tooltip separates INSUFFICIENT DATA from other unclassified statuses; Watch and Unknown do not imply all-normal.
- Under 900px, Android uses four source-backed counts and Review instead of micro-hexagon taps.
- Jobs & Programs tab caption `Current` indicates retained collection observations, never authoritative SM37 job execution state.
- No backend migration, threshold, collector configuration, or PROD modifications.

## Before DEV deployment
1. On JAHSVR-SPHERE, fetch the exact rundeck-sphere-dev commit with a clean worktree.
2. Run `npm run qa`; then `npm run qa:visual` with configured Playwright browsers.
3. Test 1366/1536 desktop, 360/412 Android and evaluation populations larger than the available grid.
4. Confirm the 1D backend status sum, workload identity, latest collection and /dev/ health.
5. Use the existing guarded `sphere deploy dev` path. Inspect its migration gates before deploying; do not touch PROD.

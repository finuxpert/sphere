# DEV Monitoring — One-screen layout and verified-source release (30 Oct 2026)

Branch: `rundeck-sphere-dev`. No change to PROD, collectors, SAP credentials, database schema or source evidence.

## Decisions
- Keep Bootstrap for four ECharts slots. The bottom section uses one dedicated 44/56 CSS grid at >=1200px, which overrides Bootstrap column widths. On narrower screens, use a single column without hiding measurements.
- Import `RundeckOneScreenDev.css` *after* `RundeckBootstrapTrend.css`. Do not append another competing layout override to historical versioned CSS.
- Four charts default to CPU, Memory, Network RX and Critical WP. Duplicate metrics persisted in old localStorage are repaired on initial load; manually chosen duplicates remain possible. Reset charts resets metrics and display axes but leaves time range and source untouched.
- Footer peak is always computed from the source-backed selected host (or all APPs if not selected). Network Typical shows an **all-APP** spike warning separate from selected-APP footer.
- Do not interpret Critical WP as an SM37 job failure, multi-core workload CPU as host CPU, or READY as SAP service UP. Unknown data remains unknown.

## QA and deployment
1. Run `npm ci && npm run qa`. The QA suite includes `rundeck-overview-one-screen.test.mjs` and existing chart, freshness, evaluation and network tests.
2. Verify at 1536x960, browser zoom 100%, both themes, APP1-APP5, all chart selectors, Trend Typical/Full, details, and history. The overview is a one-screen **target**, not a universal guarantee when additional alerts or missing-data banners appear.
3. Compare displayed CPU, RAM, Network RX/TX, critical WP and evaluation totals with their saved API sources at the same collection timestamp. A visual QA PASS is not sufficient to claim data validation.
4. Use only the documented `ops/rundeck/release-dev-fast.sh` workflow from the DEV checkout after tests. Verify the active DEV SHA and HTTPS page; never treat a GitHub commit or Action artifact as proof of server deployment.

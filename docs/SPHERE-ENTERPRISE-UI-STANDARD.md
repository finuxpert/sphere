# SPHERE — Enterprise Monitoring UI Standard

Applies to SPHERE SAP Performance, Operational Checks and Monthly Review. This standard
describes intended operating behavior and maintained frontend constraints, not a
substitute for browser QA. Use existing product data and verified evidence throughout.

## Information architecture

1. Status and SAP data freshness come first; a successful Rundeck collection does
   not prove current SAP Availability.
2. APP Fleet exposes APP1–APP5 source status. An APP selection controls related
   details, not the meaning of past observations.
3. Performance Trends contain two APP measurements plus one technical measurement.
   All three share the chosen query period and observed-data focus.
4. Job & Program Evaluation is a saved evaluation summary. Membership totals per
   APP are **not** distinct job counts, confirmed failed SM37 runs or ST22 dumps.
5. Related Events, SAP Checks, Infrastructure and Monthly Review have dedicated
   navigation routes and preserve provenance, timestamps and source-specific UNKNOWN.

## Enterprise design rules

- Flat graphite surfaces with semantic tokens in
  `RundeckEnterpriseMonitoringV137.css`. Avoid a new visual-overlay stylesheet for
  every iteration; update the established layer and remove superseded declarations
  when verified.
- Reserve semantic red, amber and green for status. Five stable APP time-series
  colors are separate (`--v36-series-1..5`) and remain identifiable in both themes.
- Dense monitoring content uses small but legible controls, consistent alignment,
  quiet borders, keyboard-visible focus, and no nonfunctional decorations.
- Show historical absence explicitly as unknown, not zero or healthy.
- Use a single row of filters where possible. Prefer table/list detail views over
  hundreds of tiny categorical symbols.
- Maintain breakpoints at desktop, <=1260px, <=1050px and <=650px, preserving
  readable host labels and controls without content truncation.
- Keep APP status and job execution distinct; do not infer root cause from
  temporal co-observation.

## Time series

- ECharts presents exact retained values, zero-preserving samples, gap/null breaks,
  unchanged warning and critical thresholds, and explicit WIB timestamps.
- The historical query period remains the operator-selected 1D/7D/30D/Last Month/
  3M/6M/custom interval. **Fit observed** changes only display-axis bounds on
  historical ranges. The button has an explicit pressed state; **Full range**
  restores the entire requested period.
- Use a single ECharts ResizeObserver when available; fallback to window resize
  only for older browsers. Preserve exact-click point drilldown and tooltip.
- Load optional decorative canvas code only when explicitly activated. Default
  SAP Performance always renders the actual trends.

## Frontend modules

- `RundeckServerTrend.jsx`: live controls, ECharts and exact-point drilldowns
- `rundeckObservedWindow.js`: pure derived display window; does not mutate samples
- `rundeckTrendFocus.js`: pure APP color identity and trace focus
- `rundeckTrendAmbientData.js`: small pure optional-display provenance helpers
- `rundeckTrendAmbient.js`: lazily loaded optional canvas renderer
- `RundeckWorkloadAppLanes.jsx`: source-backed APP membership distribution
- `RundeckEnterpriseMonitoringV137.css`: final enterprise visual tokens and rules

## Verification

Run `npm run qa` and confirm lint, integrity, history, Basis source-provenance
checks, cockpit tests and Vite build succeed. Existing visual tests can run via
`npm run qa:visual` once DEV is deployed and reachable. Check desktop 1920, 1536,
1366 and mobile 393, both themes, keyboard navigation, threshold labels, selected
APP, fit/full axes, loading/empty/error states and historical data source age.

**Release discipline:** Deploy to `rundeck-sphere-dev` and confirm `FINAL=PASS`
before considering a separate, explicit promotion to PROD. Static QA alone does
not establish pixel-perfect browser appearance or production readiness.

## Deferred technical debt

SPHERE still imports multiple historical CSS compatibility layers and maintains
a large `RundeckServerTrend.jsx`. Avoid blanket deletion: first inventory
selectors used by legacy modals and external routes, extract modules with
regression coverage, then remove old declarations in a dedicated review. Treat
these items as open work rather than declaring all legacy code removed.

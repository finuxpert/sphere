# SPHERE DEV · unified cockpit alignment · 2026-10-14

Target: `rundeck-sphere-dev` only. Source change, not live deployment.

- Desktop APP selector and selected APP evidence now share a single 3:7 layout; 5 real APPs retain the clickable 3+2 cluster and severity colors. The superseded conflicting 1:2 declaration has been removed.
- Operational Analysis uses a consistent 120px label column and four equal action tracks.
- Cockpit grid areas stay APP → Analysis → Trends → Jobs; sections have 6px shared spacing.
- Current Jobs and saved Workload Health occupy equal-width aligned tracks, without introducing card wrappers or scrollbars.
- Header grid provides more space to action and health status groups.
- No React, API, backend, metric, timestamp, data coverage, or status derivation changes.

Pre-deploy QA: lint, build, data tests and Playwright visual checks at 1536×864, 1366×768 and 390×844; confirm no page scroll and correct modal/drilldown. Deploy from JAHSVR-SPHERE using `sphere deploy dev` only after all required gates PASS. PROD must remain unchanged.

Source syntax/checks alone do not establish runtime QA or deployment success.

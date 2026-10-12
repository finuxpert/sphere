# SPHERE DEV v1.34.91 — Desktop visual parity corrective release

**Stage:** GitHub source candidate. Server QA/build, Playwright screenshots, HTTPS parity and live DEV promotion **NOT YET VERIFIED**.

## Why this release exists

Actual DEV v1.34.90 screenshot differed materially from the approved desktop mockup. The legacy tight viewport rules, small typography and old header flow persisted even after flattening card borders.

## Source changes

- Header uses one visible `SAP Performance Dashboard` heading and reports the source `Last collected` timestamp. Existing collection identity, collector, health, data freshness, Rundeck/Manual and PDF controls stay authoritative.
- APP1–APP5 show the existing source-backed CPU, RAM, **APP Critical WP count**, and independent FS used% more legibly (larger values and labels); a Critical WP count is not a utilization percentage and has no fake progress bar.
- Performance Trends now has a section title, clearer shared controls and taller real ECharts plots. Host highlights, range, interval, Avg/Peak and original metric selectors stay active.
- Operational Analysis is still one six-action navigation bar, now with clearer labels and icons. All six existing click destinations remain wired.
- Jobs & Programs Live has a `Search loaded jobs and programs` search field, explicitly limited to the current 50 loaded rows; historical Search remains its own tab. The table also shows the actual workload `Observed At` timestamp, not a claimed SAP job completion time.
- Review, Job/Program Analysis, Correlated Events, Observation History, Infrastructure, SAP Issues, SAP Availability, System Data, PDF Preview and the safe Back stack keep their existing functionality plus the v1.34.90 improvements (source-backed issue filters, WP trace filters, System Data to PDF).
- Responsive CSS targets desktop first without suppressing data-trust notices or inventing sources. Focus-visible and reduced-motion rules are preserved.

## Acceptance tests

- Static/source QA validates one dashboard title, seven meaningful Live table columns summing to 100%, current version, and source-backed existing evidence.
- Playwright desktop 1536 and 1366 requires actual heading text, five APP cards, metric font >=14px, title font >=20px, visible chart height >=187px, six actions, and no horizontal document overflow.
- Playwright tests loaded-only search, Observed At, and earlier v1.34.90 Job/WP, Infrastructure, SAP Issues and System Data→PDF click flows.
- Screenshots saved as `test-results/sphere-v13491-overview-1536.png` and `...1366.png` must be visually compared with approved mockup.
- No mockup-only figures, invented “baseline” percent changes, derived causality, fake SM37 statuses, token renewal or synthetic PDF details are added.

## Release guard

Release only from JAHSVR-SPHERE using exact GitHub DEV source SHA and the existing `ops/rundeck/release-ui-dev.sh <SHA>` guard. Source checked against `rundeck-sphere-dev`. QA/build and visual tests must pass before symlink cutover. DB revision is read-only checked, migration skipped. PROD, backend, Nginx, SAP and Rundeck job configuration are not modified.

A source commit or a green local test is **not** proof of live DEV deployment. Real screenshot review remains necessary after release.

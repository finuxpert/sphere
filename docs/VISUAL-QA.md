# SPHERE Visual QA

This checklist covers the current v1.34.37 operator UI.

Visual QA is separate from the default `npm run qa` release gate.

## Viewports

Review at minimum:

- 1920×1080
- 1600×900
- 1366×768
- browser scaling around 125% where available

## Live Monitoring

Validate:

- SAP App Servers + Server Trend keep the intended two-column balance;
- Server Trend chart remains readable without creating dead space;
- Current Jobs & Programs rows remain compact and clickable;
- Selected Job / Program metrics use PSS Memory and APP Critical WP terminology;
- primary evidence cards remain visually stronger than Observation History / Infrastructure Analysis / System Data launchers;
- Jobs & Programs to Review remains full width and does not create horizontal overflow;
- Infrastructure issue strip is visible but not a full-page alert;
- System Health, Collector Health, and data freshness remain distinct.

## Click/drill-down behavior

Validate:

- APP row → Application Server Analysis;
- Server Trend point → Trend Details;
- Trend Details workload → Performance Analysis;
- Current Job/Program row → Performance Analysis;
- Review row → Performance Analysis;
- performance raw point → Observation Details;
- historical bucket → Historical Bucket Details;
- WP/Trace row → SAP WP Signal Details;
- drawer Back/Close returns to the correct investigation context.

Clickable rows should show pointer/hover affordance without adding noisy Action columns.

## Server Trend historical accuracy

For Average mode:

- tooltip says Avg;
- selected timestamp is the bucket timestamp.

For Peak mode:

- tooltip shows Bucket;
- Peak Value matches the clicked chart point;
- Peak At is the exact retained sample timestamp;
- Trend Details marker stays on the clicked bucket;
- exact Peak Collection is used to load saved workloads;
- the mini-history value must not jump to a nearest bucket value.

## Performance Analysis

Validate:

- Current means selected workload episode;
- <=5 observations show Limited samples;
- low-sample chart height is compact;
- Current raw observations and historical buckets open different detail dialogs;
- x-axis formatting is readable for same-day and multi-day ranges;
- issue marker label is horizontal and does not cover critical data;
- bottom evidence cards remain reachable without excessive blank space;
- WP/Trace table remains readable and rows open detail.

## Infrastructure Analysis

Validate:

- Filesystem is labelled as Capacity;
- Storage I/O is labelled as I/O Activity;
- graph uses the full plot area;
- 1H/6H axis shows time;
- 24H shows date + time;
- 7D/30D shows date;
- retained-history coverage is explicit;
- source storage util >100% is flagged, not silently clamped;
- network drop display is labelled as a delta/peak delta, not an absolute packet-loss claim.

## Evidence semantics

Visual copy must not imply:

- correlation = causation;
- APP Critical WP = job failure;
- Latest Trace Error = current error;
- historical trace error = SM37 failure;
- missing availability = DOWN;
- historical selection = current incident causation.

## Optional Playwright setup

```bash
npm install --no-save @playwright/test
npx playwright install chromium
```

Run against DEV:

```bash
SPHERE_VISUAL_BASE_URL='https://sphere.astraotparts.co.id/dev/#/tool/logs' npm run qa:visual
```

Only update screenshot baselines after manual review. Do not update snapshots merely to make a failure disappear.

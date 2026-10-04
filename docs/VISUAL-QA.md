# SPHERE Visual QA

This checklist covers the current v1.34.53 operator UI.

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
- Selected Job / Program metrics use PSS Memory and workload-scoped APP Critical WP wording;
- observed zero and `Not observed for selected workload` remain visually/semantically distinct;
- primary evidence rows remain visually stronger than Observation History / Infrastructure Analysis / System Data launchers;
- Current Jobs & Programs and Jobs & Programs to Review remain balanced side by side without horizontal overflow;
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
- <=5 observations show Limited samples where applicable;
- a Current range with exactly one saved observation shows **Selected Observation** and **Single saved observation - no trend line** instead of a large empty trend chart;
- low-sample chart height is compact;
- Current raw observations and historical buckets open different detail dialogs;
- x-axis formatting is readable for same-day and multi-day ranges;
- issue marker label is horizontal and does not cover critical data;
- bottom evidence cards remain reachable without excessive blank space;
- WP/Trace table remains readable and rows open detail;
- Latest Trace Error shows AT SNAPSHOT or HISTORICAL directly beside the retained error.

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

## PDF quick report

Validate the one-page report at browser PDF preview around 77% and at a mobile-friendly zoom:

- SUMMARY remains readable;
- APP Server Status remains scannable;
- chart legend, threshold labels, and dates are readable;
- Selected Workload keeps 0 distinct from Not observed;
- Jobs / Programs to Review reasons remain readable;
- CHECK SUMMARY shows Availability, Critical WP, Data, and Timing;
- Performance and Availability source times are printed;
- mismatched report source timing stays PARTIAL;
- NOTES uses plain Basis wording and points job-status verification to SAP/SM37;
- the report remains one page without clipping;
- PDF Operational State matches the System Health severity semantics for the same source state.

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
SPHERE_VISUAL_BASE_URL='https://sphere.astraotoparts.co.id/dev/#/tool/logs' npm run qa:visual
```

Only update screenshot baselines after manual review. Do not update snapshots merely to make a failure disappear.


## v1.34.59 cockpit and drawer checks

- bottom workflow is equal-height Current / Selected / Review;
- Current and Review lists scroll internally with sticky table headers;
- Selected Job does not scroll in the compact cockpit;
- Infrastructure History appears above Current Snapshot;
- Current Snapshot columns remain Filesystem 45%, Network 20%, Storage I/O 35%;
- Correlated Events shows Timing, relation labels, and Cause not confirmed without implying causation.


## v1.34.59 checks

- no standalone History tab;
- Current Jobs and Review are equal 50/50 panels with internal scrolling;
- clicking a Current or Review row opens Performance Analysis directly;
- Server Trend and Technical Trend render side by side at roughly 60/40;
- historical search is available in Review and clearly labels historical matches;
- SAP App Servers uses the available width with summary and Status;
- SAP Issues shows performance, availability, HANA/Web/SSH and SM37 source indicators with NORMAL/WARNING/ATTENTION/CRITICAL states.


## v1.34.59 cockpit checks

- no large dead space between the top cockpit row and trend controls;
- SAP App Servers has no desktop horizontal scrollbar;
- Server Trend 1, Server Trend 2, and Technical Trend render side by side near 35/35/30;
- shared Time Range / Interval / View controls appear once;
- Current Jobs fills its 50% pane and Review controls stay compact;
- six analysis shortcuts remain visible in one restrained rail;
- Correlated Events relies on the vertical timeline instead of repeated horizontal rules;
- SAP Availability, SAP Issues, Observation History, Infrastructure Analysis, and System Data use lighter separators and consistent drawer chrome;
- Back labels read Live Monitoring or Performance Analysis, never Selected Job.

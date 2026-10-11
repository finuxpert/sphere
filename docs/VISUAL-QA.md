# v1.34.83 Modal Recovery & Cockpit Visual QA (DEV only)

**Runtime status: NOT VERIFIED until Playwright runs against the patched build.**

- Viewports: 1366×768, 1536×864, 1920×1080, Android 393×852.
- Unified APP dialog: after motion all four edges inside viewport, title/close in bounds; keyboard Tab, Escape, backdrop, focus restore and reduced-motion.
- Six analysis tiles: consistent bounded text, keyboard focus and correct destinations. No legacy visible overflow.
- APP5 click must retain APP5 SAP identity; Infrastructure uses an independently verified matching host or UNKNOWN, never APP1 fallback.
- Verify repeated /SAP_ARCH 89% with hostname, collection ID and raw host filesystem readings; identical values alone are not proof of duplication.
- Scroll through all loaded workload rows, inspect Live/Review/Search, retained trends, historical sample/bucket times and collection gaps.
- Keep SAP, collector and Infrastructure freshness independent. No synthetic heartbeat.
- Run lint, unit regression, Basis QA, Vite build and Playwright geometry. Never claim visual PASS from source-only checks.
- For UI-only v1.34.83, run `ops/rundeck/release-ui-dev.sh <verified-sha>` from the server after updating the checkout. It performs exactly one source QA/build, 4-viewport Playwright geometry against a local preview using the existing DEV API, a read-only DEV DB revision guard, and an atomic static web-only switch. Failure rolls back the static symlink. Neither the backend, collector, SAP jobs, migrations, credentials, Nginx config nor PROD is changed.

---

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


## v1.34.61 cockpit and drawer checks

- bottom workflow is equal-height Current / Selected / Review;
- Current and Review lists scroll internally with sticky table headers;
- Selected Job does not scroll in the compact cockpit;
- Infrastructure History appears above Current Snapshot;
- Current Snapshot columns remain Filesystem 45%, Network 20%, Storage I/O 35%;
- Correlated Events shows Timing, relation labels, and Cause not confirmed without implying causation.


## v1.34.61 checks

- no standalone History tab;
- Current Jobs and Review are equal 50/50 panels with internal scrolling;
- clicking a Current or Review row opens Performance Analysis directly;
- Server Trend and Technical Trend render side by side at roughly 60/40;
- historical search is available in Review and clearly labels historical matches;
- SAP App Servers uses the available width with summary and Status;
- SAP Issues shows performance, availability, HANA/Web/SSH and SM37 source indicators with NORMAL/WARNING/ATTENTION/CRITICAL states.


## v1.34.61 cockpit checks

- no large dead space between the top cockpit row and trend controls;
- SAP App Servers has no desktop horizontal scrollbar;
- Server Trend 1, Server Trend 2, and Technical Trend render side by side near 35/35/30;
- shared Time Range / Interval / View controls appear once;
- Current Jobs fills its 50% pane and Review controls stay compact;
- six analysis shortcuts remain visible in one restrained rail;
- Correlated Events relies on the vertical timeline instead of repeated horizontal rules;
- SAP Availability, SAP Issues, Observation History, Infrastructure Analysis, and System Data use lighter separators and consistent drawer chrome;
- Back labels read Live Monitoring or Performance Analysis, never Selected Job.


## v1.34.84 — restrained Cloudflare-inspired operator interactions (DEV)

- CSS-only focus/hover APP and six shortcut tile soft glow, 2px composited hover lift; selected and UNKNOWN/STALE indicators are unchanged and never animated.
- Jobs & Programs tab ink eases on state change; modal backdrop fades once over 190ms. APP dialog keeps the established fixed-center 220ms geometry.
- Coarse pointers receive no hover translation, `prefers-reduced-motion: reduce` and print disable transitions and backdrop animations. Keyboard focus continues to expose the action.
- Production release candidate PR #49 is pinned to v1.34.83; this v1.34.84 DEV-only change does not mutate that PR or PROD.
- QA must pass before the optional gated DEV web-only rollout; run `bash ops/rundeck/release-ui-dev.sh <exact-v1.34.84-source-sha>` on JAHSVR-SPHERE. Run full QA/build because frontend files changed, not artifact reuse.


## v1.34.85 — Cloudflare-inspired LIGHT theme, analysis geometry and status evidence

- Light palette resolved at `.logV2Inner`, which previously shadowed root light tokens with dark values. Neutral white/f8fafc surfaces, dark text, accessible green/amber/red status semantics; Dark theme remains unchanged.
- APP cards explicitly distinguish `SAP · STATE` and `Infra FS ...` with independent source timestamps. These labels do not merge health evidence.
- Unified modal uses 45/55 SAP/Infrastructure grid on desktop; Infrastructure pane has independent full-width snapshot and history bands and wrapped Network/Storage numeric columns. Mobile stacks the bands.
- ECharts palette recomputes on the html `data-theme` attribute event; no data polling, root-cause inference, or fabricated metrics.
- Browser regression covers light/dark four project viewports and APP2 modal geometry. Screenshots and manual light/dark inspection still needed after guarded DEV deploy.
- This version only targets `rundeck-sphere-dev`; PROD and PR #49 are not promoted.

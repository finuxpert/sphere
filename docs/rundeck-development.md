# Rundeck Development

This document describes the active SPHERE Rundeck DEV/PROD runtime contract.

## Runtime identity

- Repository: `finuxpert/sphere`
- DEV branch: `rundeck-sphere-dev`
- PROD branch: `rundeck-sphere-prod`
- DEV checkout: `/root/rundeck-sphere-dev`
- PROD checkout: `/root/rundeck-sphere-prod`
- DEV URL: https://sphere.astraotoparts.co.id/dev/
- PROD URL: https://sphere.astraotoparts.co.id/
- Current DEV source candidate: **v1.34.76** (does not imply the server is already deployed).

The manual branch family (`sphere-dev` / `sphere-prod`) is a separate Upload Logs release line.

## Single-server topology

The active Rundeck DEV and PROD environments run on the **same JAHSVR-SPHERE host**. Isolation is by branch checkout, Vite base path, API port, release directory, systemd service, and Nginx managed block—not by a separate physical server.

```text
/root/rundeck-sphere-dev
  branch: rundeck-sphere-dev
  web:    /dev/
  API:    127.0.0.1:8091

/root/rundeck-sphere-prod
  branch: rundeck-sphere-prod
  web:    /
  API:    127.0.0.1:8092
```

A DEV deploy must preserve the active PROD web/API symlinks. A PROD deploy must preserve the active DEV web/API symlinks. Both deploy scripts enforce this with cross-environment guard checks.

## Runtime paths

DEV:

- web: `/var/www/sphere-dev/current`
- API: `/opt/sphere-rundeck-dev/current`
- API port: `8091`
- service: `sphere-rundeck-api.service`

PROD:

- web: `/var/www/sphere.astraotoparts.co.id/current`
- API: `/opt/sphere-rundeck-prod/current`
- API port: `8092`
- service: `sphere-rundeck-prod-api.service`

Retained ingestion data is outside Git under `/var/lib/sphere/ingestion`.

## Frontend base-path contract

Vite base is branch-aware:

```text
rundeck-sphere-dev  → /dev/
rundeck-sphere-prod → /
```

Production deployment intentionally blocks a bundle that still references `/dev/assets/`.

## Collection identity

The collector is discovered through stable project/group/job identity rather than relying only on a mutable Rundeck UUID.

Core collection states:

- PROCESSING
- READY
- PARTIAL
- FAILED

Latest operational data must come from one aligned READY collection cycle.

The UI must not construct a fake current landscape by combining independent “latest” host timestamps.

## Current UI contract

Main navigation:

- ST03N Analysis
- Performance Analysis

Performance Analysis modes:

- Live Monitoring
- History

### Live Monitoring primary layout

- Infrastructure summary
- SAP App Servers
- Server Trend
- Selected Job / Program under the selected APP context
- Correlated Events
- SAP Availability
- SAP Issues
- Observation History
- Infrastructure Analysis
- System Data
- Current Jobs & Programs beside Jobs & Programs to Review

### Shared investigation surfaces

- Application Server Analysis
- Performance Analysis
- Observation Details
- Historical Bucket Details
- SAP WP Signal Details
- Observation History
- Infrastructure Analysis
- Correlated Events
- SAP Availability
- SAP Issues
- System Data
- Quick Analysis

## Interaction rules

- Current Job/Program row opens Performance Analysis.
- APP row opens Application Server Analysis.
- Server Trend point opens Trend Details.
- Trend Details workload row opens the same shared Performance Analysis.
- Raw/current performance point opens Observation Details.
- Historical aggregate point opens Historical Bucket Details.
- WP/Trace row opens SAP WP Signal Details.
- Back/Close behavior must preserve investigation context.
- Do not auto-expand unrelated APP Critical WP details.

## Historical point contract

For bucketed Server Trend Peak mode, keep separate:

- bucket timestamp;
- exact peak timestamp;
- exact peak value;
- exact peak collection ID.

The mini-history marker follows the clicked bucket. The displayed Peak At remains the exact sample time.

Do not use nearest-bucket recomputation to replace the value the operator clicked.

## Performance Analysis contract

- Current = selected workload episode.
- Current with exactly one saved observation renders a Selected Observation summary rather than a trend line.
- Current/3H/6H/24H/7D/30D are supported.
- Current raw observations and historical buckets are different evidence types.
- History truncation labels are episode-aware.
- Historical selected-time analysis is not automatically correlated against the current incident.
- WP/Trace signals may be absent in older retained observations.

## Evidence rules

- Correlation does not prove causation.
- APP Critical WP is APP-level evidence.
- Selected workload Critical WP preserves the distinction between observed zero and missing/not-retained evidence.
- Missing availability observation is not DOWN.
- Grouped workload CPU may exceed 100%.
- PSS is the current workload memory metric.
- Historical RSS and current PSS are not 1:1 comparable.
- `Latest Trace Error` may be historical and is labelled AT SNAPSHOT or HISTORICAL in the UI.
- SM37 status must not be inferred from WP sampling.
- PDF report alignment uses the report's Performance and Availability source timestamps; mismatched timing remains PARTIAL rather than being silently normalized.
- System Health and PDF status use the same resource/service/freshness semantics; stale performance or availability data raises WARNING, while Critical WP without service/resource impact remains ATTENTION.

## Validation

DEV refresh, release gate, and deploy:

```bash
cd /root/rundeck-sphere-dev && \
git fetch origin && \
git reset --hard origin/rundeck-sphere-dev && \
bash ops/rundeck/qa-build-dev.sh && \
bash ops/rundeck/prod-readiness-check.sh && \
bash ops/rundeck/deploy-dev.sh
```

Production after approved promotion to `rundeck-sphere-prod`:

```bash
cd /root/rundeck-sphere-prod && \
git fetch origin && \
git reset --hard origin/rundeck-sphere-prod && \
npm ci && \
npm run qa && \
npm run build && \
bash ops/rundeck/deploy-prod.sh
```

Do not merge DEV inside `/root/rundeck-sphere-prod` as part of deployment. Promotion happens before deployment; the server-side PROD checkout only consumes the approved `origin/rundeck-sphere-prod` state.

Chunk-size warnings are informational. QA/readiness/build/deploy failures are blockers.

## Promotion rule

Do not force-reset PROD to DEV.

When branches diverge, build a release branch from the current PROD head and overlay only approved DEV changes, preserving PROD-only deploy/routing/service files.

See `ops/rundeck/OPERATIONS.md`.


## v1.34.61 cockpit contract

The desktop Live Monitoring workflow is APP/Infrastructure -> full-width Server Trend -> equal-height Current Jobs / Selected Job / Review. Current and Review may scroll internally; the page composition should not grow to expose all rows. Infrastructure Analysis is history-first and Correlated Events keeps timing correlation separate from RCA.


## v1.34.61 workflow contract

Do not reintroduce the standalone History tab or the intermediate Selected Job card in Live Monitoring. Historical lookup belongs to Performance Review search. Current and Review rows must open the shared Performance Analysis drawer. The trend row uses separate Server Trend and Technical Trend panels with shared range controls.


## v1.34.61 UI contract

Preserve the three-chart trend workspace and content-driven top band. Do not reintroduce fixed empty top-row height, the Selected Job card, or a standalone History tab. Analysis drawers should use whitespace and subtle section boundaries rather than repeated boxed surfaces or heavy row separators.


## v1.34.61 semantics

Keep host RAM and workload PSS separate in labels and QA. The two numeric Server Trends share collection coverage because they use the same retained performance collection timeline. Technical availability gaps remain independent and must continue to mean UNKNOWN/no observation, never DOWN.


## v1.34.61 UI wording contract

Use RAM only for host/server percentage memory and PSS Memory for workload GB. Use “first observed” for retained Critical WP evidence unless an authoritative event source provides an exact start. Prefer selected-workload context over generic incident wording. PDF and web UI must use the same operator terminology.


## v1.34.61 flow contract

Do not reintroduce the standalone Live Monitoring tab or split Current/Review lower layout. The lower cockpit is one Jobs & Programs workspace. Historical Search belongs to that workspace. Analysis shortcut copy should stay short and operational. Stale availability data must never be rendered as service DOWN. PDF and web must preserve the same operator terminology and semantics.


## v1.34.61 merged workspace contract

Keep Search as an exclusive Jobs & Programs mode, not a button inside Review. A Search query shorter than two characters must never fall back to Review rows. Keep the Performance Analysis drawer as the single destination for Live, Review and Search selections.


## Infrastructure snapshot freshness (v1.34.75)

The primary Infrastructure strip and its investigation drawer share the same timestamp-driven freshness contract: 15 minutes maximum age for a `FRESH` host observation; `STALE` if older; `UNKNOWN` if missing, unparsable or significantly future dated. Severity badges apply only to fresh measurements. Stale capacity percentages, network counters and storage activity stay visible as last-observed **historical evidence**, never as a current host alert. The overview refreshes read-only REST telemetry every 60 seconds, but it cannot cause a Rundeck collection to run.

The per-host collection timestamp and per-mount percentages must agree with a new collector execution before concluding that SAP filesystem usage changed. This rule prevents stale-data misclassification; it is not a replacement for diagnosing a stuck Rundeck job/poller.

Infrastructure freshness also verifies per-sample `collected_at` and `collection_id` against the selected host's latest READY collection. Mixed or missing identities become `UNKNOWN` instead of combining unrelated snapshots. A stale sample remains `STALE` even when a newer host record exists.

## DEV operator motion (v1.34.76)

The Rundeck cockpit imports `RundeckOperatorMotion.css` once from the monitoring wrapper. Only mounted cockpit bands, analysis drawers, and selected history traces use a one-shot animation; no infinite pulse, moving signal, rolling random counters or background animation work. Host status and chart values remain actual sampled evidence. ECharts animations stop under `prefers-reduced-motion`, as do CSS animations/transitions. Browser clients execute their own brief rendering; the backend and database collection cadence are unchanged.

Basis QA's `Infrastructure filesystem NORMAL state is explicit` assertion now checks the freshness-aware status renderer instead of the removed direct CSS class. It must preserve `NORMAL` for fresh rows and `STALE`/`UNKNOWN` for old or unverified evidence.


## Monitoring API credentials and maintainer access

Monitoring API tokens are limited to **30 days**, owned by the designated SPHERE maintainer and scoped to the existing `sphere_api` service account with the `sphere_reader` role. In the observed Rundeck token generator, `Expiration in: 0` selects the configured maximum **30 days** (not indefinite). Configure only the minimum project/job/execution read ACL and verify it; do not generate the monitoring reader token as `admin` or with blank roles.

Credentials must never be committed to this repository or pasted into logs/chats. The maintainer handles rotation through the protected server credential file, checks the token at least seven days before expiration, and verifies both poller and watchdog after normal timer execution. Maintenance exclusivity requires real account/ACL/sudo controls and cannot be guaranteed by documentation alone. The DEV runner is a separate higher-privilege credential requiring its own least-privilege review and expiry rotation.

Full generation fields, DEV incident evidence (2026-10-10), step-by-step operational safeguards and rotation checklist: [OPERATIONS.md](../ops/rundeck/OPERATIONS.md#sphere-monitoring-token-ownership-and-30-day-rotation).

## Data trust after source interruption (v1.34.77)

A collector recovery must not erase the fact that preceding samples were missing. The cockpit uses `rundeckDataQuality.js` for independently testable freshness and source-health classification. The Quality state is not a SAP service-status verdict. Data observed in a READY collection is not current beyond 15 minutes. The existing availability threshold remains 20 minutes; an absent/stale availability sample yields PARTIAL without claiming failed SAP service. When the poller/watchdog is unhealthy, a recent performance observation may be shown as DEGRADED but should not be assumed to represent uninterrupted live monitoring.

The frontend fetches up to 80 **retained** manifests, compares adjacent READY `finished_at` timestamps against the 10-minute collection cadence, and shows only recent (within 24h of the later observation) gaps in a compact status line. The displayed span is explicitly **between observations**; it is not an exact failure start/stop time, and PARTIAL/FAILED collections cannot be promoted to READY. Longer history remains on the existing server trend Collection Gap view, which uses bucketing and has separate detection semantics. No missing metrics are interpolated, copied forward as live data or treated as SAP downtime.

The source-health and history-gap logic are client-side. It does not change collector frequency, write to SAP/Rundeck, rotate credentials, auto-abort behavior, or backend evidence retention. `npm run qa:data-quality` covers expired-token-like source errors, stale eight-hour-old samples, missing/invalid timestamps, post-recovery gaps and sparse history.


## DEV workload coverage and APP reason labels (13 Oct 2026)

- Current Jobs & Programs fetches the existing read-only `/history/jobs/current` endpoint once for each verified SAP APP in the current collection, with a maximum of 100 rows per host. Search and APP filter cover every fetched observation, rather than only the global top 50.
- Counts remain explicit: `observed` is the sum of backend totals; if any host returns fewer rows than its total, the UI says `loaded (partial)` and does not claim complete search. Use the historical Search for retained records outside this collection.
- APP severity is determined by SAP host CPU/RAM/I/O wait and Critical WP. Filesystem is independent host/collection-matched Infrastructure telemetry. Identical percentages do not prove duplicate mapping; the filesystem mount and measurement freshness remain available for verification.
- Run `npm run qa` and desktop/mobile visual QA before release. This change is frontend-only and compatible with `sphere deploy dev`; it does not require a backend restart or migration. PROD stays unchanged.

### DEV APP filesystem label — 13 Oct 2026

The unified APP card shows **Filesystem** instead of **FS**, the highest-used filesystem mount from the host/collection-matched Infrastructure sample, and its usage percentage. The one-line card footer gives the actual mount point; the full mount path, infrastructure state, source host, sample time and available capacity fields (GiB) appear in the native hover/focus tooltip. Unreported capacity must remain missing, never derived or filled with estimates.

Filesystem warning remains independent of the SAP APP status (CPU, RAM, I/O Wait and Critical WP). Source freshness still gates Infrastructure status; an older observed percentage is never presented as a fresh measurement. No backend or database change is needed.

### DEV freshness, Technical Trend, and pager (13 October 2026)

- `Data PARTIAL` distinguishes Performance (15-minute window) from Availability (20-minute window). A fresh Performance collection stays explicitly current if Availability is stale. Last observed Availability must not be presented as a current SAP service state.
- Technical Availability trend summarizes saved checks and uses the API's actual `latest_observation_at` to label stale historical percentages. A recorded UP sample or 100% observed checks does not establish replication health or continuous service uptime.
- Jobs & Programs Live pagination adapts by browser height (2/3/4/5 rows). On shorter desktops chart height is reduced moderately and nested Live table clipping is disabled. Full coverage and search still use the same fetched observations, with Previous/Next controls. Actual viewport geometry must be QA-verified before declaring one-screen PASS.
- Workload Health is implemented as a separate column at the right of the Jobs & Programs table on desktop; no new vertical section. Multicore CPU >100% alone does not set red status; use the backend 1D evaluation.


### DEV no-scroll desktop workload pager — 13 Oct 2026

Current Jobs & Programs computes visible page rows from the rendered table header, first row height and remaining viewport space, reserving 44px for its pager and footer. This is a *layout* calculation only; the total searchable observations and existing API results remain unchanged. On a short desktop it may show two full rows rather than cropping the third/fourth; remaining records remain accessible via the existing pager. Recalculate when source-quality warning banners or browser size change. Tablet/mobile retain their existing bounded layout. Keep visual geometry QA at 1366×768 and 1536×864 before deploying.

### DEV Jobs & Programs / Workload Health side-by-side (13 Oct 2026)

- On desktop (width >= 1200px), the existing Jobs & Programs header remains full width. The **table/Review/Search tabpanel is the left grid column**, while the **Workload Health card is a true independent right grid column** at 198px (180px for compact desktops). The table and its search/pager shift left accordingly; there is no card above/below the data and no new vertical row.
- The right card uses a **30-cell hexagon honeycomb** with seven centered rows: 3, 4, 5, 6, 5, 4, 3. Each colored cell represents one top-ranked backend evaluation from `/evaluation/workloads?period=1d&type=ALL&limit=100`. Remaining placeholder cells are faint **empty geometry**, not a claim of unknown workloads.
- Red = `REVIEW REQUIRED`; amber = `HIGH CPU`, `HIGH MEMORY`, `CPU SPIKE`, `INCREASING CPU`, or `RECURRING`; green = `NORMAL`; grey = `INSUFFICIENT DATA`/unknown. These are saved **1D investigation categories**, never SM37 execution status or a verdict derived solely from grouped CPU exceeding 100%.
- The card footer's big number is the backend full-report `summary.workloads`; Review count comes from `summary.review_required`. The hexagons depict only the first 30 ranked items, not a proportional status census. Clicking the card opens the existing Review tab. No data, failed API, empty period and insufficient evidence remain explicit, never artificially green.
- Card height is 134px for normal desktop and 105px when the viewport is 800px tall or less, keeping the pager within the document viewport. On widths below 1200px, the table retains full width; the card becomes a compact top-right summary rather than squeezing columns or adding a new row. Reduced-motion and keyboard-focus behavior remain intact.
- Run `npm run qa` before `sphere deploy dev`. After deploy, run actual Playwright geometry checks for 1366x768, 1536x864 and Android. Verify the card is right of the table, no overflow/scroll, Review click works, and the saved 1D API response has the same totals as the card. No changes to backend/DB or PROD.

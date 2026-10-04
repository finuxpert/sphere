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
- Current application version: **v1.34.53**

The manual branch family (`sphere-dev` / `sphere-prod`) is a separate Upload Logs release line.

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

DEV:

```bash
cd /root/rundeck-sphere-dev
git fetch origin
git reset --hard origin/rundeck-sphere-dev
npm run qa
bash ops/rundeck/prod-readiness-check.sh
```

Production after approved promotion:

```bash
cd /root/rundeck-sphere-prod
git fetch origin
git reset --hard origin/rundeck-sphere-prod
npm run build
bash ops/rundeck/deploy-prod.sh
```

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

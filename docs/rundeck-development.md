# Rundeck Development

This document describes the active SPHERE Rundeck DEV runtime.

## Runtime identity

- Repository: `finuxpert/sphere`
- DEV branch: `rundeck-sphere-dev`
- PROD branch: `rundeck-sphere-prod`
- DEV checkout: `/root/rundeck-sphere-dev`
- PROD checkout: `/root/rundeck-sphere-prod`
- DEV URL: https://sphere.astraotoparts.co.id/dev/
- PROD URL: https://sphere.astraotoparts.co.id/
- Current application version: **v1.34.29**

The manual branch family (`sphere-dev` / `sphere-prod`) is a separate Upload Logs release line. It is not the active Rundeck-integrated production runtime.

## Architecture boundary

SPHERE does not connect directly to SAP Application Servers.

```text
SAP Application Servers
    ↓
Rundeck
    ↓ REST API
SPHERE FastAPI
    ↓
PostgreSQL + retained raw evidence
    ↓
SPHERE React UI
```

Rundeck remains responsible for SAP-side collection.

## DEV runtime

- Webroot: `/var/www/sphere-dev/current`
- Backend release: `/opt/sphere-rundeck-dev/current`
- DEV API port: `8091`
- DEV API service: `sphere-rundeck-api.service`
- Collector poller: `sphere-rundeck-poller.service/.timer`
- Infrastructure poller: `sphere-rundeck-infra-poller.service/.timer`
- Collector watchdog: `sphere-rundeck-watchdog.service/.timer`

Production uses its own release paths and API service/port and must not be changed by a DEV deployment.

Retained ingestion data lives outside Git under `/var/lib/sphere/ingestion`.

## Rundeck access

Use server-side credentials only.

Reader credential:

- stored outside Git
- read-only execution/output access
- consumed by the collector poller

Runner credential:

- separate from the reader credential
- may be available only for explicitly approved actions
- must not be exposed to the browser

Do not put Rundeck tokens in source code, GitHub, frontend environment files, browser storage, screenshots, or logs.

See `docs/RUNDECK_INTEGRATION_RUNBOOK.md`.

## Collection identity

The collector is discovered through stable Rundeck job identity rather than relying only on a mutable Job UUID.

Primary identity includes the approved project/group/job contract. The current UUID may be used after discovery but must not be the permanent source of truth.

Collection readiness is based on completed execution/output evidence and expected-node validation.

Core collection states:

- PROCESSING
- READY
- PARTIAL
- FAILED

Latest operational data must come from an aligned READY collection cycle. The UI must not construct a fake current landscape by mixing independent latest timestamps from different hosts.

## Active UI contract

The main navigation exposes:

- **ST03N Analysis**
- **Performance Analysis**

Performance Analysis exposes two top-level modes:

- **Live Monitoring**
- **History**

### Live Monitoring

Current primary areas include:

- infrastructure overview
- SAP Application Servers
- Server Trend
- Current Workloads
- selected Job / Program context
- operational evidence
- System Health
- Jobs & Programs to Review

Secondary analysis is opened through progressive disclosure/drawers:

- Job / Program Performance
- Observation History
- Infrastructure Analysis
- Correlated Events
- SAP Availability
- SAP Issues
- System Data
- Application Server Analysis
- Quick Analysis

### History

History mode uses the Workload Explorer and historical Job/Program detail.

Historical selections must remain visually distinct from current/live state.

## UI behavior rules

- Selected workload cross-focus may highlight the matching Application Server and trend context.
- It must not auto-expand Critical WP drill-down.
- APP-server Critical WP drill-down is user initiated.
- Healthy states should be visually quieter than ATTENTION/CRITICAL/stale/partial states.
- Data freshness and collection identity must remain visible.
- A missing availability observation must not be rendered as DOWN.
- Historical correlation does not establish root cause.
- A sampled workload observation does not establish an authoritative SM37 execution match.
- Do not document Comparator/RCA as an active primary navigation workspace.

## Performance Review

The active evaluation endpoint supports:

- `1d`
- `7d`
- `30d`

and workload filters:

- `ALL`
- `PROGRAM`
- `JOB`

Evaluation inputs include retained workload occurrence/resource observations. Evaluation status is an investigation/review signal, not a root-cause verdict.

## SM37 integration state

The backend supports an approved authoritative execution-evidence plane, but the current live overview intentionally treats the live SM37 source as **not connected** until an approved feed is configured.

Do not infer SM37 MATCHED/PARTIAL MATCH from sampled Work Process evidence.

See `docs/BASIS-JOB-INTELLIGENCE.md`.

## Validation

From `/root/rundeck-sphere-dev`:

```bash
git fetch origin
git reset --hard origin/rundeck-sphere-dev

/opt/sphere-rundeck-dev/venv/bin/python -m unittest backend.tests.test_rundeck
npm run qa
bash ops/rundeck/prod-readiness-check.sh
```

Expected final readiness markers:

```text
READINESS PASS: collector fresh, watchdog healthy, auto-healing enabled
SPHERE PROD READINESS PASS
HEAD <validated-dev-sha>
```

Optional browser visual checks are documented in `docs/VISUAL-QA.md`.

## Promotion

Promote only through a normal Pull Request:

```text
base:    rundeck-sphere-prod
compare: rundeck-sphere-dev
```

Do not force-reset PROD to DEV.

Production deployment and rollback procedures are documented in `ops/rundeck/OPERATIONS.md`.

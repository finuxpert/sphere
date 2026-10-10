# SPHERE Rundeck Operations

This runbook covers the active Rundeck-integrated DEV and PROD runtimes.

## Release flow

```text
rundeck-sphere-dev
    ↓ npm QA + DEV readiness
    ↓ approved promotion
rundeck-sphere-prod
    ↓ production build
    ↓ transactional deploy
https://sphere.astraotoparts.co.id
```

Never force-reset PROD to DEV.

When branches diverge, preserve PROD-only deployment/routing/service files.

## Runtime topology: DEV and PROD share one host

Both active Rundeck environments run on `JAHSVR-SPHERE`:

| Environment | Checkout | Branch | URL | API |
|---|---|---|---|---|
| DEV | `/root/rundeck-sphere-dev` | `rundeck-sphere-dev` | `/dev/` | `8091` |
| PROD | `/root/rundeck-sphere-prod` | `rundeck-sphere-prod` | `/` | `8092` |

They are isolated by separate checkout, release directories, current symlinks, API service/port, and managed Nginx routing blocks. Deployment is performed locally on this same host.

The deployment host does **not** promote branches. Promotion is completed first; deployment then fetches and resets the matching checkout to its approved remote branch.

## DEV validation and deployment

Canonical DEV command:

```bash
cd /root/rundeck-sphere-dev && \
git fetch origin && \
git reset --hard origin/rundeck-sphere-dev && \
bash ops/rundeck/qa-build-dev.sh && \
bash ops/rundeck/prod-readiness-check.sh && \
bash ops/rundeck/deploy-dev.sh
```

The sequence intentionally keeps the checkout on `rundeck-sphere-dev`. `qa-build-dev.sh` runs lint/Basis contract QA/build, readiness validates backend/watchdog/platform health, and `deploy-dev.sh` transactionally activates only the DEV runtime while verifying PROD remains unchanged.

Expected readiness marker:

```text
SPHERE PROD READINESS PASS
```

`deploy-dev.sh` performs transactional activation and rolls back on failed smoke checks.

## Production build/deploy

After approved promotion:

```bash
cd /root/rundeck-sphere-prod
git fetch origin
git reset --hard origin/rundeck-sphere-prod
npm run build
bash ops/rundeck/deploy-prod.sh
```

Expected final marker:

```text
PRODUCTION DEPLOY SUCCESS
REVISION <prod-sha>
```

## Vite base-path guard

Frontend base is branch-aware:

- DEV → `/dev/`
- PROD → `/`

Before production activation, `deploy-prod.sh` requires `dist/index.html` to reference `/assets/` and blocks if `/dev/assets/` is still present.

This guard is intentional and must not be removed.

## Transactional PROD checks

Production deployment validates:

- clean PROD checkout;
- local HEAD equals `origin/rundeck-sphere-prod`;
- root asset path;
- Nginx syntax;
- local Rundeck API health;
- legacy `/api/health`;
- legacy `/sap-api/health`;
- Rundeck collections;
- evaluation endpoint;
- infrastructure hosts;
- Prometheus metrics;
- watchdog events;
- SAP job source;
- platform readiness;
- production web bundle;
- DEV web isolation;
- legacy API unchanged;
- DEV API unchanged;
- DEV web unchanged.

Failure after activation triggers rollback to previous web/API symlinks and Nginx configuration.

## Production runtime paths

- API releases: `/opt/sphere-rundeck-prod/releases`
- current API: `/opt/sphere-rundeck-prod/current`
- web releases: `/var/www/sphere.astraotoparts.co.id/releases`
- current web: `/var/www/sphere.astraotoparts.co.id/current`
- service: `sphere-rundeck-prod-api.service`
- API port: `8092`

DEV:

- current API: `/opt/sphere-rundeck-dev/current`
- current web: `/var/www/sphere-dev/current`
- API port: `8091`

## Platform readiness

Current valid readiness includes:

- workload history: READY;
- baseline/correlation features: READY;
- SM37: READY or NOT_CONFIGURED;
- job monitor: READY or WAITING_FOR_SM37_FEED.

SM37 not configured is not a release failure while the authoritative feed is intentionally absent.

## QA output triage

For a concise DEV contract result while preserving the full log:

```bash
cd /root/rundeck-sphere-dev
git fetch origin
git reset --hard origin/rundeck-sphere-dev
npm run qa 2>&1 | tee /tmp/sphere-qa.log
grep -n '^FAIL ' /tmp/sphere-qa.log || echo 'No FAIL checks found'
```

Do not treat the absence of a `FAIL` line as a successful run if npm/build exited non-zero for another reason; review the command exit status and the tail of the QA log.

## Evaluation performance

Performance Review is cached per committed collection anchor.

Repeated requests for the same period/filter/limit and the same committed collection reuse the cached evaluation result.

A new committed collection invalidates the effective cache key and triggers recomputation.

## Collector/watchdog

Collector, watchdog, and data freshness are separate operational states.

Prometheus-compatible metrics include collection age and watchdog state.

Do not interpret collector RUNNING as Performance READY.

## Infrastructure history

Infrastructure trend API exposes retained coverage boundaries.

If source storage `util_pct` exceeds 100, retain the raw source value and flag it for verification. Do not silently clamp it.

Filesystem Capacity and Storage I/O Activity are separate evidence planes.

## Historical trend contract

Long-range Server Trend is bucketed.

For Peak mode, preserve:

- bucket;
- peak timestamp;
- peak value;
- peak collection ID.

Trend Details must load workloads from the exact peak collection.

## WP/Trace evidence

Per-process/WP evidence may include CPU signal, Error at Snapshot, Latest Trace Error, error recency, counters, and log path.

`Latest Trace Error` may be historical. The operator UI labels retained values as AT SNAPSHOT or HISTORICAL.

Selected-workload APP Critical WP keeps observed zero separate from missing/not-retained evidence.

SM37 remains the authoritative execution-status source.

## PDF quick report

The one-page report is intended for fast operational handoff.

It must preserve:

- selected collection/run identity;
- selected workload identity;
- observed-zero versus Not observed semantics;
- explicit Performance and Availability source times;
- report-level ALIGNED/PARTIAL timing state;
- plain wording that does not turn time correlation into a root-cause verdict.

## Release troubleshooting

Useful checks:

```bash
git status
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

PROD route validation:

```bash
bash ops/rundeck/smoke-prod-routes.sh https://sphere.astraotoparts.co.id
```

DEV health examples:

```bash
curl -fsS https://sphere.astraotoparts.co.id/dev/api/health
curl -fsS https://sphere.astraotoparts.co.id/dev/api/platform/health
curl -fsS 'https://sphere.astraotoparts.co.id/dev/api/evaluation/workloads?period=1d&type=ALL&limit=5'
```

A Vite chunk-size warning is informational unless the build exits non-zero.

Treat failed QA, readiness, Nginx validation, API smoke tests, route isolation, or transactional deploy checks as release blockers.

## Credentials

Never place Rundeck tokens, SAP credentials, passwords, private keys, or raw SAP logs in Git.

Reader and runner credentials remain server-side only.

Keep `RUNDECK_COLLECT_NOW_ENABLED=false` unless authenticated user identity and explicit authorization are enforced for the mutating route.

## Retention

Raw evidence and PostgreSQL monitoring history follow configured retention settings.

Do not delete retained raw evidence as a database-repair shortcut.

The deploy/runtime release cleanup retains a bounded rollback window.


## Infrastructure freshness / filesystem mismatch (v1.34.75 DEV)

The AOP PROD infrastructure source is read-only to SAP. The SPHERE DEV UI refreshes its Infrastructure host, filesystem, network and storage requests every 60 seconds; it never runs an SAP command directly. Snapshot age exceeds 15 minutes: show `STALE`; timestamp missing/invalid or more than 60 seconds in the future: show `UNKNOWN`. In both cases preserve original values as last-observed evidence, and suppress current capacity/network/I/O severity classifications. The modal and main cockpit must agree.

A mismatch like SPHERE's 7-hour-old `/INTF 92%` versus a manually executed `df -h /INTF` reporting `88%` cannot be resolved by changing CSS/percentage math. Compare host identity, the collector `snapshot_ts`, execution ID, poller status and the time of the SAP command. Do not overwrite saved evidence or substitute the manual 88% as an automated sample.

Read-only diagnosis on `JAHSVR-SPHERE`:

```bash
systemctl list-timers --all 'sphere-rundeck-infra*' --no-pager
systemctl show sphere-rundeck-infra-aop-prod-test.service -p ActiveState -p Result -p ExecMainStatus
journalctl -u sphere-rundeck-infra-aop-prod-test.service -n 40 --no-pager
cat /var/lib/sphere/infra-ingestion/poller-aop-prod.json
curl --noproxy '*' -fsS http://127.0.0.1:8091/infra/latest?source=aop-prod
curl --noproxy '*' -fsS http://127.0.0.1:8091/infra/filesystems?host=AOPH1PAPPDC
```

Infrastructure collection and ingestion are independent: timer `sphere-rundeck-infra-aop-prod-test.timer` is configured every five minutes; the Rundeck job itself must execute successfully and produce a new timestamp for each expected host. A successful UI build does not restart or repair that external collection pipeline.

DEV source validation now includes `node --test scripts/tests/infrastructure-freshness.test.mjs` via `npm run qa`. Standard transactional DEV build/deploy:

```bash
cd /root/rundeck-sphere-dev
git fetch origin rundeck-sphere-dev
git switch rundeck-sphere-dev
git reset --hard origin/rundeck-sphere-dev
bash ops/rundeck/qa-build-dev.sh && bash ops/rundeck/prod-readiness-check.sh && bash ops/rundeck/deploy-dev.sh
```

Perform the reset only if this checkout has no unpublished local work; otherwise reconcile that work first. No changes to `rundeck-sphere-prod`, `sphere-prod` or the SAP host are part of this update.

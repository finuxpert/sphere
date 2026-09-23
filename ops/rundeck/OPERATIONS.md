# SPHERE Rundeck Operations

This runbook covers both the isolated `rundeck-sphere-dev` runtime under `/dev` and promotion/deployment to `rundeck-sphere-prod`.

## Release flow

```text
rundeck-sphere-dev
    ↓ unit tests + npm QA
    ↓ DEV smoke/readiness
    ↓ GitHub Pull Request
rundeck-sphere-prod
    ↓ production build
    ↓ transactional deploy
https://sphere.astraotoparts.co.id
```

Never force-reset the production branch to DEV. If branches have diverged, merge using a normal GitHub Pull Request.

## DEV validation and deployment

Update the DEV checkout:

```bash
cd /root/rundeck-sphere-dev
git fetch origin
git reset --hard origin/rundeck-sphere-dev
```

Validate backend/frontend and deploy DEV when needed:

```bash
bash -n ops/rundeck/deploy-dev.sh
/opt/sphere/tools/bin/uv pip install --python /opt/sphere-rundeck-dev/venv/bin/python -r backend/requirements.txt
/opt/sphere-rundeck-dev/venv/bin/python -m unittest backend.tests.test_rundeck
npm run qa
bash ops/rundeck/deploy-dev.sh
bash ops/rundeck/prod-readiness-check.sh
```

The readiness gate must finish with:

```text
READINESS PASS: collector fresh, watchdog healthy, auto-healing enabled
SPHERE PROD READINESS PASS
HEAD <validated-dev-sha>
```

`prod-readiness-check.sh` validates the repository with `git rev-parse`, so both a normal checkout and a Git worktree with a file-based `.git` are supported.

`deploy-dev.sh` stages backend/frontend releases, validates Nginx, activates new symlinks, performs API/browser smoke checks, and automatically restores the prior DEV release if activation fails. Production symlinks remain unchanged.

## GitHub promotion

After DEV readiness passes, create a PR:

```text
base:    rundeck-sphere-prod
compare: rundeck-sphere-dev
```

Review the PR diff and merge normally. Temporary/hotfix branches must not become permanent release branches.

## Production deployment

After the PR is merged:

```bash
cd /root/rundeck-sphere-prod
git fetch origin
git reset --hard origin/rundeck-sphere-prod
npm ci
npm run qa
npm run build
bash ops/rundeck/deploy-prod.sh
```

Expected final marker:

```text
PRODUCTION DEPLOY SUCCESS
REVISION <prod-sha>
```

The production deploy script verifies that the checkout is clean and exactly matches `origin/rundeck-sphere-prod`. It then performs transactional activation and smoke tests for the production web bundle, production Rundeck API, legacy API compatibility, platform readiness, and DEV isolation.

If a production smoke/activation step fails, the script restores the previous web/API symlinks and Nginx configuration automatically.

Production release paths:

- API releases: `/opt/sphere-rundeck-prod/releases`
- Web releases: `/var/www/sphere.astraotoparts.co.id/releases`
- Current API: `/opt/sphere-rundeck-prod/current`
- Current web: `/var/www/sphere.astraotoparts.co.id/current`

The deploy script retains a bounded rollback window of recent releases.

## Release troubleshooting

Useful checks:

```bash
git status
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

For DEV readiness:

```bash
bash ops/rundeck/smoke-watchdog-dev.sh https://sphere.astraotoparts.co.id/dev
curl -fsS https://sphere.astraotoparts.co.id/dev/api/platform/health | python3 -m json.tool
```

For PROD route validation:

```bash
bash ops/rundeck/smoke-prod-routes.sh https://sphere.astraotoparts.co.id
```

Vite's chunk-size warning is informational unless the build exits non-zero. Treat failed unit tests, `npm run qa`, readiness checks, Nginx validation, API smoke tests, or transactional deploy checks as release blockers.

The DEV release janitor retains `SPHERE_RELEASES_KEEP` revisions, default `5`, under:

- `/opt/sphere-rundeck-dev/releases`
- `/var/www/sphere-dev/releases`

## Rundeck credentials

Never place Rundeck tokens in Git, frontend code, browser storage, or application logs.

Reader credential:

- source file: `/etc/sphere/rundeck-readonly.token`
- runtime credential name: `rundeck-reader`
- consumer: `sphere-rundeck-poller.service`
- intended ACL: execution and output read only for the approved SPHERE job scope

Runner credential:

- source file: `/etc/sphere/rundeck-runner.token`
- runtime credential name: `rundeck-runner`
- consumer: `sphere-rundeck-api.service` only when the source file exists
- intended ACL: run and execution read only for the exact approved SPHERE job

The deploy script enforces `root:sphere` ownership and mode `0640`. The Python runtime
prefers systemd's `$CREDENTIALS_DIRECTORY` and keeps the configured token file only as a
rollout fallback.

Keep `RUNDECK_COLLECT_NOW_ENABLED=false` until an authenticated user identity is enforced
in front of the mutating API route.

## Collector watchdog and self-healing

v1.31 keeps the v1.30 collector watchdog and adds recovery audit, dashboard drill-down, and production-readiness gates:

- `sphere-rundeck-watchdog.timer` checks the exact configured SPHERE Rundeck job every two minutes.
- Warning threshold defaults to 5 minutes; abort threshold defaults to 10 minutes.
- Auto-abort requires the same execution to breach the threshold on two consecutive checks.
- `SPHERE_WATCHDOG_AUTO_ABORT=false` is the safe default. Enable it only after `RUNDECK_RUN_JOB_ID` is the exact approved collector UUID and the runner credential is present.
- Runtime state is written to `/var/lib/sphere/ingestion/watchdog.json`; recovery confirmation is stored in `watchdog-recovery.json`.
- A bounded JSONL audit trail is available through `GET /dev/api/watchdog/events`.
- System Health exposes collector freshness, watchdog state, auto-healing state, and the latest recovery.
- Prometheus exposition is available at `/dev/api/metrics`; versioned scrape/rule/Alertmanager templates live in `ops/observability/`.
- `ops/rundeck/smoke-watchdog-dev.sh` validates the runtime without mutating Rundeck.
- `ops/rundeck/prod-readiness-check.sh` blocks promotion when the collector is stale, watchdog is unhealthy, or auto-healing is disabled.

The Server Trend chart pins the x-axis to the selected time window and inserts explicit
`COLLECTION GAP` regions with start/end time and duration only when the gap exceeds two resolved sampling intervals. Raw/6H use the collector cadence, 24H uses 30-minute buckets, 7D uses 1-hour buckets, and 30D uses 6-hour buckets.

## Operator clarity

v1.32 makes data-cycle identity and monitoring evidence explicit:

- Performance header shows the last committed `Performance READY #<execution>` snapshot.
- A currently executing collector is labeled separately as `Collector RUNNING #<execution>`.
- SAP Availability shows its own `Availability READY #<execution>` cycle.
- System Health ATTENTION/CRITICAL includes the primary observed signal, while preserving the rule that a signal is not an automatic root-cause declaration.
- Server Trend adds a dedicated COLLECTION GAP band with start/end time and duration.
- 24H/7D/30D trends reduce point clutter and emphasize lines; detailed points remain available through hover.

## Availability observation semantics

v1.33 separates Service Availability observations from performance collector gaps:

- Availability/HANA/Replication/SSH/Web history is treated as observed evidence from retained Rundeck Service Availability executions.
- Missing observations are `NO OBSERVATION`/unknown and are never inferred as `DOWN`.
- Expected availability cadence is derived from retained execution timestamps, using at least the recent 24-hour observation history when available.
- `SPHERE_AVAILABILITY_CADENCE_SECONDS` is only a fallback when retained timestamps cannot establish cadence.
- `SPHERE_AVAILABILITY_GAP_FACTOR` defaults to `2.2`, tolerating normal schedule/runtime drift before a missing-observation interval is surfaced.
- Long-range history distinguishes `HISTORY COVERAGE` from an internal `NO OBSERVATION` interval.
- Observed availability percentages are descriptive of retained checks and are not an SLA calculation.
- Server Trend uses date-aware WIB axis labels for 24H/7D/30D views.
- Category labels remain explicit: SAP App Availability, HANA System DB Availability, HANA Replication Availability, SSH Reachability, and Web Dispatcher Availability.

## Collection-cycle consistency

`GET /dev/api/history/hosts/latest` returns APP1 through APP5 from one latest READY
Rundeck Collection Cycle. It must never assemble a landscape from independent per-host
latest rows. If the latest manifest and the latest database projection differ, the UI
withholds the operational host table until a complete aligned cycle is available.

## Performance Evaluation

The read-only endpoint is:

```text
/dev/api/evaluation/workloads?period=7d&type=ALL&limit=30
```

Supported periods:

- `1d` — rolling 1-day window versus the preceding 1-day window
- `7d` — rolling 7-day window versus the preceding 7-day window
- `30d` — rolling 30-day window versus the preceding 30-day window

Supported workload filters are `ALL`, `PROGRAM`, and `JOB`. Evaluation is deterministic
and based on normalized Top Consumer observations. It is a performance-review signal,
not a root-cause declaration.

Review inputs include occurrence rate, average/peak Process CPU, average/peak PSS,
Application Server distribution, Critical WP correlation, and average Process CPU change
versus the previous equivalent period. Thresholds are configurable with the
`SPHERE_EVAL_*` variables documented in `rundeck-dev.env.example`.

Quick check:

```bash
curl -fsS 'https://sphere.astraotoparts.co.id/dev/api/evaluation/workloads?period=7d&type=ALL&limit=5'
```

## Platform Health

Operational status is exposed at:

```text
/dev/api/platform/health
```

Signals include:

- Rundeck collector state and credential mode
- filesystem usage
- inode usage
- raw evidence file count and size
- PostgreSQL size, connection count and long transactions
- WAL size when the PostgreSQL role is permitted to inspect it
- retention last success or last failure
- backup status marker
- backend and frontend release counts

The detailed Platform Health table is collapsed by default in the SAP cockpit.

## Retention

Raw evidence, rejected evidence, manifests and PostgreSQL monitoring history follow
`SPHERE_RETENTION_DAYS`, default `90` days. Maintenance is time-gated by
`SPHERE_MAINTENANCE_INTERVAL_SECONDS`, default `21600` seconds.

Successful maintenance writes:

```text
/var/lib/sphere/ingestion/maintenance.json
```

A retention exception writes only its failure type and timestamp to:

```text
/var/lib/sphere/ingestion/maintenance-error.json
```

No credential or Rundeck response body is written to either status file.

## Backup status contract

A future backup job can publish its latest state to
`SPHERE_BACKUP_STATUS_FILE`, default `/var/lib/sphere/ingestion/backup.json`.

Example:

```json
{
  "status": "OK",
  "last_success": "2026-09-10T18:00:00+07:00",
  "type": "pg_dump-and-raw-evidence"
}
```

Platform Health reports `NOT_CONFIGURED` until a backup job owns this marker. The health
endpoint does not perform backups itself.

## Visual QA

The default release gate remains dependency-locked and browser-free:

```bash
npm run qa
```

Optional Playwright visual checks are documented in `docs/VISUAL-QA.md`. They cover
1920×1080 and 1366×768 dashboard layouts, the Evaluation section, and resolved SAP issue
severity semantics. Playwright output is ignored by Git so it does not block the clean
working-tree deploy guard.

## First checks during an incident

```bash
systemctl status sphere-rundeck-api.service sphere-rundeck-poller.timer sphere-rundeck-poller.service sphere-rundeck-watchdog.timer sphere-rundeck-watchdog.service --no-pager -l
journalctl -u sphere-rundeck-api.service -u sphere-rundeck-poller.service -u sphere-rundeck-watchdog.service -n 100 --no-pager
curl -fsS https://sphere.astraotoparts.co.id/dev/api/health
curl -fsS https://sphere.astraotoparts.co.id/dev/api/platform/health
curl -fsS 'https://sphere.astraotoparts.co.id/dev/api/evaluation/workloads?period=1d&type=ALL&limit=5'
```

Treat the PostgreSQL projection as query storage and the compressed Rundeck raw log as
RCA evidence. Do not delete the raw archive as a database-repair shortcut.

# Rundeck Development — Current DEV/PROD Runbook

This is the **maintained deployment contract** for the Rundeck-integrated SPHERE lines. Older per-version UI notes and build-only shortcuts are not approved release runbooks.

## Runtime and isolation

- Repository: `finuxpert/sphere`; DEV `rundeck-sphere-dev`; PROD `rundeck-sphere-prod`.
- DEV: `/root/rundeck-sphere-dev`, `https://sphere.astraotoparts.co.id/dev/`, API `127.0.0.1:8091`, web `/var/www/sphere-dev/current`, API `/opt/sphere-rundeck-dev/current`, systemd `sphere-rundeck-api.service`.
- PROD: `/root/rundeck-sphere-prod`, `https://sphere.astraotoparts.co.id/`, API `127.0.0.1:8092`, web `/var/www/sphere.astraotoparts.co.id/current`, API `/opt/sphere-rundeck-prod/current`, systemd `sphere-rundeck-prod-api.service`.
- DEV Vite base `/dev/`; PROD `/`. The two runtimes share `JAHSVR-SPHERE` but must remain isolated by branch, release, port, service and Nginx route.
- `sphere-dev` and `sphere-prod` are separate Manual Upload Logs branches. Retained ingestion evidence is outside Git under `/var/lib/sphere/ingestion`.

A source commit/CI PASS does not establish the active server release. Verify symlinks, API and public UI separately.

## Fast DEV deployment — operator runbook

**Standard route:** guarded full-stack DEV release for frontend or backend changes. Perform a **migration diff review** first. When the candidate requires no schema migration:

```bash
cd /root/rundeck-sphere-dev
SPHERE_DEV_MIGRATION_DECISION=skip bash ops/rundeck/release-dev-fast.sh
```

This command performs:

1. **SOURCE:** branch `rundeck-sphere-dev`, clean worktree, fetch and `merge --ff-only` from origin. It never force-resets local edits.
2. **QA:** `ops/rundeck/qa-build-dev.sh` executes `npm run qa` (lint, integrity, source/data/Trend/Bootstrap/cockpit tests and build), or reuses proof only for an exactly matching commit, runtime, environment and artifact checksum.
3. **BACKEND_UNIT_TESTS:** pinned DEV Python venv regression tests.
4. **MIGRATION_GUARD:** validates the active DEV release and confirms migration files are unchanged before allowing a no-migration skip, when migrations are configured in `/etc/sphere/rundeck-dev.env`.
5. **DEPLOY:** guarded DEV API/web release, smoke/health checks and rollback safety. PROD cross-environment release paths must not change.

**Never use `skip` when migration scripts/schema changes require execution.** Stop and use a separately reviewed migration process. Do not call `sphere deploy dev` for full-stack/backend changes; it is a specialized frontend-only operation. Do not run `qa-build-dev.sh` and `deploy-dev.sh` separately around the wrapper.

Expected successful stage *names*, not a promise about their results:

```text
SOURCE=PASS
QA=PASS BUILD=PASS
BACKEND_TESTS=PASS
DEPLOY=PASS DB_MIGRATION=SKIPPED
FINAL=PASS DEV_SHA=<sha> PROD=UNCHANGED_BY_RELEASE_GUARDS
```

`FINAL=PASS` verifies the release script's conditions, **not** desktop/mobile visual sign-off.

### Failure triage

```bash
grep -E '^FAIL |^not ok |BLOCKED|QA FAILED|DEPLOY FAILED|error:|Error:' /tmp/sphere-dev-release-last.log | head -n 25
tail -n 60 /tmp/sphere-dev-release-last.log
```

A failure in SOURCE, QA, BACKEND_UNIT_TESTS, MIGRATION_GUARD or DEPLOY **blocks continuing**. Do not force a symlink, retry with `git reset --hard`, bypass QA or inject migration approval. Never paste protected credentials or tokens.

### Post-release verification

```bash
cd /root/rundeck-sphere-dev
git rev-parse --short HEAD
readlink -f /opt/sphere-rundeck-dev/current
readlink -f /var/www/sphere-dev/current
curl --noproxy '*' -fsS --max-time 10 http://127.0.0.1:8091/health >/dev/null && echo DEV_API_HEALTH=PASS
```

Validate public `/dev/`, version/build SHA, APP identity and source freshness, four charts, peak timestamps, dropdowns, 1536 × 864 overview viewport, other desktop/mobile screenshots, Jobs & Programs, and modal navigation. The screenshot no-scroll target is not proven by CI or source review. See [Visual QA](VISUAL-QA.md).

## Current UI contract

- Top-level **ST03N Analysis** and **Performance Analysis**.
- Primary Performance sidebar: **Monitoring**, **Jobs & Programs**, **Data Collection**, **Reports**. Existing deep-link/drawer views for Related Events, SAP Checks, Infrastructure and others remain functional.
- Monitoring: SAP APP1–APP5; four configurable **ECharts** trends (CPU/Memory/Network/Critical WP by default) with shared range, interval, Avg/Peak and APP focus; compact Jobs & Programs/System Health preview.
- Bootstrap 5.3.8 is imported as a low-priority CSS foundation; the Bootstrap responsive grid handles the four trend charts. The lower Jobs & Programs / System Health panels use a dedicated 58/42 CSS Grid at desktop widths ≥1200px, not Bootstrap columns. Application-specific styling remains; a complete Bootstrap redesign has **not** been implemented.
- Jobs & Programs has Current, Review and Search; historical investigation uses saved data, drilldowns and source-aware periods.
- Data Collection separates Rundeck/Automatic, Manual Upload and collection history; Reports includes Monthly Review/PDF.

Detailed feature contract: [CURRENT-FLOW-AND-FEATURES.md](CURRENT-FLOW-AND-FEATURES.md).

## Source and SAP evidence integrity

- One aligned READY collection is the current snapshot basis. Do not silently combine unrelated host/collection identities.
- Performance and SAP service availability have independent freshness windows. Missing/unverified availability is not DOWN; historical UP is not proof of current availability.
- APP Critical WP is APP evidence, not an SM37 job-failure statement; background-job execution requires authoritative SM37 data.
- Grouped CPU >100% is possible. PSS workload memory and host RAM are distinct.
- Historical aggregation preserves bucket time, exact peak timestamp/value and peak collection identity. Missing observations are gaps.
- Correlated evidence does not automatically establish causality. Stale Infra samples are historical, not live health.
- WP latest trace errors may be historical, not necessarily at snapshot.

## Monitoring credential/role boundary

Use least-privilege `sphere_api`/`sphere_reader` credentials for approved read access, with expiry and rotation verified against actual Rundeck configuration. Do not use admin reader tokens or put credentials in Git, logs or chat. DEV runner credentials require independent permission/expiry review. Detailed token ownership and rotation steps: [OPERATIONS.md](../ops/rundeck/OPERATIONS.md#sphere-monitoring-token-ownership-and-30-day-rotation). Maintainer authorization is not granted by documentation.

## DEV performance baseline (read-only)

The source provides `scripts/perf-baseline-dev.mjs`, with unit tests in `scripts/tests/perf-baseline-dev.test.mjs`. It uses sequential GETs and bounded sampling to `127.0.0.1:8091` by default; PROD API port 8092 is forbidden.

```bash
npm run perf:baseline:dev -- --samples=10 > /tmp/sphere-dev-perf-baseline.json
```

The output includes API request latency P50/P95/P99, HTTP failures and response size for CPU 1D/7D/30D/3M/6M plus selected RAM, Network, Critical WP and review endpoints. It does not prove frontend LCP/INP, collector performance or SQL query cost. Compare before/after results when optimizing.

## Production promotion

Do **not** merge DEV inside the PROD checkout, force-reset PROD, or copy `/dev/` build artifacts directly to root-path PROD. Production branch updates require explicit review/approval, branch-specific build and guarded PROD release. Preserve PROD-only deploy, routing, service and security files. Consult [OPERATIONS.md](../ops/rundeck/OPERATIONS.md) and the specialized frontend-only promotion guidance if that route is explicitly approved. This runbook authorizes **no** PROD change.

# Rundeck Development — Current DEV/PROD Runbook

> **Operational decision (23 Nov 2026): SPHERE is DEV MAINTENANCE FIRST. PROD promotion is ON HOLD until source-backed DEV testing, performance/reliability review and separate change approval are complete.** The release/failure chronology, DEV-only UI release procedure and formal production gates live in [DEV-first maintenance and PROD promotion gates](../../ops/rundeck/DEV_FIRST_MAINTENANCE_AND_PROD_PROMOTION.md). This document grants no PROD modification.


This is the **maintained deployment contract** for the Rundeck-integrated SPHERE lines. Older per-version UI notes and build-only shortcuts are not approved release runbooks.

## Runtime and isolation

- Repository: `finuxpert/sphere`; DEV `rundeck-sphere-dev`; PROD `rundeck-sphere-prod`.
- DEV: `/root/rundeck-sphere-dev`, `https://sphere.astraotoparts.co.id/dev/`, API `127.0.0.1:8091`, web `/var/www/sphere-dev/current`, API `/opt/sphere-rundeck-dev/current`, systemd `sphere-rundeck-api.service`.
- PROD: `/root/rundeck-sphere-prod`, `https://sphere.astraotoparts.co.id/`, API `127.0.0.1:8092`, web `/var/www/sphere.astraotoparts.co.id/current`, API `/opt/sphere-rundeck-prod/current`, systemd `sphere-rundeck-prod-api.service`.
- DEV Vite base `/dev/`; PROD `/`. The two runtimes share `JAHSVR-SPHERE` but must remain isolated by branch, release, port, service and Nginx route.
- `sphere-dev` and `sphere-prod` are separate Manual Upload Logs branches. Retained ingestion evidence is outside Git under `/var/lib/sphere/ingestion`.

A source commit/CI PASS does not establish the active server release. Verify symlinks, API and public UI separately.

## Fast DEV deployment — operator runbook

**Standard full-stack route:** guarded DEV release for backend or combined changes. For **frontend/PDF/CSS-only** changes, review the documented DEV **UI-only** release first; it avoids unnecessary backend/poller restarts but retains PROD health guards. Perform a **migration diff review** before full-stack deployment. When the candidate requires no schema migration:

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

### DEV UI-only release for presentation changes

When the diff contains **only frontend/PDF/CSS/tests/docs**, and the exact source SHA has passed GitHub QA, use the DEV UI-only script **after checking PROD smoke health**:

```bash
cd /root/rundeck-sphere-dev
test "$(git branch --show-current)" = rundeck-sphere-dev
test -z "$(git status --porcelain)"
bash ops/rundeck/release-ui-dev.sh "$(git rev-parse HEAD)"
```

This script runs guarded QA/build, switches only `/var/www/sphere-dev/current` and verifies DEV API, PROD routes, and unchanged PROD files. It does not restart DEV backend, start pollers, or migrate the DB. The release SHA being present in Git or a passed GitHub workflow is **not** evidence of a successful server cutover. Inspect the script's `FINAL=PASS MODE=DEV_UI_ONLY` and the active symlink after execution.

**Current incident checkpoint (23 Nov):** full deploy of commit `599c21a1` passed SOURCE/QA/backend tests and DEV checks, but rollback occurred on two `PROD_COLLECTIONS` 15s curl timeouts (exit 28). The last operator-verified DEV API and web remained at `81c85e62`. A later isolated PROD retry returned HTTP 200 but did not establish sustained performance. **Do not bypass or remove the PROD cross-smoke to get a green deploy.** Complete history and read-only checks: [DEV-first maintenance runbook](../../ops/rundeck/DEV_FIRST_MAINTENANCE_AND_PROD_PROMOTION.md).

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

Validate public `/dev/`, version/build SHA, APP identity and source freshness, four charts, peak timestamps, dropdowns, 1536 × 864 overview viewport, other desktop/mobile screenshots, Jobs & Programs, and modal navigation. The screenshot no-scroll target is not proven by CI or source review. See [Visual QA](../standards/VISUAL-QA.md).

## Current UI contract

- Top-level **ST03N Analysis** and **Performance Analysis**.
- Primary Performance sidebar: **Monitoring**, **Jobs & Programs**, **Data Collection**, **Reports**. Existing deep-link/drawer views for Related Events, SAP Checks, Infrastructure and others remain functional.
- Monitoring: SAP APP1–APP5; four configurable **ECharts** trends (CPU/Memory/Network/Critical WP by default) with shared range, interval, Avg/Peak and APP focus; compact Jobs & Programs/System Health preview.
- Bootstrap 5.3.8 is imported as a low-priority CSS foundation; the Bootstrap responsive grid handles the four trend charts. The lower Jobs & Programs / System Health panels use a dedicated 58/42 CSS Grid at desktop widths ≥1200px, not Bootstrap columns. Application-specific styling remains; a complete Bootstrap redesign has **not** been implemented.
- Jobs & Programs has Current, Review and Search; historical investigation uses saved data, drilldowns and source-aware periods.
- Data Collection separates Rundeck/Automatic, Manual Upload and collection history; Reports includes Monthly Review/PDF.
- **Reports frontend ownership (DEV maintenance, phase 2):** `RundeckMonthlyReview.jsx` owns API/snapshot source guards, period/filter state, evidence drawer and export-generation lifecycle; `RundeckMonthlyManagement.jsx` owns summary panels; `RundeckMonthlyEvidencePanels.jsx` owns pressure/errors; `RundeckMonthlyReportHeader.jsx` owns controlled selectors/actions; `rundeckMonthlyExport.js` and `RundeckMonthlyPngExport.jsx` own the format dispatch and PNG capture. Existing PDF renderer files, CSS cascade, output contracts and backend remain unchanged. See [phase-2 Reports refactor validation](../../ops/rundeck/REPORT_FRONTEND_REFACTOR_PHASE2_20261123.md).

Detailed feature contract: [CURRENT-FLOW-AND-FEATURES.md](../CURRENT-FLOW-AND-FEATURES.md).

## Source and SAP evidence integrity

- One aligned READY collection is the current snapshot basis. Do not silently combine unrelated host/collection identities.
- Performance and SAP service availability have independent freshness windows. Missing/unverified availability is not DOWN; historical UP is not proof of current availability.
- APP Critical WP is APP evidence, not an SM37 job-failure statement; background-job execution requires authoritative SM37 data.
- Grouped CPU >100% is possible. PSS workload memory and host RAM are distinct.
- Historical aggregation preserves bucket time, exact peak timestamp/value and peak collection identity. Missing observations are gaps.
- Correlated evidence does not automatically establish causality. Stale Infra samples are historical, not live health.
- WP latest trace errors may be historical, not necessarily at snapshot.

## Monitoring credential/role boundary

Use least-privilege `sphere_api`/`sphere_reader` credentials for approved read access, with expiry and rotation verified against actual Rundeck configuration. Do not use admin reader tokens or put credentials in Git, logs or chat. DEV runner credentials require independent permission/expiry review. Detailed token ownership and rotation steps: [OPERATIONS.md](../../ops/rundeck/OPERATIONS.md#sphere-monitoring-token-ownership-and-30-day-rotation). Maintainer authorization is not granted by documentation.

## DEV performance baseline (read-only)

The source provides `scripts/perf-baseline-dev.mjs`, with unit tests in `scripts/tests/perf-baseline-dev.test.mjs`. It uses sequential GETs and bounded sampling to `127.0.0.1:8091` by default; PROD API port 8092 is forbidden.

```bash
npm run perf:baseline:dev -- --samples=10 > /tmp/sphere-dev-perf-baseline.json
```

The output includes API request latency P50/P95/P99, HTTP failures and response size for CPU 1D/7D/30D/3M/6M plus selected RAM, Network, Critical WP and review endpoints. It does not prove frontend LCP/INP, collector performance or SQL query cost. Compare before/after results when optimizing.

## DEV persistent Monthly/Weekly report worker

On 6 November 2026 the DEV-only persistent report snapshot feature was deployed and enabled at verified API release `8c75ec7b`. The worker is a separate oneshot systemd service (`sphere-report-precompute-dev.service`) and the refresh timer is `sphere-report-precompute-dev.timer`. The API flag `SPHERE_REPORT_SNAPSHOT_DEV=true` is DEV-only; the SQL strategy flag `SPHERE_EVAL_SPLIT_DISTINCT_DEV=true` remains active. The worker is **not** automatically installed or enabled by the standard DEV deploy script; activation/rollback is a separate operator action. Check systemd status and journal independently. The observed initial worker took 3m35s wall time to build five snapshots; subsequent unchanged READY collection anchors generated five `SKIP_FRESH` outcomes in 921ms. A completed oneshot worker showing `inactive (dead)` and `Result=success` is healthy. The API serves snapshot-backed Monthly and Weekly responses in observed subsecond timings, with explicit stale-state handling; this does not prove browser render latency. See [the verified snapshot runbook](../../ops/rundeck/REPORT_PERSISTENT_SNAPSHOT_DEV_ROLLOUT.md) for source paths, timestamps, daily checks and safe rollback.

## GitHub repository housekeeping (24 November 2026)

Remote branch housekeeping and documentation curation are **not** a release and must not run migrations, edit active symlinks or restart any service. See [Repository Hygiene — branch audit, keep rules and dry-run cleanup](REPOSITORY_HYGIENE_20261124.md) and the [current documentation index](../DOCUMENTATION-INDEX.md).

- Preserve `rundeck-sphere-dev`, `rundeck-sphere-prod`, `sphere-dev`, `sphere-prod`, GitHub default branch and all open PR heads/bases.
- Preserve any closed **unmerged** PR work; in particular, CSS refactor #117 was intentionally closed **without merge** because it breached the Reports CSS bundle budget.
- Delete merged-PR heads only after the tool independently revalidates the remote SHA, merge state and absence of open-PR dependencies. The cleanup script defaults to a **read-only dry-run**; actual deletion needs `--apply` and GitHub Contents write permission.
- Dated release and recovery documents are historical evidence, not the latest deployed state; the last operator-confirmed DEV UI-only SHA is `5978b757`, and later merged backend source changes still require guarded full-stack DEV deployment.

## Production promotion

**Hold:** DEV maintenance must be signed off before any PROD proposal. See the mandatory [DEV-first PROD eligibility checklist](../../ops/rundeck/DEV_FIRST_MAINTENANCE_AND_PROD_PROMOTION.md#5-prod-promotion-eligibility--all-gates-must-pass) for required functional, report, visual, performance, reliability, security, rollback, and stakeholder approvals.


Do **not** merge DEV inside the PROD checkout, force-reset PROD, or copy `/dev/` build artifacts directly to root-path PROD. Production branch updates require explicit review/approval, branch-specific build and guarded PROD release. Preserve PROD-only deploy, routing, service and security files. Consult [OPERATIONS.md](../../ops/rundeck/OPERATIONS.md) and the specialized frontend-only promotion guidance if that route is explicitly approved. This runbook authorizes **no** PROD change.

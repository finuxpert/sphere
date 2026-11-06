# SPHERE PROD — Calendar report snapshots (opt-in candidate; NOT DEPLOYED)

**Scope:** rundeck-sphere-prod only. Candidate based on the DEV snapshot worker model, but uses PROD compatibility evaluator and isolated PROD files.

## Verified baseline before PR (6 Nov 2026)

- Operator audit: PROD checkout SHA 6089dcd; live API release compat-6089dcd054e7; live UI release ui-d6ed5eab59937c85080de35d994a8bc6f6592f4d.
- PROD API 8092/health HTTP 200 in 0.277933s. Both DEV and PROD services were active.
- Both environments use DB_MODE=hybrid and same configured database host/port/name fingerprint 241f223b073dcb99, database sphere_rundeck_dev. Therefore SQL workloads compete for shared database capacity.
- PROD Monthly, Weekly and Custom report paths are handled by backend/rundeck_prod_compat_evaluation.py, not by the DEV report evaluator.
- DEV automatic report snapshot worker completed successfully at 15:05:33 WIB, rebuilding Weekly 2026-11-02 with 836 workloads. This is NOT evidence of PROD parity.

## Candidate implementation (explicit opt-in, OFF by default)

- backend/rundeck_prod_report_snapshots.py: atomic gzip full-report store, versioned PROD-specific contract, strict PROD directory /var/lib/sphere/report-snapshots-prod, and flags SPHERE_REPORT_SNAPSHOT_PROD=true plus approved DB_MODE and sphere_rundeck_dev database guard.
- backend/rundeck_prod_report_precompute.py: separate worker using the existing PROD compatibility evaluator and baseline SQL; validates READY collection anchor before and after computation.
- PROD evaluator: only serves FRESH Monthly/Weekly snapshots. For mismatched anchors it falls back to original SQL. This preserves PROD UI behavior without silently serving STALE data, since PROD UI warning/export safety is not yet validated.
- Custom and rolling periods remain unchanged.
- sphere-report-precompute-prod.service and .timer: separate oneshot and timer, disabled and NOT installed by the code release. Read-only DB session policy, filesystem writes restricted to PROD snapshot directory; worker lock prevents concurrent instances.
- CI and guarded PROD release script include unit tests. No schema migrations, DB writes, or SAP collector changes.

## Mandatory release and activation gates

1. PROD PR compatibility CI, offline regression, and source review PASS.
2. Read-only PROD parity against existing SQL: full report population, Monthly/Weekly date bounds, workload count and row keys, error and pressure signals, filter/pagination and report contract. DEV counts are reference only, not assumed PROD expected counts.
3. Inspect DB concurrency and disk headroom. Since DEV and PROD use same configured PostgreSQL target, prevent concurrent heavy workers; schedule initial PROD precompute outside critical SAP closing windows.
4. Capture PROD release SHA, service state, prior API symlink and config backup. Do not reset PROD checkout or blindly merge DEV.
5. Use guarded PROD API release with feature flag OFF; verify API health, monthly routes and current UI unchanged.
6. Only in separately approved activation: install PROD worker unit files (but leave timer disabled), enable PROD flag only after QA, and run one closed reporting period manually. Validate snapshot parity and CPU/SQL pressure before proceeding to another period.
7. After repeated successful manual tests, enable PROD timer and verify automatic cycle and rollback. Do not run DEV and PROD precompute simultaneously.
8. Record deployed SHA, HTTP benchmarks, API response freshness and PROD/DEV invariants.

## Read-only operational checks

    systemctl is-active sphere-rundeck-prod-api sphere-rundeck-api
    readlink -f /opt/sphere-rundeck-prod/current
    readlink -f /var/www/sphere.astraotoparts.co.id/current
    curl --noproxy '*' -fsS --max-time 10 -o /dev/null -w 'PROD_HEALTH=%{http_code} %{time_total}s\n' http://127.0.0.1:8092/health
    systemctl list-timers --all sphere-report-precompute-dev.timer sphere-report-precompute-prod.timer --no-pager

## Bounded live-data parity helper (read-only, BEFORE merge)

The branch includes ops/rundeck/compare-prod-calendar-snapshot-read-only.py. It compares the **existing live PROD API** against candidate PROD-compatible SQL using one *closed* reporting week. Both use the current PROD database configuration, with explicit PostgreSQL read-only sessions on the candidate and the feature flag forced OFF. It checks the source READY anchor before and after, the full population across pages, summary, pressure, errors, daily host trend, and evaluated workload rows. It emits only status/counts and mismatch field names, never raw SAP data or credentials. Candidate SQL still reads the same PostgreSQL database and can be expensive; schedule outside SAP closing/busy windows and check DEV precompute worker is not active.

Run from an authenticated root shell on JAHSVR-SPHERE with existing PROD venv:

~~~bash
set -Eeuo pipefail
export TZ=Asia/Jakarta
REPO=/root/rundeck-sphere-prod
BRANCH=feat/prod-calendar-snapshot-optin-20261106
PY=/opt/sphere-rundeck-prod/venv/bin/python
systemctl is-active --quiet sphere-rundeck-prod-api
if systemctl is-active --quiet sphere-report-precompute-dev.service; then
  echo "BLOCKED: DEV worker active, avoid concurrent heavy DB work"; exit 2
fi
git -C "$REPO" fetch --no-tags origin "$BRANCH"
STAGE=$(mktemp -d /tmp/sphere-prod-parity.XXXXXX)
trap 'rm -rf -- "$STAGE"' EXIT
chmod 0755 "$STAGE"
git -C "$REPO" archive FETCH_HEAD | tar -xf - -C "$STAGE"
test -s "$STAGE/ops/rundeck/compare-prod-calendar-snapshot-read-only.py"
systemd-run --quiet --wait --pipe --collect --uid=sphere --gid=sphere \
  --property="EnvironmentFile=/etc/sphere/rundeck-prod.env" \
  --property="WorkingDirectory=$STAGE" \
  --property="RuntimeMaxSec=360" \
  --setenv="PYTHONPATH=$STAGE" \
  --setenv="PYTHONDONTWRITEBYTECODE=1" \
  --setenv="PGOPTIONS=-c default_transaction_read_only=on" \
  --setenv="SPHERE_REPORT_SNAPSHOT_PROD=false" \
  "$PY" "$STAGE/ops/rundeck/compare-prod-calendar-snapshot-read-only.py" \
  --month=2026-10 --week-start=2026-10-26
~~~

**PASS** requires a complete matching workload population, page contract, core report fields, and stable source collection anchor; any mismatch blocks merge/deployment. A transient DB overload, missing SQL source or changed source anchor makes the run **inconclusive**, not parity PASS. This does not deploy code, create snapshots or enable timer.

## Rollback after a future activation

1. Disable/stop only the PROD snapshot timer. Check whether a PROD worker is still active before stopping it.
2. Restore verified /etc/sphere/rundeck-prod.env backup or disable only SPHERE_REPORT_SNAPSHOT_PROD. Preserve all other settings.
3. Restart sphere-rundeck-prod-api only. Verify 8092 health and current Monthly/Weekly report plus DEV 8091.
4. If the release itself fails, use guarded PROD API rollback to its previously verified release, not a DEV checkout copy.
5. Retain isolated snapshot files for forensics pending approved cleanup.

**Status:** Candidate source only. PROD code and worker have not been deployed or activated. Existing DEV snapshot/worker stays independent. Browser stale export UX and heavy SQL load on the shared database remain release gates.

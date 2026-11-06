# SPHERE DEV — Persistent report snapshot rollout (V1)

## Scope

- DEV code only, branch PR to rundeck-sphere-dev, deployed with existing guarded DEV release.
- Database: sphere_rundeck_dev (read-only queries). No migrations, indices, VACUUM or TimescaleDB changes.
- PROD services, Nginx routing and PROD storage remain unchanged.
- Rolling periods and Custom Report remain on the original SQL path.
- API reads snapshots but has no filesystem write access to their directory; a separate systemd worker writes snapshots.
- Explicit SPHERE_REPORT_SNAPSHOT_DEV=true is **OFF by default**. Do not enable until unit tests, CI and deployment QA pass.

## User-facing behavior

A precomputed Monthly or Weekly full-population report is read from atomic compressed JSON. The regular
endpoint still applies all paging, search, pressure and health filters to the full dataset.
When the latest complete Rundeck collection changes, the API may serve a bounded stale
snapshot with snapshot.status=STALE, snapshot.generated_at, source/current anchors, and
runtime.cache=STALE_SNAPSHOT. The UI explicitly shows "Showing last completed snapshot" and
disables report export. A fresh precomputed snapshot has status FRESH and
runtime.cache=SNAPSHOT. A subsequent in-process request is HIT.

The default stale grace is 3600s. If a missing/corrupt/expired snapshot cannot be used,
the API falls back to the original SQL path (a cold request can still take tens of seconds).
The first startup must warm snapshots before claiming a fast-open user experience.

## Deployment and opt-in (after PR CI passes)

1. Deploy approved commit to DEV with the existing release-dev-fast.sh guards.
2. Confirm split-DISTINCT and PostgreSQL DEV health, and record exact active release SHA.
3. Back up /etc/sphere/rundeck-dev.env outside the repo using cp -a.
4. Append SPHERE_REPORT_SNAPSHOT_DEV=true once to the DEV env file. Keep SPHERE_EVAL_SPLIT_DISTINCT_DEV=true.
   This alone does not change the running API process.
5. Install only the new DEV systemd files:
   - install -m 0644 /opt/sphere-rundeck-dev/current/ops/rundeck/sphere-report-precompute-dev.service /etc/systemd/system/
   - install -m 0644 /opt/sphere-rundeck-dev/current/ops/rundeck/sphere-report-precompute-dev.timer /etc/systemd/system/
   - systemctl daemon-reload
6. Start the worker once to warm two months and three reporting weeks:
   systemctl start sphere-report-precompute-dev.service
   Inspect journalctl -u sphere-report-precompute-dev.service -n 100 --no-pager.
   Confirm FINAL=PASS failures=0.
7. Restart only the DEV API and poll http://127.0.0.1:8091/health for readiness.
8. Verify GET /evaluation/workloads/monthly?month=2026-10&limit=5 returns 2,249 workloads
   with runtime.cache=SNAPSHOT or HIT, full population page.scope=FULL_EVALUATED_POPULATION,
   snapshot.status=FRESH, and source-backed CPU/RAM/error data.
   Verify Week 2026-10-26 returns 919 workloads.
   Check requests with different pagination, search and filters match the existing report contract.
9. Enable only the DEV timer: systemctl enable --now sphere-report-precompute-dev.timer
   Verify systemctl list-timers sphere-report-precompute-dev.timer and subsequent worker logs.
10. Confirm PROD SHA, service status and output are unchanged. Do not enable any PROD timer.

## Rollback

- systemctl disable --now sphere-report-precompute-dev.timer
- Restore backed-up DEV env or remove only SPHERE_REPORT_SNAPSHOT_DEV=true.
- systemctl restart sphere-rundeck-api and poll health.
- Verify runtime.cache is only MISS or HIT; original SQL remains the source of truth.
- Leave on-disk snapshots in place for forensics until an explicitly approved cleanup.
- No database restore required.

## Notes

- Snapshot generation still executes exact SQL and can initially take 38–47+ seconds.
- Precompute covers current/previous month and current/two previous weeks relative to Asia/Jakarta.
  Other months/weeks and Custom Report may still use cold SQL.
- Refresh is timer-based, not a synchronous hook from Rundeck ingestion.
- Snapshot is anchored to latest complete READY collection. Stale data is visibly marked
  and stale exports are disabled.
- API RAM cache and on-disk snapshots are separate. Worker lock prevents concurrent runs.
- Browser target <1 second must be verified on the real host, not inferred from code.

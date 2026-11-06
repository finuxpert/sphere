# SPHERE DEV — Persistent report snapshot V1: rollout and verified operations

**Operational checkpoint updated:** 6 November 2026 (WIB). Source PR #98 merged; on-host DEV release verified at SHA 8c75ec7b8abd986d8c18842ddeac881cba1e2626. A later source HEAD may differ from this observed deployed SHA.

## Scope

- DEV code only, branch PR to rundeck-sphere-dev, deployed with existing guarded DEV release.
- Database: sphere_rundeck_dev (read-only queries). No migrations, indices, VACUUM or TimescaleDB changes.
- PROD services, Nginx routing and PROD storage remain unchanged.
- Rolling periods and Custom Report remain on the original SQL path.
- API reads snapshots but has no filesystem write access to their directory; a separate systemd worker writes snapshots.
- Snapshot feature flag defaults **OFF in code**; on JAHSVR-SPHERE DEV the operator enabled SPHERE_REPORT_SNAPSHOT_DEV=true after passing deployment and QA. SPHERE_EVAL_SPLIT_DISTINCT_DEV=true was preserved. Both flags are DEV-only.

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

## Deployment and opt-in (historical procedure, performed 6 November 2026)

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
- **API** sub-second performance has been verified on the actual DEV host; **browser render** performance and stale-to-fresh transition are still unverified.


## Live DEV checkpoint — observed 6 November 2026 (WIB)

The following are actual operator-supplied server measurements, **not** performance predictions:

| Evidence | Observed result |
|---|---|
| Guarded DEV release | FINAL=PASS DEV_SHA=8c75ec7b; DB_MIGRATION=SKIPPED; release guard recorded PROD unchanged |
| Unit tests | 16 tests, 0.024s, OK (with working directory and PYTHONPATH corrected) |
| First precompute | FINAL=PASS failures=0 db_writes=NONE; 3m35.099s wall clock; peak memory 116.2M |
| Snapshot files | Five gzip JSON reports, 892K total; one previous/current month and three recent weeks |
| Monthly 2026-10 | 2,249 workloads; HTTP 200, **0.131767s**; runtime 110.1ms; CACHE=SNAPSHOT, status=FRESH |
| Weekly 2026-10-26 | 919 workloads; HTTP 200, **0.052058s**; runtime 36.8ms; CACHE=SNAPSHOT, status=FRESH |
| Worker on timer enable (14:19:37) | Five SKIP_FRESH results, FINAL=PASS; **921ms** wall clock; memory peak 71.4M |
| API health check 14:22:39 | HTTP 200, 0.263309s |
| Timer status 14:22–14:24 | Active/enabled, next scheduled at **14:29:39 WIB** |

### First precompute scope

| Scope | Workloads | Report computation | Snapshot |
|---|---:|---:|---|
| Monthly 2026-11 | Not provided in shared worker log | Not provided | month-2026-11-split_distinct-v1.json.gz |
| Monthly 2026-10 | 2,249 | 61.27s | month-2026-10-split_distinct-v1.json.gz |
| Weekly 2026-11-02 | 829 | 39.52s | week-2026-11-02-split_distinct-v1.json.gz |
| Weekly 2026-10-26 | 919 | 33.92s | week-2026-10-26-split_distinct-v1.json.gz |
| Weekly 2026-10-19 | 882 | 30.46s | week-2026-10-19-split_distinct-v1.json.gz |

API cache performance is not a benchmark of browser rendering or faster SQL itself. The precompute SQL still takes tens of seconds when a new READY collection invalidates the snapshot. Stored files are written to disk; worker status db_writes=NONE means no database writes, **not** no filesystem writes.

**Verification limits:** the last supplied live journal-follow output contains only the 14:19:37–14:19:38 worker cycle. No log of the **14:29:39** scheduled execution was supplied, so the subsequent scheduled cycle is **pending verification**. There is also no completed real-data STALE → FRESH transition test or browser first-paint test yet. Do not mark these PASS.

### Operator monitoring — read-only commands

Run from a root shell on JAHSVR-SPHERE. The completed oneshot worker normally shows inactive (dead) with Result=success.

~~~bash
export TZ=Asia/Jakarta
systemctl is-active sphere-report-precompute-dev.timer
systemctl list-timers --all sphere-report-precompute-dev.timer --no-pager
systemctl show sphere-report-precompute-dev.service -p ActiveState -p SubState -p Result
journalctl -u sphere-report-precompute-dev.service -n 30 -o short-iso --no-pager
curl --noproxy '*' -fsS --max-time 8 -o /dev/null \
  -w 'DEV_API_HTTP=%{http_code} TOTAL=%{time_total}s\n' \
  http://127.0.0.1:8091/health
~~~

For real-time log following, run:

~~~bash
journalctl -fu sphere-report-precompute-dev.service -o short-iso --no-pager
~~~

This command **intentionally stays running** to await additional log lines. Use Ctrl+C to exit the log viewer; it does not stop the worker or timer. An idle journal follower is not evidence of a hung report worker.

The timer is configured with OnBootSec=3min and OnUnitInactiveSec=10min, so it schedules work **after the last worker becomes inactive**, not at fixed wall-clock 00/10/20 minutes. A successful SKIP_FRESH when the READY anchor is unchanged is desirable and fast.

### Timestamped synchronous logging

Avoid asynchronous process substitution for logging because it can print after the shell prompt. The following writes timestamped records and ends cleanly. A placeholder such as /root/nama-script.sh is **not** a real script and must not be executed.

~~~bash
set -o pipefail
export TZ=Asia/Jakarta
LOG="/root/sphere-snapshot-check-$(date +%Y%m%d_%H%M%S)-WIB.log"
{
  systemctl list-timers --all sphere-report-precompute-dev.timer --no-pager
  systemctl show sphere-report-precompute-dev.service -p ActiveState -p Result
  journalctl -u sphere-report-precompute-dev.service -n 20 -o short-iso --no-pager
} 2>&1 | awk '{print strftime("[%Y-%m-%d %H:%M:%S WIB]"), $0; fflush()}' | tee "$LOG"
echo "LOG=$LOG"
~~~

### Python import issue encountered during first activation

Executing tests from /root failed with ModuleNotFoundError: No module named 'backend'. The correction was to run from the active application root:

~~~bash
cd /opt/sphere-rundeck-dev/current
PYTHONPATH="$PWD" /opt/sphere-rundeck-dev/venv/bin/python -m unittest -q \
  backend.tests.test_report_snapshot_dev \
  backend.tests.test_report_split_distinct_runtime_dev
~~~

This passed 16 tests, and the corrected activation completed. Do not interpret this former working-directory issue as a PostgreSQL failure.

### Safety and remaining acceptance

- API reads snapshots but worker alone writes the atomic gzip files to /var/lib/sphere/report-snapshots-dev; worker uses PostgreSQL read-only default transactions.
- Missing, corrupt, mismatched or expired snapshots fall back to original SQL. Default stale grace is 3600 seconds with visible STALE metadata and management export disabled while stale.
- Rollback: disable the DEV timer, restore a verified backup of /etc/sphere/rundeck-dev.env (or disable only SPHERE_REPORT_SNAPSHOT_DEV), restart only sphere-rundeck-api, and recheck health. Do not print credentials or delete snapshots without separate approval.
- [x] PR #98 merged, DEV release verified, worker initial computation PASS.
- [x] Five snapshots created and fresh Monthly/Weekly API response verified.
- [x] Timer enabled; immediate timer-triggered SKIP_FRESH cycle completed.
- [ ] Verify scheduled cycle at/after the previously reported 14:29:39 WIB deadline.
- [ ] Validate real READY collection transition from stale to fresh without fabricating source records.
- [ ] Browser render and report export parity on real current data.
- [ ] Measure PostgreSQL/disk load when a fresh collection triggers rebuilding a heavy report.

Production remains a separate explicit promotion. **This documentation update alone is not a runtime release or authorization to promote PROD.**

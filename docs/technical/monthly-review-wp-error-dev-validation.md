# Monthly Review V2.2 — WP error evidence DEV validation

## Scope and source of truth

The Monthly Review reads saved SPHERE/Rundeck collections only. No ST22/SM37 import,
no live SAP query, and no invented event timestamps. An APP/PID/trace code seen in
a collector snapshot is not automatically a failed SAP job. `AT_SNAPSHOT`,
`HISTORICAL`, and unknown/untimed signals remain distinct.

Fixes in `rundeck-sphere-dev`:

- Retain JOB and PROGRAM workload observations as before, plus error-bearing
  PROCESS observations tagged `WP_ERROR_ONLY`. These PROCESS rows are excluded
  from ABAP tuning candidates by existing JOB/PROGRAM evaluation predicates.
- Store per-WP CPU/PSS, PID, work process number/type, job context, explicit error
  program, code, recency, event time, and log path in `details.wp_signals`.
- The read-only monthly API groups source-backed WP evidence and separately
  exposes identified programs, unique dated events, snapshot observations, and
  RABAX/RXMSG diagnostic checks. Do not equate these counts.
- Monthly Review UI and PDF expose source provenance and any *same-month* matching
  tuning workload as context only, never root-cause attribution.
- Missing source fields remain **unavailable**, never converted to zero.

## Gate 1 — sync and guarded QA/release (operator on JAHSVR-SPHERE)

From the isolated DEV checkout, with a clean working tree and the correct
database environment:

```bash
cd /root/rundeck-sphere-dev
SPHERE_DEV_MIGRATION_DECISION=skip bash ops/rundeck/release-dev-fast.sh
```

Require `SOURCE=PASS`, `QA=PASS`, `BUILD=PASS`,
`BACKEND_TESTS=PASS`, `DEPLOY=PASS` and `FINAL=PASS` before proceeding.
No migration file was added by this change. Production must remain unchanged.
Inspect `/tmp/sphere-dev-release-last.log` on failure.

## Gate 2 — validate retained raw data before a historical backfill

In the same DEV checkout, with `SPHERE_INGESTION_ROOT` referencing the
**DEV** archive (not the PROD archive):

```bash
python -m backend.backfill_monthly_wp_errors --month 2026-09
python -m backend.backfill_monthly_wp_errors --month 2026-10
```

Dry runs verify stored archive checksums and report recoverable observations,
including `error_only_process_rows`. They do not write to the DB. A missing
raw archive cannot be reconstructed from screenshots.

The September 2026 dry run recovered 2,976 archives and identified 28,572
`WP_ERROR_ONLY` PROCESS rows. October recovered 3,737 archives and identified
51,707 such rows. These are diagnostic observations, **not** confirmed SAP
error events or ST22 dump totals. Skipped archives (11 September; 26 October)
remain excluded; do not fabricate their missing data.

**Use the guarded DEV-only runner after releasing the updated source.** It checks
the active DEV release SHA against the DEV checkout, exact local DEV PostgreSQL
role/database/socket, and runs under the `sphere` OS user for peer authentication.
Run the first small September batch in dry-run mode:

```bash
cd /root/rundeck-sphere-dev
bash ops/rundeck/backfill-monthly-wp-errors-dev.sh 2026-09 0 25 dry-run
```

If reviewed, execute that same closed-month batch explicitly:

```bash
bash ops/rundeck/backfill-monthly-wp-errors-dev.sh 2026-09 0 25 apply
```

Check `upserted_rows`, `error_only_process_rows`, `next_offset` and the
read-only Monthly Review API before continuing. The batch API accepts
`OFFSET` and `SIZE` (maximum 500 manifests per batch) for resumable
idempotent runs, but do not run concurrent writers. After the first batch,
larger subsequent batches require performance review of PostgreSQL/DEV API.

The runner intentionally blocks writing an *ongoing* current month: the eligible
manifest sequence is still changing. Use September first; October can be
backfilled as a closed month later. Python also refuses an unverified
database target and only upserts month-scoped records, including the existing
JOB/PROGRAM observations and error-bearing PROCESS rows.

Historical reprocessing can invalidate the cached monthly report. Restart
**only the DEV API** using the approved operations procedure after the agreed
batch group is complete; do not restart PROD services.

The monthly error reader processes separate three-day windows rather than
silently selecting the first 15,000 rows of a month. It still flags
`TRUNCATED` if a window exceeds its bounded limit or the full month exceeds
100,000 source groups; partial totals must not be presented as complete.

## Gate 3 — API and UI evidence validation

```bash
curl -fsS 'https://sphere.astraotoparts.co.id/dev/api/evaluation/workloads/monthly?month=2026-09&type=ALL&limit=1' |
python -c 'import sys,json; d=json.load(sys.stdin); e=d["monthly_errors"]; print({k:e.get(k) for k in ("status","error_fields_retained","timestamped_events","snapshot_host_checks","error_code_count","error_program_count","rabax_wp_checks","truncated")})'
```

Check September and October separately. A screenshot from 25 Oct 2026 is not
a September event. If `ERROR_SOURCE_NOT_RETAINED` remains after backfill,
verify the raw archive and persisted `wp_signals`; do not force a success KPI.

Acceptance criteria:

1. A PROCESS-only WP with a real code appears in retained monthly error
   evidence, even if it is not a Top Consumer; it does not become a tuning
   candidate.
2. Dated events require an explicit timezone-aware event timestamp in the
   month. Repeated snapshots of one APP/PID/code/event time count once.
3. Job context and explicit error-program identity are not conflated.
4. PDF and UI agree on month, code and identified-program counts.
5. No regression in 1d/7d/30d evaluation or PROD.

Relevant backend tests are run by `release-dev-fast.sh` through
`backend.tests.test_rundeck_monthly_review`; the existing
`scripts/tests/rundeck-monthly-review-v2.test.mjs` runs in npm QA.

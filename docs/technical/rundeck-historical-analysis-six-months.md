# SPHERE DEV: Historical Analysis (1D–6M)

## Scope and semantics

Historical Performance Trends support 1D (rolling 24h), 7D, 30D, Last Month
(the **previous full WIB calendar month**), 3M (rolling 90 days) and 6M
(rolling 180 days). Short investigation ranges 30m, 1h, 3h and 6h remain
available under **Short**. The existing Custom range still supports **1 minute
to 24 hours** and does not attempt unbounded raw historical queries.

- 24H: automatic 30-minute buckets.
- 7D: automatic hourly buckets.
- 30D: automatic 6-hour buckets.
- Last Month, 3M, 6M: enforced 1-day buckets aligned to 00:00 WIB; Avg/Peak
  remain separate and peak timestamps/collection IDs are preserved.
- No synthetic points or backfilled zeros. Missing dates are **unknown**.
- Job & Program **evaluation reports** stay 1D / 7D / 30D. Do not stretch
  the expensive baseline evaluation algorithm to 180 days.
- Service availability status histories (SAP APP/HANA/replication/SSH/Web) are
  **not** yet daily-aggregated for these new long-range presets. SPHERE
  explicitly labels them unsupported and retains the existing 30D limit
  rather than downloading ~180 days of raw JSONL to the browser.
- Network RX/TX long-range views use the existing saved Infrastructure
  observations and show per-APP single-interface rates, not NIC sums.

## Retention is a separate operational gate

`backend/rundeck_monitoring.py` currently defaults to
`SPHERE_RETENTION_DAYS=90` and the automatic maintenance task permanently
removes expired raw evidence files and normalized DB history. **Adding 6M
UI/API support does not change existing database retention or restore
records already deleted.**

Before approving retention changes, on **DEV only**:

1. Capture backup/restore point for the DEV PostgreSQL DB and raw evidence
   directory. Verify that backups are recoverable.
2. Review filesystem capacity and 30–90-day daily data growth (DB, raw,
   Infrastructure, availability JSONL). Estimate required space for at
   least **210 days**, allowing six calendar months plus a safety margin.
3. Verify the current value of `SPHERE_RETENTION_DAYS` in the **DEV**
   service's environment. Do not display other secrets from the env file.
4. Only after capacity review, set `SPHERE_RETENTION_DAYS=210` in the
   DEV service configuration, using the existing operator runbook and
   approved service restart/deployment procedure. Confirm via the new
   `/dev/api/history/trend?range=180d&bucket=auto&metric=cpu`
   response: `configured_retention_days` should match 210.
5. Monitor free disk space, table/index bloat, query latency, backup size,
   maintenance results and oldest stored sample. Keep PROD retention
   unchanged until a separate capacity/change review.

**Warning:** the actual available history may still be shorter than
retention (for example, after a past purge or collector outage).
`configured_retention_days` describes *policy*, not observed coverage.
The front end displays the earliest actual bucket in the selected range.
Do not report missing buckets as SAP downtime.

Read-only database checks (against the configured DEV database):

```sql
SELECT MIN(collected_at) AS first_host_sample,
       MAX(collected_at) AS last_host_sample,
       COUNT(*) AS host_samples
FROM rundeck_host_metrics;

SELECT pg_size_pretty(pg_total_relation_size('rundeck_host_metrics'))
       AS host_metric_table_total_size;
```

## Regression and deployment

From the DEV checkout:

```bash
python3 -m unittest backend.tests.test_rundeck_history_six_months
node --test scripts/tests/rundeck-history-six-months.test.mjs
```

This release changes backend/API behavior. **Do not** use a frontend-only
shortcut in place of the guarded backend-aware DEV release path. After
reviewing the backend diff and confirming no DB migration is required,
follow `docs/operations/rundeck-development.md`: guarded DEV QA, deployment and
rollback verification. PROD remains untouched.

Suggested smoke tests:

```bash
curl -fsS 'https://sphere.astraotoparts.co.id/dev/api/history/trend?range=last_month&bucket=auto&metric=cpu'
curl -fsS 'https://sphere.astraotoparts.co.id/dev/api/history/trend?range=90d&bucket=auto&metric=ram'
curl -fsS 'https://sphere.astraotoparts.co.id/dev/api/history/trend?range=180d&bucket=auto&metric=network_rx'
```

Verify each payload returns bounded daily buckets, the proper WIB window,
provenance, and an honest blank state when no saved samples exist.

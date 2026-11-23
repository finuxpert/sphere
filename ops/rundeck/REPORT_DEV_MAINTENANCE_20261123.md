# SPHERE DEV — Weekly reporting maintenance and performance checkpoint

**Date:** 23 November 2026 (WIB)  
**Target:** DEV application/API only. PROD (port 8092, Nginx `/api/`, deployment and runtime configuration) must remain unchanged.

## Source-verified report

Report period: **16–22 November 2026 (WIB)**.

| Check | Observed result |
|---|---|
| Direct DEV `/evaluation/workloads/monthly` | HTTP 200, 0.06s, `HIT`, 1,078 workloads, snapshot `FRESH` |
| Direct DEV `/evaluation/workloads/monthly/hosts` | HTTP 200, 0.44s, `preview_only=true` |
| Direct DEV `/infra/monthly-storage` | HTTP 200, 1.32s, 211,259 source rows, 4/4 mapped categories collected |
| DEV reverse proxy host preview | HTTP 200, 2.29s |
| DEV reverse proxy weekly evaluation | HTTP 200, 0.21s |
| DEV reverse proxy storage | HTTP 200, 0.75s |
| Saved PDF storage `/INTF` APP1 | 86% used; 125.5 GB explicit available, 22 Nov 23:58 WIB |

These are **single operator-supplied checks**, not SLA guarantees. Earlier 504s were observed in PROD and DEV logs; this checkpoint does not prove the issue can never recur.

## Change in this DEV-only patch

- Exported weekly PDF chart labels show compact WIB calendar dates instead of a repeating `00:00` on every daily tick. Time is still displayed on short, <=48h ranges.
- The one-page PDF identifies the **highest collected in-period storage utilization**, including source mount and APP host. This is an observation, **not** a newly defined alert threshold.
- Source data, historical scope checks, workload rankings, CPU/PSS units, 16:9/A3 geometry, and export data contracts remain unchanged.
- Added regression assertions for seven WIB dates and the highest storage utilization.

## Non-destructive operator checks

Run from `JAHSVR-SPHERE` as an authorized operator. These commands do not restart services or write to PostgreSQL.

```bash
BASE=https://sphere.astraotoparts.co.id
Q='month=2026-11&week_start=2026-11-16'
for EP in "evaluation/workloads/monthly/hosts?$Q" \
          "evaluation/workloads/monthly?$Q&type=ALL&limit=1" \
          "infra/monthly-storage?$Q"; do
  curl --resolve sphere.astraotoparts.co.id:443:127.0.0.1 \
    -sS --max-time 15 -o /dev/null \
    -w "DEV_EP=$EP HTTP=%{http_code} SECONDS=%{time_total}\n" \
    "$BASE/dev/api/$EP"
done
systemctl is-active sphere-rundeck-api sphere-report-precompute-dev.timer
journalctl -u sphere-report-precompute-dev.service -n 30 --no-pager
```

If a weekly report is `HIT`/`SNAPSHOT` and `FRESH` but the browser is still blank, inspect browser Network and Console on **`/dev/`**, not the production root page. Identify failing requests and active frontend release SHA before attempting a new deploy. **Do not** increase Nginx timeouts to conceal slow SQL.

## Performance remediation plan (separate from PDF-only change)

1. Keep the weekly snapshot precompute timer healthy, and check `FRESH` versus `STALE` explicitly.
2. Capture slow PostgreSQL statements and `SPHERE_EVAL_SLOW_STAGE` from **DEV**, with `pg_stat_activity` and bounded `EXPLAIN` in a read-only transaction.
3. Prioritize rolling 1d historical baseline and concurrent `top_consumers` pressure aggregations. Previously observed `historical_baseline` ~31.2s; one active aggregate exceeded 148s. Those do **not** represent weekly snapshot latency.
4. Test plan/pruning improvements on a separate DEV-only branch with real-data parity, full-period QA, and rollback. Index/schema changes require a separately approved maintenance plan; no blind index creation.
5. Deploy through the guarded DEV release flow only after tests and compare the active DEV SHA. PROD promotion needs separate approval.

## QA gates before DEV deployment

```bash
node --test scripts/tests/rundeck-monthly-enterprise-export.test.mjs
node scripts/qa-monthly-pdf.mjs
npm run qa:integrity
npm run build:dev
```

Re-export the 16–22 November PDF from DEV and visually verify seven non-overlapping date labels, Top 5 CPU and PSS rankings, 1,078-workload source scope, and `Highest use: /INTF · APP1 86%`. Check 16:9 and A3 separately. Do not consider the **attached earlier PDF** to be a newly rendered artifact from this patch.

## Rollback

Because this patch changes only frontend export code and tests/docs, restore the previously approved DEV UI release using the existing guarded release/rollback procedure if PDF QA fails. Do not touch PROD, database, Nginx, timer configuration or snapshots for this patch.

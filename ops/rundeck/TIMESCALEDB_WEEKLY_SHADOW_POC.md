# SPHERE DEV — seven-day TimescaleDB vs PostgreSQL shadow-table POC

This is an **isolated benchmark**, not a migration or deploy. Intended only for
`sphere_rundeck_dev` on JAHSVR-SPHERE after TimescaleDB 2.25.1 is enabled.

The user-supplied read-only source profile for 26 October–1 November 2026 WIB:

| Day WIB | Workload observations |
|---|---:|
| 2026-10-26 | 25,765 |
| 2026-10-27 | 28,626 |
| 2026-10-28 | 30,482 |
| 2026-10-29 | 28,651 |
| 2026-10-30 | 28,158 |
| 2026-10-31 | 25,315 |
| 2026-11-01 | 28,097 |
| **Total** | **195,094** |

Available DB filesystem space at the checkpoint: **15 GiB** (48G total / 31G
used). The POC refuses to create tables with less than **8 GiB** free and
aborts a transaction if free space falls below **6 GiB**. Do not rely on
reactive filesystem expansion to rescue PostgreSQL from an ENOSPC error.

## Scope and caveats

- Runs only via local PostgreSQL peer authentication as OS user `postgres`,
  and refuses any DB other than `sphere_rundeck_dev`.
- Fixed schemas: `sphere_ts_poc_pg` and `sphere_ts_poc_ts`.
- Each schema has a **separate copy** of
  `rundeck_workload_observations`, limited to 2026-10-26 00:00 WIB up to
  2026-11-02 00:00 WIB (exclusive). Hard cap: 250,000 copied rows per table.
- The PostgreSQL comparison table and Timescale hypertable use the same
  columns/PK/secondary indexes copied with `LIKE INCLUDING ALL`; hypertable
  partitioned only on `collected_at`, **1 day** chunks.
- `LIKE` does not copy original **foreign keys or triggers**. This benchmark
  tests SQL result and time partitioning; it does **not** establish that a
  production FK/retention policy migration will be safe.
- An empty POC table is converted to a hypertable before any data is inserted.
  No `migrate_data`, no DDL on original tables and no data-policy changes.
- The comparator from draft PR #94 provides the exact baseline and
  split-DISTINCT report SQL. We change *only* references to
  `rundeck_workload_observations` within the captured SQL to point at the
  POC source; original collection/host-metric/top-consumer joins are retained.
- Report field parity is checked for every returned workload/column. EXPLAIN
  ANALYZE BUFFERS benchmarks both ordinary PostgreSQL and Timescale sources,
  with reverse-order rerun to expose cache bias. A one-day subwindow probes
  chunk pruning. This is **not** a full monthly benchmark.
- No SPHERE DEV/PROD API deploy, service restart, poller restart or modification
  of live monitoring tables.

This branch is deliberately based on `perf/dev-report-split-distinct-20261105`
(PR #94). It is a stacked experimental PR, not a merged runtime feature.

## 1. Prepare an isolated source snapshot (no checkout mutation)

Run these from the root shell on JAHSVR-SPHERE. The developer checkout branch
and currently deployed API are not modified.

```bash
set -euo pipefail
git -C /root/rundeck-sphere-dev fetch --no-tags origin \
  perf/dev-timescale-weekly-shadow-poc-20261106
SHA="$(git -C /root/rundeck-sphere-dev rev-parse FETCH_HEAD)"
echo "POC_SOURCE_SHA=$SHA"
SNAP="/opt/sphere-timescale-poc/${SHA:0:12}"
install -d -o root -g postgres -m 0750 /opt/sphere-timescale-poc
test ! -e "$SNAP" || { echo "POC snapshot exists; stop to avoid overwrite"; exit 2; }
install -d -o root -g postgres -m 0750 "$SNAP"
git -C /root/rundeck-sphere-dev archive FETCH_HEAD | tar -xf - -C "$SNAP"
chown -R root:postgres "$SNAP"
chmod -R g+rX "$SNAP"
echo "SNAP=$SNAP"
```

Export the path for the next commands in the same shell session:

```bash
POC_SCRIPT="$SNAP/ops/rundeck/compare-timescaledb-shadow-dev.py"
poc() {
  runuser -u postgres -- env PYTHONPATH="$SNAP" \
    /opt/sphere-rundeck-dev/venv/bin/python "$POC_SCRIPT" "$@"
}
```

## 2. Preflight (read-only)

```bash
poc --mode inspect
```

Confirm DB `sphere_rundeck_dev`, TimescaleDB available, no POC schemas
already present, the measured weekly count at or below 250,000, and
`disk_free_gib >= 8`.

## 3. Create both tables and validate identical raw data

**This stage writes exclusively to the two newly created POC schemas.**
The entire creation/copy, EXCEPT ALL data comparison and ANALYZE run in a
single transaction that rolls back if a gate fails.

```bash
poc --mode create --confirm-dev
```

Only proceed when output contains `final=PASS`, `copy_parity=PASS`.
Data ingestion from Rundeck continues against the original tables.

## 4. Exact report SQL parity & paired plan benchmarks

Commands below are read-only. They compare all returned fields for the four
variants: baseline/Timescale, baseline/PostgreSQL, split-DISTINCT/Timescale,
and split-DISTINCT/PostgreSQL.

```bash
poc --mode bench --scope week
poc --mode bench --scope week --reverse
poc --mode bench --scope day
poc --mode bench --scope day --reverse
```

Review `execution_ms`, `shared_read`, `temp_read`, `temp_written`,
and `all_field_parity`. Require repeated, material improvement before
considering changes to live-table architecture. If Timescale is slower
or the data disagrees, stop and preserve existing live PostgreSQL tables.

## 5. Optional cleanup after gathering evidence

No automatic cleanup runs during `create`/`bench`. To reclaim POC
storage after saving logs:

```bash
poc --mode cleanup --confirm-dev --confirm-drop
```

Cleanup only drops the fixed POC table and schema names, with
`RESTRICT` and without `CASCADE`. It does not touch original tables.

Upstream: https://www.tigerdata.com/docs/reference/timescaledb/hypertables/create_hypertable

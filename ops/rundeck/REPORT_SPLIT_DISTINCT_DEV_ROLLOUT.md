# SPHERE DEV — Split DISTINCT calendar-report rollout gates (2026-11-06)

This is the DEV-only feature rollout for SQL experiment PR #94. There is
**no Timescale hypertable migration**. Runtime defaults to baseline SQL
regardless of whether the code has been deployed.

## Proven benchmark context

- PostgreSQL 18.6 with TimescaleDB extension 2.25.1 active in DEV.
- TimescaleDB seven-day shadow POC completed and cleaned up, zero
  hypertables. SQL baseline/split produced identical results for all
  919 weekly workloads, with ~44% faster split aggregation on plain PG.
- PR #94 previously ran isolated PostgreSQL all-field parity and
  full-month DEV comparator parity (October 2026).
- Real API end-to-end performance includes previous aggregate, historical
  baseline, monthly pressure and other stages: a faster current aggregate
  alone does not guarantee the same percentage reduction in HTTP latency.

## Feature flag

`SPHERE_EVAL_SPLIT_DISTINCT_DEV=true` enables the split implementation for
calendar `month`, `week` and `custom` current + previous aggregate only.
It is allowed **only** when `DB_MODE=db|hybrid` and
the configured `DATABASE_URL` names **sphere_rundeck_dev**.

- Flag absent/false/1/off: baseline unchanged.
- Other databases, including database `sphere`: baseline unchanged.
- Rolling `1d`, `7d`, `30d`: baseline unchanged.
- Cache keys for calendar split and baseline do not collide. The current
  evaluation process lock and page/data contract remain unchanged.
- When activated for an uncached calendar evaluation, the API logs
  `SPHERE_EVAL_AGGREGATE_STRATEGY ... strategy=SPLIT_DISTINCT_DEV`.

## Mandatory pre-deploy gates

1. GitHub Actions: PostgreSQL parity and DEV maintenance QA both PASS.
2. Re-run **actual October 2026 full-month** read-only parity and EXPLAIN
   ANALYZE in normal/reverse order using the exact branch revision.
3. Confirm all-field parity for monthly/current and weekly/current and
   sampled **previous** stages, and no statement timeouts or error paths.
4. Make a DEV release using the existing `release-dev-fast.sh` only after
   the stacked PR has been merged into #94 and #94 has passed review and
   been merged into `rundeck-sphere-dev`. Never deploy a branch ref by
   bypassing existing QA/deploy guards.
5. Initially leave the flag absent/false. Verify DEV health and baseline
   evaluation before activation.

### Real-data SQL parity from a frozen Git snapshot

Run from a root shell on JAHSVR-SPHERE after the desired PR revision passes
CI. Does **not** check out or alter `/root/rundeck-sphere-dev`.

```bash
set -euo pipefail
BRANCH=perf/dev-report-split-distinct-runtime-20261106
git -C /root/rundeck-sphere-dev fetch --no-tags origin "$BRANCH"
SHA="$(git -C /root/rundeck-sphere-dev rev-parse FETCH_HEAD)"
SNAP="/opt/sphere-report-split-test/${SHA:0:12}"
install -d -o root -g sphere -m 0750 /opt/sphere-report-split-test
test ! -e "$SNAP"
install -d -o root -g sphere -m 0750 "$SNAP"
git -C /root/rundeck-sphere-dev archive FETCH_HEAD | tar -xf - -C "$SNAP"
chown -R root:sphere "$SNAP"
chmod -R g+rX "$SNAP"

compare() {
  systemd-run --quiet --wait --pipe --collect --uid=sphere --gid=sphere \
    --property="EnvironmentFile=/etc/sphere/rundeck-dev.env" \
    --property="WorkingDirectory=$SNAP" \
    --setenv="PYTHONPATH=$SNAP" \
    /opt/sphere-rundeck-dev/venv/bin/python \
    "$SNAP/ops/rundeck/compare-report-split-distinct-dev.py" "$@"
}

compare month 2026-10 --mode parity
compare month 2026-10 --stage previous --mode parity
compare week 2026-10-26 --mode parity
compare week 2026-10-26 --stage previous --mode parity
compare month 2026-10 --mode analyze
compare month 2026-10 --mode analyze --reverse
compare week 2026-10-26 --mode analyze
compare week 2026-10-26 --mode analyze --reverse
```

The comparator verifies DB name, DB_MODE and executes within a PostgreSQL
`REPEATABLE READ READ ONLY` transaction with bounded lock and statement
timeouts. Captured timings are cache-sensitive. **Do not enable** the
feature if parity differs or performance regresses materially.

### DEV activation after approved deployed release

From root on JAHSVR-SPHERE, only after verifying that the active DEV release
contains the feature and monthly parity has passed:

```bash
set -euo pipefail
ACTIVE="$(readlink -f /opt/sphere-rundeck-dev/current)"
grep -Fq 'def _dev_split_distinct_enabled(' "$ACTIVE/backend/rundeck_evaluation.py"
systemctl is-active --quiet sphere-rundeck-api
ENV=/etc/sphere/rundeck-dev.env
test -s "$ENV"
test "$(stat -c '%a' "$ENV")" != 777
BACKUP="/root/sphere-report-split-dev-env.$(date -u +%Y%m%dT%H%M%SZ)"
cp -a "$ENV" "$BACKUP"
if grep -q '^SPHERE_EVAL_SPLIT_DISTINCT_DEV=' "$ENV"; then
  echo 'Existing feature entry; inspect before changing to avoid duplicate values'
  exit 2
fi
printf '\nSPHERE_EVAL_SPLIT_DISTINCT_DEV=true\n' >> "$ENV"
systemctl restart sphere-rundeck-api
systemctl is-active --quiet sphere-rundeck-api
curl --noproxy '*' -fsS --max-time 15 http://127.0.0.1:8091/health >/dev/null
echo "DEV_FLAG=ON BACKUP=$BACKUP"
```

Check an uncached Monthly/Weekly request (HTTP endpoints must use the
existing authenticated route contracts), and inspect the structured
`current_aggregate`/`previous_aggregate` timing logs. For example:

```bash
journalctl -u sphere-rundeck-api --since '10 minutes ago' \
  --no-pager | grep 'SPHERE_EVAL_AGGREGATE_STRATEGY'
```

### Immediate rollback of flag without code rollback

```bash
set -euo pipefail
ENV=/etc/sphere/rundeck-dev.env
test -f "$ENV"
sed -i '/^SPHERE_EVAL_SPLIT_DISTINCT_DEV=/d' "$ENV"
systemctl restart sphere-rundeck-api
systemctl is-active --quiet sphere-rundeck-api
curl --noproxy '*' -fsS --max-time 15 http://127.0.0.1:8091/health >/dev/null
echo 'DEV_FLAG=OFF BASELINE_SQL=RESTORED'
```

No Alembic migration, no schema/index changes, no PostgreSQL restart, no
poller restart, and no PROD changes are required for this feature flag.

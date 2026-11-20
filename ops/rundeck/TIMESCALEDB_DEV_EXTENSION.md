# SPHERE DEV — TimescaleDB extension-only rollout (no hypertable conversion)

TimescaleDB is already optional in the legacy Alembic migration
`20260910_0002`. That migration tries `CREATE EXTENSION` plus
`create_hypertable(..., migrate_data => TRUE)` inside a SAVEPOINT.
**Do NOT replay/execute that migration** on the live historical tables.

This runbook enables *only* the extension in `sphere_rundeck_dev`.
It never changes collectors, production, service definitions, indexes, tables,
or the running SPHERE DEV API. Installing the package/preload is a separate
operator-managed maintenance operation.

## Phase A — inspect the exact PostgreSQL cluster (no writes)

Use root only to view the local PostgreSQL cluster inventory. The actual
diagnostic executes with PostgreSQL peer authentication as OS user `sphere`.

```bash
cat /etc/os-release | grep -E '^(NAME|VERSION|VERSION_CODENAME)='
pg_lsclusters
# List all databases in the same cluster before ANY PostgreSQL restart.
runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d sphere_rundeck_dev -Atc \
  "SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate ORDER BY 1"
runuser -u sphere -- psql -X -v ON_ERROR_STOP=1 -d sphere_rundeck_dev -Atc \
  "SELECT current_database(), current_user, current_setting('server_version'), current_setting('shared_preload_libraries')"
```

Place the controller in a root-owned, world-readable directory outside
`/root` and outside the DEV runtime, e.g.:

```bash
install -d -m 0755 -o root -g root /opt/sphere-timescale-preflight
git -C /root/rundeck-sphere-dev fetch --no-tags origin \
  infra/dev-timescaledb-extension-preflight-20261106
git -C /root/rundeck-sphere-dev show \
  FETCH_HEAD:ops/rundeck/timescaledb-dev-control.py \
  > /opt/sphere-timescale-preflight/timescaledb-dev-control.py
chmod 0644 /opt/sphere-timescale-preflight/timescaledb-dev-control.py
runuser -u sphere -- /opt/sphere-rundeck-dev/venv/bin/python \
  /opt/sphere-timescale-preflight/timescaledb-dev-control.py
```

If the `sphere` role receives `InsufficientPrivilege` when reading PostgreSQL
catalog/settings, do not grant it additional privileges just for diagnostics.
Instead, inspect as the existing local `postgres` admin in **read-only mode**:

```bash
runuser -u postgres -- /opt/sphere-rundeck-dev/venv/bin/python \
  /opt/sphere-timescale-preflight/timescaledb-dev-control.py --inspect-as-postgres
```

This is **not** `--apply` and cannot create an extension. The controller
sets `REPEATABLE READ, READ ONLY` even for the privileged inspection.

Look for `extension_status`:

- `ENABLED`: extension already exists. Do not reinstall or re-enable.
- `READY_FOR_EXTENSION_CREATION`: compatible server-side extension package
  appears installed and `timescaledb` is in `shared_preload_libraries`.
  Proceed to Phase C.
- `PACKAGE_NOT_AVAILABLE`: determine the correct package for the *running*
  PostgreSQL major; do not install a different PostgreSQL server.
- `NEEDS_POSTGRESQL_PRELOAD_AND_CONTROLLED_RESTART`: stop; a PostgreSQL
  restart can interrupt every database in the same cluster, even if only DEV
  needs the extension. Schedule it separately and confirm PROD does not share
  that cluster before changing configuration.

## Phase B — package/cluster prerequisites (operator-managed)

JAHSVR-SPHERE reports Ubuntu 26.04, PostgreSQL **18.6**, empty
`shared_preload_libraries`, and neither TimescaleDB extension nor
`timescaledb-2-postgresql-18` in currently configured APT repositories.
The last package name is the **vendor** package name, not Ubuntu's native one.

Ubuntu 26.04 `universe` separately publishes **`postgresql-18-timescaledb`**
(2.25.1+dfsg-1, as of 2026-11-06). The vendor's packagecloud repository also
publishes `timescaledb-2-postgresql-18` for Ubuntu 26.04. Do not install both
variants together; use one packaging channel only.

First inspect the current APT candidate, operating-system code name and
package installation simulation. These are read-only checks and do not
restart PostgreSQL:

```bash
. /etc/os-release
printf 'OS=%s CODENAME=%s\\n' "$PRETTY_NAME" "$VERSION_CODENAME"
apt-cache policy postgresql-18-timescaledb timescaledb-2-postgresql-18
apt-cache show postgresql-18-timescaledb 2>/dev/null | \
  grep -E '^(Package|Version|Depends):' || true
apt-get -s install --no-install-recommends postgresql-18-timescaledb
```

If the Ubuntu package has no candidate, examine the APT sources and
`universe` availability instead of adding an arbitrary package mirror:

```bash
grep -R -h -E '^(Suites|Components):|^deb ' \
  /etc/apt/sources.list /etc/apt/sources.list.d/ 2>/dev/null || true
```

Enabling the Ubuntu `universe` component or adding a new vendor repository
modifies host package-management configuration. Perform it only with operator
approval and after reviewing package provenance; do not silently change
existing sources. If necessary, use the vendor's official apt repository
instructions and verify the exact Ubuntu `resolute` target.

Before any package installation, review `apt-get -s install` output. Reject
plans proposing a PostgreSQL server removal, server major-version replacement,
unplanned upgrade, or new database cluster. Installing an extension package
alone **does not** make `shared_preload_libraries` active. Do not run
`timescaledb-tune`, edit PostgreSQL config, or restart the shared
`18/main` cluster as part of this package-preflight phase: that cluster
also serves database `sphere`.

When package availability is confirmed and maintenance is approved, install
only the selected compatible extension package separately, then inspect
`pg_available_extensions` and `shared_preload_libraries` again.
Do not run `CREATE EXTENSION` until the controller reports
`READY_FOR_EXTENSION_CREATION`.

References:
- Ubuntu native package: https://packages.ubuntu.com/resolute/postgresql-18-timescaledb
- Vendor apt installation: https://www.tigerdata.com/docs/get-started/choose-your-path/install-timescaledb
- PostgreSQL support matrix: https://www.tigerdata.com/docs/get-started/timescaledb-supported-platforms

## Phase C — opt-in extension activation (only when prerequisites pass)

Run **only** if Phase A says `READY_FOR_EXTENSION_CREATION` (or `ENABLED`)
and you have verified cluster isolation. A privileged `postgres` peer
session is used because creating TimescaleDB often needs elevated rights.
The controller rejects other database names and runs no table migrations.

```bash
runuser -u postgres -- /opt/sphere-rundeck-dev/venv/bin/python \
  /opt/sphere-timescale-preflight/timescaledb-dev-control.py \
  --apply --confirm-dev
```

Then repeat Phase A's read-only check. Confirm
`timescaledb_installed_version` and the `hypertables` list.

## Phase D — do not convert historical tables yet

Installing/enabling the extension does not transform any existing table
or make the current GROUP BY automatically faster.

Current workload schema has `collected_at` in its composite primary key,
but also references `rundeck_collections` and contains existing historical
data. Converting it requires foreign-key, unique-index and locking review.
The old migration attempts conversion of `rundeck_host_metrics` and
`rundeck_top_consumers`; do **not** reuse it in production of the DEV
workload database. Evaluate a separately staged shadow table first.

Maintain PR #94's split-DISTINCT SQL results as the baseline and do not
enable retention/compression policies until historical parity and backups
are separately verified.

Vendor docs:
- https://www.tigerdata.com/docs/get-started/timescaledb-supported-platforms
- https://www.tigerdata.com/docs/get-started/choose-your-path/install-timescaledb
- https://www.tigerdata.com/docs/reference/timescaledb/hypertables/create_hypertable

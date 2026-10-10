#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-/opt/sphere-rundeck-dev/current}"
ENV_FILE="${SPHERE_RUNDECK_ENV_FILE:-/etc/sphere/rundeck-dev.env}"
PYTHON=/opt/sphere-rundeck-dev/venv/bin/python

test -d "$ROOT"
test -f "$ENV_FILE"
test -x "$PYTHON"

value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r'
}

DB_MODE="$(value DB_MODE)"
DATABASE_URL="$(value DATABASE_URL)"

case "$DB_MODE" in
  db|hybrid) ;;
  *)
    echo "SPHERE /dev database migration skipped: DB_MODE=$DB_MODE"
    exit 0
    ;;
esac

if [[ -z "$DATABASE_URL" ]]; then
  echo "Refusing migration: DATABASE_URL is empty" >&2
  exit 40
fi

# Validate the exact PostgreSQL database path, role and LOCAL connection.
# A substring in a query/hostname must never pass as a DEV database target.
# Pipe the URL through stdin, not argv/logs. This script does not print secrets.
if ! printf '%s' "$DATABASE_URL" | "$PYTHON" \
    "$ROOT/ops/rundeck/validate-dev-migration-target.py"; then
  echo "Refusing migration: exact local DEV database target not verified" >&2
  exit 41
fi

# Local PostgreSQL uses peer authentication. The DB role is "sphere", so Alembic
# must connect as the matching OS user instead of root. A checkout under /root is
# intentionally not traversable by sphere; in that case stage only backend code
# under /var/tmp rather than weakening /root permissions or running DB migration
# as root.
MIGRATION_ROOT="$ROOT"
STAGE=""
cleanup() {
  if [[ -n "$STAGE" && -d "$STAGE" ]]; then
    rm -rf -- "$STAGE"
  fi
}
trap cleanup EXIT

if [[ "$(id -un)" != "sphere" ]] && ! runuser -u sphere -- test -r "$ROOT/backend/db/migrations/env.py" 2>/dev/null; then
  STAGE="$(mktemp -d /var/tmp/sphere-rundeck-migrate.XXXXXX)"
  chmod 0755 "$STAGE"
  cp -a "$ROOT/backend" "$STAGE/backend"
  chown -R sphere:sphere "$STAGE"
  MIGRATION_ROOT="$STAGE"
  echo "SPHERE /dev migration staged at $MIGRATION_ROOT because source is not readable by OS user sphere"
fi

if [[ "$(id -un)" == "sphere" ]]; then
  cd "$MIGRATION_ROOT"
  env DB_MODE="$DB_MODE" DATABASE_URL="$DATABASE_URL" \
    "$PYTHON" -m alembic -c backend/alembic.ini upgrade head
  exit $?
fi

runuser -u sphere -- bash -c '
  set -e
  cd "$1"
  exec env DB_MODE="$2" DATABASE_URL="$3" "$4" -m alembic -c backend/alembic.ini upgrade head
' _ "$MIGRATION_ROOT" "$DB_MODE" "$DATABASE_URL" "$PYTHON"

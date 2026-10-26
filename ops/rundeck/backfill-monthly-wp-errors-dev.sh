#!/usr/bin/env bash
# Bounded, verified DEV-only historical WP-error backfill; no PROD writes.
set -Eeuo pipefail

if (( $# != 4 )); then
  echo "Usage: bash ops/rundeck/backfill-monthly-wp-errors-dev.sh YYYY-MM OFFSET SIZE dry-run|apply" >&2
  exit 2
fi
MONTH="$1"
OFFSET="$2"
SIZE="$3"
MODE="$4"
[[ "$MONTH" =~ ^20[0-9]{2}-(0[1-9]|1[0-2])$ ]] || { echo "Invalid calendar month" >&2; exit 2; }
[[ "$OFFSET" =~ ^(0|[1-9][0-9]*)$ ]] || { echo "Invalid batch offset" >&2; exit 2; }
[[ "$SIZE" =~ ^[1-9][0-9]*$ ]] && (( SIZE <= 500 )) || { echo "Batch size must be 1..500" >&2; exit 2; }
[[ "$MODE" == "dry-run" || "$MODE" == "apply" ]] || { echo "Select dry-run or apply" >&2; exit 2; }
[[ "$(id -u)" == 0 ]] || { echo "Run as the authorized DEV operator (root)" >&2; exit 2; }

DEV=/root/rundeck-sphere-dev
ACTIVE=/opt/sphere-rundeck-dev/current
PYTHON=/opt/sphere-rundeck-dev/venv/bin/python
ENV_FILE=/etc/sphere/rundeck-dev.env
RUNTIME="$(readlink -f "$ACTIVE")"
[[ -d "$RUNTIME" && "$RUNTIME" == /opt/sphere-rundeck-dev/releases/* ]] || { echo "Active DEV release is unverified" >&2; exit 2; }
[[ "$(basename "$RUNTIME")" == "$(git -C "$DEV" rev-parse HEAD)" ]] || { echo "Source and active DEV release differ" >&2; exit 2; }
test -x "$PYTHON"
test -f "$ENV_FILE"
test -d /var/lib/sphere/ingestion/manifests

# Read only the two known settings; never source untrusted or unrelated environment values.
value() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r'
}
DB_MODE="$(value DB_MODE)"
DATABASE_URL="$(value DATABASE_URL)"
[[ "$DB_MODE" == "db" || "$DB_MODE" == "hybrid" ]] || { echo "DEV DB_MODE is not enabled" >&2; exit 40; }
printf '%s' "$DATABASE_URL" | "$PYTHON" "$RUNTIME/ops/rundeck/validate-dev-migration-target.py" \
  || { echo "DEV-only database target validation failed" >&2; exit 41; }

if [[ "$MODE" == "apply" ]]; then
  CURRENT_MONTH="$(TZ=Asia/Jakarta date +%Y-%m)"
  [[ "$MONTH" != "$CURRENT_MONTH" ]] || { echo "Current month is still collecting; use closed months for deterministic batches" >&2; exit 42; }
fi

cd "$RUNTIME"
ARGS=(--month "$MONTH" --root /var/lib/sphere/ingestion --batch-offset "$OFFSET" --batch-size "$SIZE")
if [[ "$MODE" == "apply" ]]; then
  ARGS+=(--apply --confirm-dev)
fi
echo "DEV_WP_BACKFILL=$MODE MONTH=$MONTH OFFSET=$OFFSET SIZE=$SIZE SOURCE_SHA=$(basename "$RUNTIME" | cut -c1-8)"
# Socket/peer authentication runs as the same OS user as the DEV API.
# No database credentials are printed. Python also verifies current_database/current_user.
runuser -u sphere -- env \
  DB_MODE="$DB_MODE" DATABASE_URL="$DATABASE_URL" \
  SPHERE_INGESTION_ROOT=/var/lib/sphere/ingestion \
  "$PYTHON" -m backend.backfill_monthly_wp_errors "${ARGS[@]}"

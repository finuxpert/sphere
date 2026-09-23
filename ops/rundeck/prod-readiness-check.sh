#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE="${SOURCE:-/root/rundeck-sphere-dev}"
BASE_URL="${BASE_URL:-https://sphere.astraotoparts.co.id/dev}"
PYTHON="${SPHERE_DEV_PYTHON:-/opt/sphere-rundeck-dev/venv/bin/python}"

git -C "$SOURCE" rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "READINESS BLOCKED: missing git checkout $SOURCE" >&2; exit 2; }
[[ -z "$(git -C "$SOURCE" status --porcelain)" ]] || { echo "READINESS BLOCKED: working tree is not clean" >&2; exit 2; }

cd "$SOURCE"
"$PYTHON" -m unittest backend.tests.test_rundeck
npm run qa
bash ops/rundeck/smoke-watchdog-dev.sh "$BASE_URL"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
curl --noproxy '*' -fsS --max-time 10 "$BASE_URL/api/platform/health" -o "$tmp"

"$PYTHON" - "$tmp" <<'PY'
import json
import sys

health = json.load(open(sys.argv[1]))
collector = health.get("collector") or {}
errors = []

if collector.get("collector_stale"):
    errors.append("collector data is stale")
if str(collector.get("watchdog_status") or "").upper() not in {"NORMAL", "RECOVERED"}:
    errors.append(f"watchdog={collector.get('watchdog_status')}")
if not collector.get("auto_healing_enabled"):
    errors.append("auto-healing is not enabled")
if str(health.get("status") or "").upper() == "CRITICAL":
    errors.append("platform health is CRITICAL")

if errors:
    raise SystemExit("READINESS BLOCKED: " + "; ".join(errors))

print("READINESS PASS: collector fresh, watchdog healthy, auto-healing enabled")
PY

echo "SPHERE PROD READINESS PASS"
echo "HEAD $(git rev-parse HEAD)"

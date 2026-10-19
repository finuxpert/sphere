#!/usr/bin/env bash
# Production Evaluation API ONLY — preserves deployed SPA, Nginx, DB and services.
# Copies exactly two reviewed Python modules over the previous API release.
set -Eeuo pipefail

SOURCE=/root/rundeck-sphere-prod
API_ROOT=/opt/sphere-rundeck-prod
API_CURRENT="$API_ROOT/current"
API_RELEASES="$API_ROOT/releases"
PYTHON="$API_ROOT/venv/bin/python"
WEB_CURRENT=/var/www/sphere.astraotoparts.co.id/current
SERVICE=sphere-rundeck-prod-api.service

[[ "$EUID" -eq 0 ]] || { echo "BLOCKED: run as root"; exit 2; }
test -x "$PYTHON"
test -L "$API_CURRENT"
test -L "$WEB_CURRENT"
test "$(git -C "$SOURCE" branch --show-current)" = rundeck-sphere-prod
test -z "$(git -C "$SOURCE" status --porcelain)"
git -C "$SOURCE" fetch origin rundeck-sphere-prod
test "$(git -C "$SOURCE" rev-parse HEAD)" = "$(git -C "$SOURCE" rev-parse origin/rundeck-sphere-prod)"
systemctl is-active --quiet "$SERVICE" || { echo "BLOCKED: PROD API not active"; exit 2; }

SHA="$(git -C "$SOURCE" rev-parse HEAD)"
SHORT="$(printf '%s' "$SHA" | cut -c1-12)"
PREVIOUS_API="$(readlink -f "$API_CURRENT")"
PREVIOUS_WEB="$(readlink -f "$WEB_CURRENT")"
RELEASE="$API_RELEASES/evaluation-compat-$SHORT"
test -d "$PREVIOUS_API/backend"
test -f "$PREVIOUS_API/backend/rundeck_evaluation.py"
test -f "$PREVIOUS_API/backend/rundeck_api_core.py"
test ! -e "$RELEASE"
grep -Fq 'FULL_EVALUATED_POPULATION' "$SOURCE/backend/rundeck_evaluation.py"
grep -Fq 'offset: int = Query(0' "$SOURCE/backend/rundeck_api_core.py"
grep -Fq 'health: str = Query("ALL"' "$SOURCE/backend/rundeck_api_core.py"

echo "SCOPE=PROD_EVALUATION_API_ONLY"
echo "SOURCE_SHA=$SHA"
echo "PREVIOUS_API=$PREVIOUS_API"
echo "PRESERVED_WEB=$PREVIOUS_WEB"

cd "$SOURCE"
"$PYTHON" -m unittest backend.tests.test_rundeck_evaluation_v1194 backend.tests.test_rundeck_evaluation_paging_prod

echo "Preparing isolated release with two Python files only"
cp -a -- "$PREVIOUS_API" "$RELEASE"
install -m 0644 "$SOURCE/backend/rundeck_evaluation.py" "$RELEASE/backend/rundeck_evaluation.py"
install -m 0644 "$SOURCE/backend/rundeck_api_core.py" "$RELEASE/backend/rundeck_api_core.py"
"$PYTHON" -m py_compile "$RELEASE/backend/rundeck_evaluation.py" "$RELEASE/backend/rundeck_api_core.py"

printf "Type DEPLOY EVALUATION %s TO PROD: " "$(printf '%s' "$SHA" | cut -c1-7)"
IFS= read -r ANSWER
test "$ANSWER" = "DEPLOY EVALUATION $(printf '%s' "$SHA" | cut -c1-7) TO PROD" || { echo "BLOCKED: confirmation did not match"; rm -rf -- "$RELEASE"; exit 2; }

activated=0
atomic_link() {
  local target="$1" path="$2" tmp="$2.next.$$"
  ln -s "$target" "$tmp"
  mv -Tf "$tmp" "$path"
}
rollback() {
  local result="$?"
  trap - ERR INT TERM
  echo "ROLLBACK: Evaluation API activation incomplete (exit=$result)"
  if test "$activated" = 1; then
    atomic_link "$PREVIOUS_API" "$API_CURRENT" || true
    systemctl restart "$SERVICE" || true
    echo "ROLLBACK_PREVIOUS_API=$PREVIOUS_API"
  fi
  test -e "$RELEASE" && rm -rf -- "$RELEASE"
  exit "$result"
}
trap rollback ERR
trap 'false' INT TERM

atomic_link "$RELEASE" "$API_CURRENT"
activated=1
systemctl restart "$SERVICE"
echo "Waiting for local production API to become ready"
ready=0
for attempt in $(seq 1 30); do
  if curl --noproxy '*' -fsS --max-time 3 http://127.0.0.1:8092/health -o /dev/null 2>/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
test "$ready" = 1 || { echo "BLOCKED: API did not become ready"; false; }

# The frontend validates the full page identity and exclusive category counts.
# All requests here are read-only; no ingestion, writes or SAP jobs are triggered.
"$PYTHON" - <<'PY'
import json
import urllib.request
from collections import Counter

BASE = "http://127.0.0.1:8092"
def get(offset):
    url = f"{BASE}/evaluation/workloads?period=1d&type=ALL&health=ALL&limit=100&offset={offset}"
    with urllib.request.urlopen(url, timeout=90) as response:
        assert response.status == 200, response.status
        return json.load(response)

first = get(0)
summary = first.get("summary") or {}
health = summary.get("health") or {}
total = summary.get("workloads")
assert isinstance(total, int) and total > 0, "invalid workload population"
assert set(health) == {"review", "attention", "unknown", "normal"}, health
assert all(isinstance(n, int) and n >= 0 for n in health.values()), health
assert sum(health.values()) == total, "category counts do not match population"
assert health["review"] == summary.get("review_required"), "review mismatch"
seen = set()
observed = Counter()
for offset in range(0, total, 100):
    response = first if offset == 0 else get(offset)
    page = response.get("page") or {}
    items = response.get("items")
    assert isinstance(items, list), "items missing"
    assert page.get("scope") == "FULL_EVALUATED_POPULATION", page
    assert page.get("health") == "ALL", page
    assert page.get("offset") == offset and page.get("total") == total, page
    assert page.get("returned") == len(items) == min(100, total - offset), page
    assert response.get("start") == first.get("start") and response.get("end") == first.get("end"), "evaluation window changed"
    assert response.get("summary", {}).get("health") == health, "category totals changed"
    for row in items:
        identity = (str(row.get("consumer_type") or ""), str(row.get("consumer_key") or ""))
        assert all(identity) and identity not in seen, f"duplicate/missing workload identity: {identity}"
        seen.add(identity)
        status = str(row.get("status") or "").upper()
        category = (
            "review" if status == "REVIEW REQUIRED" else
            "attention" if status in {"HIGH CPU", "HIGH MEMORY", "CPU SPIKE", "INCREASING CPU", "RECURRING"} else
            "normal" if status == "NORMAL" else "unknown"
        )
        observed[category] += 1
assert len(seen) == total, f"population incomplete: {len(seen)}/{total}"
assert dict(observed) == {k: n for k, n in health.items() if n}, (observed, health)
print(f"EVALUATION_COMPAT=PASS TOTAL={total} UNIQUE={len(seen)} HEALTH={health}")
PY

test "$(readlink -f "$WEB_CURRENT")" = "$PREVIOUS_WEB" || { echo "BLOCKED: deployed frontend changed unexpectedly"; false; }
systemctl is-active --quiet "$SERVICE"
trap - ERR INT TERM
echo "FINAL=PASS PROD_EVALUATION_API_ONLY"
echo "CURRENT_API=$(readlink -f "$API_CURRENT")"
echo "CURRENT_WEB=$PREVIOUS_WEB"
echo "ROLLBACK_API=$PREVIOUS_API"

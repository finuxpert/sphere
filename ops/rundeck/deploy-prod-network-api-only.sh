#!/usr/bin/env bash
# FIX PROD: Network RX/TX + exact time range API ONLY; preserve Evaluation and active frontend.
set -Eeuo pipefail

SOURCE=/root/rundeck-sphere-prod
API_ROOT=/opt/sphere-rundeck-prod
API_CURRENT="$API_ROOT/current"
API_RELEASES="$API_ROOT/releases"
PYTHON="$API_ROOT/venv/bin/python"
WEB_CURRENT=/var/www/sphere.astraotoparts.co.id/current
SERVICE=sphere-rundeck-prod-api.service

[[ "$EUID" == 0 ]] || { echo "BLOCKED: run as root"; exit 2; }
test -x "$PYTHON"
test -L "$API_CURRENT"
test -L "$WEB_CURRENT"
test "$(git -C "$SOURCE" branch --show-current)" = rundeck-sphere-prod
test -z "$(git -C "$SOURCE" status --porcelain)"
git -C "$SOURCE" fetch origin rundeck-sphere-prod
test "$(git -C "$SOURCE" rev-parse HEAD)" = "$(git -C "$SOURCE" rev-parse origin/rundeck-sphere-prod)"
systemctl is-active --quiet "$SERVICE" || { echo "BLOCKED: PROD API is not active"; exit 2; }

SHA="$(git -C "$SOURCE" rev-parse HEAD)"
SHORT="${SHA:0:12}"
PREVIOUS_API="$(readlink -f "$API_CURRENT")"
PREVIOUS_WEB="$(readlink -f "$WEB_CURRENT")"
RELEASE="$API_RELEASES/network-compat-$SHORT"
test -d "$PREVIOUS_API/backend"
test -f "$PREVIOUS_API/backend/rundeck_api_core.py"
test -f "$PREVIOUS_API/backend/rundeck_evaluation.py"
test ! -e "$RELEASE"
# Preserve the already restored full-population Evaluation runtime.
grep -Fq 'FULL_EVALUATED_POPULATION' "$PREVIOUS_API/backend/rundeck_evaluation.py"
grep -Fq 'offset: int = Query(0' "$PREVIOUS_API/backend/rundeck_api_core.py"
grep -Fq 'FULL_EVALUATED_POPULATION' "$SOURCE/backend/rundeck_evaluation.py"
grep -Fq 'app_network_trend(since,' "$SOURCE/backend/rundeck_api_core.py"
grep -Fq 'network_rx' "$SOURCE/backend/rundeck_network_trends.py"
grep -Fq 'network_tx' "$SOURCE/backend/rundeck_network_trends.py"

echo "SCOPE=PROD_NETWORK_TRENDS_API_ONLY"
echo "SOURCE_SHA=$SHA"
echo "PREVIOUS_API=$PREVIOUS_API"
echo "PRESERVED_WEB=$PREVIOUS_WEB"

cd "$SOURCE"
"$PYTHON" -m unittest \
  backend.tests.test_rundeck_network_trends \
  backend.tests.test_rundeck_custom_window \
  backend.tests.test_rundeck_network_prod_contract \
  backend.tests.test_rundeck_evaluation_paging_prod

activated=0
atomic_link() {
  local target="$1" path="$2" tmp="$2.next.$$"
  ln -s "$target" "$tmp"
  mv -Tf "$tmp" "$path"
}
rollback() {
  local status="$?"
  trap - ERR INT TERM
  echo "ROLLBACK: Network API change failed (exit=$status)"
  if [[ "$activated" == 1 ]]; then
    atomic_link "$PREVIOUS_API" "$API_CURRENT" || true
    systemctl restart "$SERVICE" || true
    echo "ROLLBACK_PREVIOUS_API=$PREVIOUS_API"
  fi
  if [[ -d "$RELEASE" && "$(readlink -f "$API_CURRENT")" != "$RELEASE" ]]; then
    rm -rf -- "$RELEASE"
  fi
  exit "$status"
}
trap rollback ERR
trap 'false' INT TERM

# Build isolated API release from working PROD, not from the old PROD git checkout.
cp -a -- "$PREVIOUS_API" "$RELEASE"
install -m 0644 "$SOURCE/backend/rundeck_api_core.py" "$RELEASE/backend/rundeck_api_core.py"
install -m 0644 "$SOURCE/backend/rundeck_trends.py" "$RELEASE/backend/rundeck_trends.py"
install -m 0644 "$SOURCE/backend/rundeck_network_trends.py" "$RELEASE/backend/rundeck_network_trends.py"
"$PYTHON" -m py_compile \
  "$RELEASE/backend/rundeck_api_core.py" \
  "$RELEASE/backend/rundeck_trends.py" \
  "$RELEASE/backend/rundeck_network_trends.py"

# Ensure Evaluation implementation remains byte-identical to active production.
cmp -s "$PREVIOUS_API/backend/rundeck_evaluation.py" "$RELEASE/backend/rundeck_evaluation.py"
printf "Type DEPLOY NETWORK ${SHA:0:7} TO PROD: "
IFS= read -r ANSWER
[[ "$ANSWER" == "DEPLOY NETWORK ${SHA:0:7} TO PROD" ]] || {
  echo "BLOCKED: deployment confirmation mismatch"
  rm -rf -- "$RELEASE"
  trap - ERR INT TERM
  exit 2
}

atomic_link "$RELEASE" "$API_CURRENT"
activated=1
systemctl restart "$SERVICE"
ready=0
for attempt in $(seq 1 30); do
  if curl --noproxy '*' -fsS --max-time 4 'http://127.0.0.1:8092/health' -o /dev/null 2>/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
[[ "$ready" == 1 ]] || { echo "BLOCKED: API readiness failed"; false; }

# API contract checks are read-only and do not interpret absent data as zero.
"$PYTHON" - <<'PY'
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from urllib.request import urlopen

BASE = "http://127.0.0.1:8092"
def request(path, params):
    url = BASE + path + "?" + urlencode(params)
    with urlopen(url, timeout=90) as response:
        assert response.status == 200, (url, response.status)
        return json.load(response)

for direction in ("rx", "tx"):
    metric = "network_" + direction
    response = request("/history/trend", {
        "range": "3h", "bucket": "auto", "metric": metric,
    })
    assert response.get("metric") == metric, response
    assert response.get("network_source") == "Infrastructure collector", response
    assert response.get("network_rate_basis") == "highest_interface_per_host_sample"
    assert response.get("unit") == "Mbps"
    assert isinstance(response.get("items"), list)
    assert response.get("warning") is None and response.get("critical") is None
    print("NETWORK_" + direction.upper() + "=PASS SAMPLES=" + str(len(response["items"])))

end = datetime.now(timezone.utc) - timedelta(minutes=5)
start = end - timedelta(minutes=10)
params = {"range": "custom", "bucket": "auto", "metric": "network_rx",
          "from_at": start.isoformat(), "to_at": end.isoformat()}
custom = request("/history/trend", params)
assert custom.get("range") == "custom" and custom.get("metric") == "network_rx"
assert isinstance(custom.get("items"), list)
print("NETWORK_CUSTOM=PASS SAMPLES=" + str(len(custom["items"])))

# Guard the frontend's verified Evaluation population contract after restart.
evaluated = request("/evaluation/workloads", {
    "period": "1d", "type": "ALL", "health": "ALL", "offset": 0, "limit": 1,
})
summary = evaluated.get("summary") or {}
categories = summary.get("health") or {}
page = evaluated.get("page") or {}
assert page.get("scope") == "FULL_EVALUATED_POPULATION", page
assert page.get("total") == summary.get("workloads"), (page, summary)
assert set(categories) == {"review", "attention", "unknown", "normal"}, categories
assert sum(categories.values()) == summary["workloads"]
assert categories["review"] == summary.get("review_required")
print("EVALUATION_PRESERVED=PASS TOTAL=" + str(summary["workloads"]))
PY

[[ "$(readlink -f "$WEB_CURRENT")" == "$PREVIOUS_WEB" ]] || {
  echo "BLOCKED: frontend unexpectedly changed"; false;
}
systemctl is-active --quiet "$SERVICE"
trap - ERR INT TERM
echo "FINAL=PASS PROD_NETWORK_RX_TX_API_ONLY"
echo "CURRENT_API=$(readlink -f "$API_CURRENT")"
echo "CURRENT_WEB=$PREVIOUS_WEB"
echo "ROLLBACK_API=$PREVIOUS_API"

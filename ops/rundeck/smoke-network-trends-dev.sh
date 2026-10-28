#!/usr/bin/env bash
# Fail the DEV release on stale backend/API routing (e.g. HTTP 422 for network_rx).
# Read-only: checks local 8091 and public /dev/api without triggering collection.
set -Eeuo pipefail
BASE_LOCAL="${1:-http://127.0.0.1:8091}"
BASE_PUBLIC="${2:-https://sphere.astraotoparts.co.id/dev/api}"
# For on-host release checks, use local Nginx while preserving TLS and Host routing.
# Independent operator runs keep normal DNS unless explicitly requested.
CURL_ROUTE=()
if [[ "${SPHERE_LOCAL_NGINX_SMOKE:-}" == 1 ]]; then
  CURL_ROUTE=(--resolve 'sphere.astraotoparts.co.id:443:127.0.0.1')
fi
for label in local public; do
  if [[ "$label" == local ]]; then BASE="$BASE_LOCAL"; else BASE="$BASE_PUBLIC"; fi
  for metric in network_rx network_tx; do
    tmp="$(mktemp)"
    trap 'rm -f "$tmp"' EXIT
    url="$BASE/history/trend?range=3h&bucket=auto&metric=$metric"
    code="$(curl --noproxy '*' "${CURL_ROUTE[@]}" -sS --max-time 30 -o "$tmp" -w '%{http_code}' "$url")" || {
      echo "NETWORK_API_SMOKE=FAIL endpoint=$label metric=$metric request_failed" >&2
      exit 1
    }
    if [[ "$code" != 200 ]]; then
      echo "NETWORK_API_SMOKE=FAIL endpoint=$label metric=$metric http=$code" >&2
      head -c 600 "$tmp" >&2
      echo >&2
      exit 1
    fi
    python3 - "$tmp" "$metric" <<'PY'
import json
import sys
from pathlib import Path
try:
    payload = json.loads(Path(sys.argv[1]).read_text())
    assert isinstance(payload, dict)
    assert payload.get("metric") == sys.argv[2]
    assert payload.get("unit") == "Mbps"
    assert payload.get("network_source") == "Infrastructure collector"
    assert isinstance(payload.get("items"), list)
    for row in payload["items"]:
        assert row.get("host") in {"APP1", "APP2", "APP3", "APP4", "APP5"}
except (AssertionError, ValueError, OSError, TypeError) as error:
    raise SystemExit(f"NETWORK_API_SMOKE=FAIL invalid source contract: {error}")
PY
    echo "NETWORK_API_SMOKE=PASS endpoint=$label metric=$metric"
    rm -f "$tmp"
    trap - EXIT
  done
done

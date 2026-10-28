#!/usr/bin/env bash
# DEV-only read-only API contract. Local and public endpoints must agree on
# custom time windows, with no fabricated samples and no missing API routes.
set -Eeuo pipefail
BASE_LOCAL="${1:-http://127.0.0.1:8091}"
BASE_PUBLIC="${2:-https://sphere.astraotoparts.co.id/dev/api}"
# For on-host release checks, use local Nginx while preserving TLS and Host routing.
# Independent operator runs keep normal DNS unless explicitly requested.
CURL_ROUTE=()
if [[ "${SPHERE_LOCAL_NGINX_SMOKE:-}" == 1 ]]; then
  CURL_ROUTE=(--resolve 'sphere.astraotoparts.co.id:443:127.0.0.1')
fi
QUERY="$(python3 - <<'PY'
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
end = datetime.now(timezone.utc) - timedelta(minutes=5)
start = end - timedelta(minutes=10)
print(urlencode({"from_at": start.isoformat(), "to_at": end.isoformat()}))
PY
)"
for label in local public; do
  if [[ "$label" == local ]]; then base="$BASE_LOCAL"; else base="$BASE_PUBLIC"; fi
  for metric in cpu ram network_rx network_tx; do
    tmp="$(mktemp)"
    url="$base/history/trend?range=custom&bucket=auto&metric=$metric&$QUERY"
    code="$(curl --noproxy '*' "${CURL_ROUTE[@]}" -sS --max-time 30 -o "$tmp" -w '%{http_code}' "$url")" || {
      rm -f "$tmp"
      echo "CUSTOM_API_SMOKE=FAIL endpoint=$label metric=$metric request_failed" >&2
      exit 1
    }
    if [[ "$code" != 200 ]]; then
      echo "CUSTOM_API_SMOKE=FAIL endpoint=$label metric=$metric http=$code" >&2
      head -c 600 "$tmp" >&2
      echo >&2
      rm -f "$tmp"
      exit 1
    fi
    python3 - "$tmp" "$metric" "$QUERY" <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs
payload = json.loads(Path(sys.argv[1]).read_text())
metric = sys.argv[2]
bounds = parse_qs(sys.argv[3])
start = datetime.fromisoformat(bounds["from_at"][0]).astimezone(timezone.utc)
end = datetime.fromisoformat(bounds["to_at"][0]).astimezone(timezone.utc)
assert payload.get("metric") == metric
assert payload.get("range") == "custom"
assert payload.get("bucket") == "raw"
assert isinstance(payload.get("items"), list)
assert payload.get("window_end") is not None
for row in payload["items"]:
    at = datetime.fromisoformat(str(row["bucket"]).replace("Z", "+00:00")).astimezone(timezone.utc)
    assert start <= at < end, "Out-of-window trend sample"
    assert row.get("host") in {"APP1","APP2","APP3","APP4","APP5"} or str(row.get("host", "")).upper().startswith("AOPH")
if metric.startswith("network_"):
    assert payload.get("network_source") == "Infrastructure collector"
    assert payload.get("unit") == "Mbps"
PY
    rm -f "$tmp"
    echo "CUSTOM_API_SMOKE=PASS endpoint=$label metric=$metric"
  done
  tmp="$(mktemp)"
  code="$(curl --noproxy '*' "${CURL_ROUTE[@]}" -sS --max-time 30 -o "$tmp" -w '%{http_code}' "$base/history/window?$QUERY")" || {
    rm -f "$tmp"
    echo "CUSTOM_API_SMOKE=FAIL endpoint=$label route=history/window request_failed" >&2
    exit 1
  }
  if [[ "$code" != 200 ]]; then
    echo "CUSTOM_API_SMOKE=FAIL endpoint=$label route=history/window http=$code" >&2
    head -c 600 "$tmp" >&2
    echo >&2
    rm -f "$tmp"
    exit 1
  fi
  python3 - "$tmp" "$QUERY" <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs
payload = json.loads(Path(sys.argv[1]).read_text())
bounds = parse_qs(sys.argv[2])
start = datetime.fromisoformat(bounds["from_at"][0]).astimezone(timezone.utc)
end = datetime.fromisoformat(bounds["to_at"][0]).astimezone(timezone.utc)
assert payload.get("end_exclusive") is True
for key in ("host_samples", "workloads", "alerts"):
    assert isinstance(payload.get(key), list)
    for row in payload[key]:
        observed = datetime.fromisoformat(str(row["collected_at"]).replace("Z","+00:00")).astimezone(timezone.utc)
        assert start <= observed < end, "Out-of-window " + key
assert isinstance(payload.get("limited"), dict)
PY
  rm -f "$tmp"
  echo "CUSTOM_API_SMOKE=PASS endpoint=$label route=history/window"
done

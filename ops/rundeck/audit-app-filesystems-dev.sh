#!/usr/bin/env bash
# Read-only evidence check: never infer shared storage solely from equal percentages.
set -Eeuo pipefail
BASE="${SPHERE_DEV_LOCAL_API:-http://127.0.0.1:8091}"
HOSTS="$(mktemp)"
FILES="$(mktemp)"
trap 'rm -f "$HOSTS" "$FILES"' EXIT
curl --noproxy '*' -fsS --max-time 15 "$BASE/infra/hosts" -o "$HOSTS"
curl --noproxy '*' -fsS --max-time 15 "$BASE/infra/filesystems" -o "$FILES"
python3 - "$HOSTS" "$FILES" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as stream:
    hosts = json.load(stream).get("items", [])
with open(sys.argv[2], encoding="utf-8") as stream:
    filesystems = json.load(stream).get("items", [])

print("SOURCE=SPHERE_DEV_READ_ONLY")
print("HOST|COLLECTION|MOUNT|DEVICE|USED_PCT|SAMPLE_AT")
observed = []
for host in sorted(hosts, key=lambda row: str(row.get("host", ""))):
    identity = str(host.get("host", "")).strip().upper()
    collection = str(host.get("collection_id", ""))
    matches = [
        row for row in filesystems
        if str(row.get("host", "")).strip().upper() == identity
        and str(row.get("collection_id", "")) == collection
        and str(row.get("mount_point", "")).upper() == "/SAP_ARCH"
    ]
    if not matches:
        print(f"{identity}|{collection}|NOT_OBSERVED|—|—|—")
    for row in matches:
        pct = row.get("used_pct")
        device = row.get("device") or row.get("filesystem") or "not reported"
        sample = row.get("collected_at") or row.get("snapshot_ts") or "not reported"
        print(f"{identity}|{collection}|{row.get('mount_point')}|{device}|{pct}|{sample}")
        observed.append((identity, collection, pct, str(device), str(sample)))

print(f"MATCHED_MOUNTS={len(observed)}")
print("INTERPRETATION=Equal capacity percentages do not establish shared storage; verify physical volumes from Infrastructure source.")
PY

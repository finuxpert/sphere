#!/usr/bin/env bash
# Read-only Infrastructure evidence audit; never changes source telemetry.
set -Eeuo pipefail
[[ "$(git -C /root/rundeck-sphere-dev branch --show-current)" == rundeck-sphere-dev ]] || { echo "FS_AUDIT=BLOCKED_WRONG_BRANCH"; exit 2; }
python3 - <<'PY'
import json, re, urllib.request
base = 'https://sphere.astraotoparts.co.id/dev/api'
def read(endpoint):
    request = urllib.request.Request(base + endpoint, headers={'Accept':'application/json','Cache-Control':'no-cache'})
    with urllib.request.urlopen(request, timeout=12) as response:
        body = json.load(response)
    if not isinstance(body, dict) or not isinstance(body.get('items'), list):
        raise ValueError('Unexpected Infrastructure REST response for ' + endpoint)
    return body['items']
hosts = read('/infra/hosts')
filesystems = read('/infra/filesystems')
observed = []
print('FS_AUDIT=READ_ONLY host_count=%d filesystem_samples=%d' % (len(hosts), len(filesystems)))
for host in sorted(hosts, key=lambda h: str(h.get('host',''))):
    hostname = str(host.get('host') or '').strip()
    if not re.fullmatch(r'AOPH[1-9][0-9]*PAPPDC', hostname, re.I):
        continue
    rows = [row for row in filesystems if str(row.get('host','')).strip().upper() == hostname.upper()]
    usable = [row for row in rows if isinstance(row.get('used_pct'), (int,float))]
    highest = max(usable, key=lambda row: row['used_pct']) if usable else None
    if not highest:
        print('FS_HOST=%s SAMPLE=NOT_AVAILABLE' % hostname)
        continue
    percent = highest['used_pct']
    collected = highest.get('collected_at') or highest.get('snapshot_ts') or 'UNKNOWN'
    collection = highest.get('collection_id') or 'UNKNOWN'
    host_collection = host.get('collection_id') or 'UNKNOWN'
    freshness = host.get('snapshot_ts') or host.get('collected_at') or 'UNKNOWN'
    mount = str(highest.get('mount_point') or 'UNKNOWN')
    print('FS_HOST=%s MOUNT=%s USED_PCT=%s FS_COLLECTION=%s HOST_COLLECTION=%s FS_AT=%s HOST_AT=%s' %
        (hostname, mount, percent, collection, host_collection, collected, freshness))
    observed.append((hostname,mount,percent,collection,host_collection,collected,freshness))
equal = len(observed) >= 5 and len({item[2] for item in observed}) == 1
print('FS_IDENTICAL_VALUES=%s' % ('OBSERVED_CAUSE_NOT_INFERRED' if equal else 'NOT_UNIVERSAL'))
print('FS_AUDIT_RESULT=EVIDENCE_ONLY_NO_THRESHOLD_CHANGE')
PY

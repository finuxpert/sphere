#!/usr/bin/env python3
"""Report only node-dispatch selectors for two verified SPHERE jobs (GET only).

Runs on JAHSVR-SPHERE as an authorized root operator. Reads the already-healthy
Reader credential without echoing it. Never returns full job definitions, steps,
credentials, environment values, or execution output. No writes or POST requests.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

BASE = "http://10.14.55.205:4440"
API = 44
READER = Path("/etc/sphere/rundeck-readonly.token")
JOBS = {
    "PERFORMANCE": "4f129041-956c-4e80-916f-fcde8948db09",
    "AVAILABILITY": "34821afe-9261-4122-88db-cf6e8fc65545",
}
MAX = 1024 * 1024
SAFE_SELECTOR = re.compile(r"^[A-Za-z0-9_.:,*/+?()=\\s-]{1,160}$")

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def request_definition(job_id, token):
    req = Request(
        f"{BASE}/api/{API}/job/{job_id}?format=json",
        headers={"X-Rundeck-Auth-Token": token, "Accept": "application/json"},
        method="GET",
    )
    opener = build_opener(ProxyHandler({}), NoRedirect())
    try:
        with opener.open(req, timeout=12) as response:
            body = response.read(MAX + 1)
            if len(body) > MAX:
                return "OVERSIZED_RESPONSE", None
            if int(response.status) != 200:
                return "HTTP_" + str(response.status), None
        return "HTTP_200", json.loads(body)
    except HTTPError as error:
        return "HTTP_" + str(error.code), None
    except (URLError, OSError, TimeoutError):
        return "NETWORK_ERROR", None
    except (ValueError, TypeError):
        return "INVALID_JSON", None

def job_object(value, job_id):
    if isinstance(value, list):
        matched = [x for x in value if isinstance(x, dict) and x.get("id") == job_id]
        return matched[0] if len(matched) == 1 else None
    return value if isinstance(value, dict) and value.get("id") == job_id else None

def selector(value):
    if value is None or value == "":
        return "UNSET"
    if not isinstance(value, str) or not SAFE_SELECTOR.fullmatch(value):
        return "COMPLEX_OR_REDACTED_REVIEW_IN_RUNDECK_UI"
    return value

def main():
    print("=== SPHERE JOB NODE FILTER INSPECTION (GET ONLY) ===")
    print("READER=UNCHANGED")
    try:
        token = READER.read_text(encoding="utf-8").strip()
    except OSError:
        print("READER=UNAVAILABLE")
        return 2
    if not token or len(token) > 4096:
        print("READER=UNUSABLE")
        return 2
    good = True
    for label, job_id in JOBS.items():
        status, body = request_definition(job_id, token)
        print(label + "_DEFINITION=" + status)
        job = job_object(body, job_id)
        if not job or job.get("project") != "Linux" or job.get("group") != "SAP/AOP":
            print(label + "_IDENTITY=NOT_VERIFIED")
            good = False
            continue
        filters = job.get("nodefilters")
        if not isinstance(filters, dict):
            print(label + "_NODE_FILTER=UNVERIFIED_FROM_API")
            good = False
            continue
        print(label + "_NODE_FILTER=" + selector(filters.get("filter")))
        print(label + "_DISPATCH_PRESENT=" + str(isinstance(job.get("dispatch"), dict)).upper())
        print(label + "_NODE_FILTER_EDITABLE=" + str(bool(job.get("nodeFilterEditable"))).upper())
    print("RUN_KILL=NOT_TESTED")
    print("NO_CHANGES=YES")
    return 0 if good else 1

if __name__ == "__main__":
    raise SystemExit(main())

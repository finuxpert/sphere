#!/usr/bin/env python3
"""Identify the configured SPHERE performance job using GET only.

Use on JAHSVR-SPHERE as root. Never prints credential, raw API response,
job options, command, or unrelated job names; no action endpoints are used.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

BASE = "http://10.14.55.205:4440"
API = 44
EXPECTED_UUID = "4f129041-956c-4e80-916f-fcde8948db09"
READER = Path("/etc/sphere/rundeck-readonly.token")
ENV = Path("/etc/sphere/rundeck-dev.env")
ALLOWED_KEYS = {"RUNDECK_PROJECT", "RUNDECK_JOB_GROUP", "RUNDECK_JOB_NAME", "RUNDECK_RUN_JOB_ID"}
MAX_BODY = 2 * 1024 * 1024


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def config():
    result = {}
    try:
        lines = ENV.read_text(encoding="utf-8").splitlines()
    except OSError:
        return result
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() in ALLOWED_KEYS:
            result[key.strip()] = value.strip().strip("\"'")
    return result


def request_json(path, token):
    opener = build_opener(ProxyHandler({}), NoRedirect())
    req = Request(BASE + path, method="GET", headers={
        "X-Rundeck-Auth-Token": token,
        "Accept": "application/json",
    })
    try:
        with opener.open(req, timeout=12) as response:
            if response.status != 200:
                return f"HTTP_{response.status}", None
            body = response.read(MAX_BODY + 1)
        if len(body) > MAX_BODY:
            return "RESPONSE_OVERSIZE", None
        return "HTTP_200", json.loads(body)
    except HTTPError as error:
        return f"HTTP_{error.code}", None
    except (URLError, TimeoutError, OSError):
        return "NETWORK_ERROR", None
    except (ValueError, TypeError):
        return "INVALID_JSON", None


def clean(value):
    if not isinstance(value, str):
        return "UNVERIFIED"
    return re.sub(r"[^a-zA-Z0-9_./ \[\]():-]", "?", value)[:120]


def selected_job(item):
    if not isinstance(item, dict):
        return False
    name = str(item.get("name") or "").lower()
    job_id = item.get("id")
    return job_id == EXPECTED_UUID or (
        "sphere" in name and ("process" in name or "work" in name)
    )


def main():
    print("=== SPHERE PERFORMANCE JOB IDENTITY (GET ONLY) ===")
    print("CREDENTIAL=READER_ONLY (NO DISPLAY)")
    conf = config()
    print("CONFIG_PROJECT=" + clean(conf.get("RUNDECK_PROJECT", "Linux")))
    print("CONFIG_GROUP=" + clean(conf.get("RUNDECK_JOB_GROUP")))
    print("CONFIG_JOB_NAME=" + clean(conf.get("RUNDECK_JOB_NAME")))
    print("CONFIG_UUID_MATCH=" + str(conf.get("RUNDECK_RUN_JOB_ID") == EXPECTED_UUID))
    try:
        token = READER.read_text(encoding="utf-8").strip()
    except OSError:
        print("READER_CREDENTIAL=UNAVAILABLE")
        return 2
    if not token:
        print("READER_CREDENTIAL=EMPTY")
        return 2

    status, data = request_json(f"/api/{API}/job/{EXPECTED_UUID}/info", token)
    print("CONFIGURED_UUID_READ=" + status)
    if status == "HTTP_200" and isinstance(data, dict):
        print("UUID_PROJECT=" + clean(data.get("project")))
        print("UUID_GROUP=" + clean(data.get("group")))
        print("UUID_NAME=" + clean(data.get("name")))
        print("UUID_ID_MATCH=" + str(data.get("id") == EXPECTED_UUID))
    else:
        print("UUID_METADATA=UNVERIFIED")

    status, payload = request_json(f"/api/{API}/project/Linux/jobs?format=json", token)
    print("LINUX_JOBS_LIST=" + status)
    if status == "HTTP_200" and isinstance(payload, list):
        matched = [row for row in payload if selected_job(row)]
        print("SPHERE_WORK_PROCESS_CANDIDATES=" + str(len(matched)))
        for row in matched[:10]:
            print("MATCH_ID=" + clean(row.get("id")))
            print("MATCH_PROJECT=" + clean(row.get("project")))
            print("MATCH_GROUP=" + clean(row.get("group")))
            print("MATCH_NAME=" + clean(row.get("name")))
        if len(matched) > 10:
            print("MATCH_LIST_TRUNCATED=YES")
    else:
        print("JOB_LIST_MATCHES=UNVERIFIED")
    print("RUNNER_TOKEN=NOT_READ")
    print("NO_CHANGES=YES")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

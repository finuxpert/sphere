#!/usr/bin/env python3
"""Read-only guardrail review for the three verified SPHERE Rundeck jobs.

Uses the existing healthy Reader on JAHSVR-SPHERE. No run, abort, update, or
service action. No full job definitions, scripts, options, tokens or log output
are printed. The info endpoint is the identity authority; API v44 job export
is inspected separately for scheduling/concurrency and node filters.
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
    "INFRA_READER_ONLY": "66ffa675-1d77-4fe5-9aec-95ef5e330726",
}
MAX_BYTES = 2 * 1024 * 1024
SAFE_SELECTOR = re.compile(r"^[A-Za-z0-9_.:,*/+?()=\s-]{1,160}$")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def get_json(path: str, token: str):
    req = Request(BASE + path, method="GET", headers={
        "X-Rundeck-Auth-Token": token,
        "Accept": "application/json",
    })
    opener = build_opener(ProxyHandler({}), NoRedirect())
    try:
        with opener.open(req, timeout=12) as response:
            raw = response.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                return "OVERSIZED", None
            if int(response.status) != 200:
                return f"HTTP_{response.status}", None
        return "HTTP_200", json.loads(raw)
    except HTTPError as error:
        return f"HTTP_{error.code}", None
    except (URLError, OSError, TimeoutError):
        return "NETWORK_ERROR", None
    except (ValueError, TypeError):
        return "INVALID_JSON", None


def export_job(payload: object, metadata: dict) -> dict | None:
    """Recognize API v44 array, object or jobs wrapper; reject ambiguous data."""
    if isinstance(payload, list):
        candidates = payload
    elif isinstance(payload, dict) and isinstance(payload.get("jobs"), list):
        candidates = payload["jobs"]
    elif isinstance(payload, dict):
        candidates = [payload]
    else:
        return None
    candidates = [item for item in candidates if isinstance(item, dict)]
    if len(candidates) != 1:
        return None
    item = candidates[0]
    if item.get("id") not in (None, metadata["id"]):
        return None
    if item.get("project") not in (None, metadata["project"]):
        return None
    if item.get("group") not in (None, metadata["group"]):
        return None
    if item.get("name") != metadata["name"]:
        return None
    return item


def printable_filter(value) -> str:
    if value is None or value == "":
        return "UNSET"
    if not isinstance(value, str) or not SAFE_SELECTOR.fullmatch(value):
        return "REDACTED_COMPLEX_REVIEW_IN_RUNDECK"
    return value


def compact_retry(value) -> str:
    if value is None or value == "":
        return "UNSET"
    if isinstance(value, dict):
        value = value.get("retry", value.get("max", "UNVERIFIED"))
    if isinstance(value, int):
        return str(value) if 0 <= value <= 100000 else "UNVERIFIED"
    if isinstance(value, str) and value.isdecimal() and len(value) < 7:
        return value
    return "DYNAMIC_OR_UNVERIFIED"


def compact_timeout(value) -> str:
    if value is None or value == "":
        return "UNSET"
    if isinstance(value, (str, int)):
        s = str(value)
        if re.fullmatch(r"[0-9dhms .]{1,40}", s):
            return s
    return "DYNAMIC_OR_UNVERIFIED"


def compact_flag(value) -> str:
    if value is True or value == "true":
        return "TRUE"
    if value is False or value == "false":
        return "FALSE"
    return "UNVERIFIED"


def describe_job(export: dict) -> None:
    parallel = export.get("multipleExecutions")
    if isinstance(parallel, bool):
        status = "ENABLED" if parallel else "DISABLED"
    elif isinstance(parallel, str) and parallel.lower() in ("true", "false"):
        status = "ENABLED" if parallel.lower() == "true" else "DISABLED"
    else:
        status = "UNVERIFIED"
    print("  MULTIPLE_EXECUTIONS=" + status)
    print("  RETRY=" + compact_retry(export.get("retry")))
    limit = export.get("maxMultipleExecutions")
    print("  MAX_MULTIPLE_EXECUTIONS=" + (
        str(limit) if isinstance(limit, int) and 0 <= limit <= 100000 else "UNVERIFIED"
    ))
    print("  TIMEOUT=" + compact_timeout(export.get("timeout")))
    print("  SCHEDULE_PRESENT=" + str(bool(export.get("schedule"))).upper())
    print("  SCHEDULE_ENABLED=" + compact_flag(export.get("scheduleEnabled")))
    print("  EXECUTION_ENABLED=" + compact_flag(export.get("executionEnabled")))
    nf = export.get("nodefilters")
    if isinstance(nf, dict):
        print("  NODE_FILTER=" + printable_filter(nf.get("filter")))
    else:
        print("  NODE_FILTER=UNVERIFIED_FROM_EXPORT")
    dispatch = export.get("dispatch")
    print("  DISPATCH_PRESENT=" + str(isinstance(dispatch, dict)).upper())
    print("  NODE_FILTER_EDITABLE=" + compact_flag(export.get("nodeFilterEditable")))


def main() -> int:
    print("=== SPHERE RUNDECK JOB EXECUTION GUARD REVIEW (GET ONLY) ===")
    print("CREDENTIAL=EXISTING_READER_NOT_DISPLAYED")
    try:
        token = READER.read_text(encoding="utf-8").strip()
    except OSError:
        print("READER=UNAVAILABLE")
        return 2
    if not token or len(token) > 4096:
        print("READER=INVALID")
        return 2

    success = True
    for label, job_id in JOBS.items():
        print(f"JOB={label}")
        status, metadata = get_json(f"/api/{API}/job/{job_id}/info", token)
        print("  INFO=" + status)
        if status != "HTTP_200" or not isinstance(metadata, dict) or (
            metadata.get("id") != job_id or metadata.get("project") != "Linux"
            or metadata.get("group") != "SAP/AOP"
        ):
            print("  IDENTITY=NOT_VERIFIED")
            success = False
            continue
        print("  IDENTITY=VERIFIED")
        status, export = get_json(f"/api/{API}/job/{job_id}?format=json", token)
        print("  EXPORT=" + status)
        job = export_job(export, metadata) if status == "HTTP_200" else None
        if job is None:
            print("  GUARDRAILS=UNVERIFIED_EXPORT_FORMAT_OR_IDENTITY")
            success = False
            continue
        describe_job(job)

    print("NOTE=Schedule or retry flags alone cannot prove the source of duplicate executions.")
    print("NOTE=Check triggers, external callers, job references and execution history separately.")
    print("RUNNER_TOKEN=NOT_READ")
    print("NO_CHANGES=YES")
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())

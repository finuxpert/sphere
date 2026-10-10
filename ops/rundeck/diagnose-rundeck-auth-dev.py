#!/usr/bin/env python3
"""Read-only Rundeck API HTTP-status probe for the SPHERE DEV reader credential.

This diagnostic NEVER prints the token, API payload, headers, query values or
raw errors. It does not perform any mutating Rundeck action. It is intentionally
run from the server checkout, without changing the active API/watchdog services.
"""
from __future__ import annotations

import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

BASE = "http://10.14.55.205:4440"
API_VERSION = 44
TOKEN_PATH = Path("/etc/sphere/rundeck-readonly.token")
ENV_PATH = Path("/etc/sphere/rundeck-dev.env")
EXPECTED_KEYS = ("RUNDECK_PROJECT", "RUNDECK_JOB_GROUP", "RUNDECK_JOB_NAME", "RUNDECK_RUN_JOB_ID")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def load_config(path: Path = ENV_PATH) -> dict[str, str]:
    """Only parse plain KEY=VALUE entries. Never execute the environment file."""
    allowed = set(EXPECTED_KEYS)
    result = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return result
    for line in lines:
        item = line.strip()
        if not item or item.startswith("#") or "=" not in item:
            continue
        key, value = item.split("=", 1)
        key = key.strip()
        if key not in allowed:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        result[key] = value
    return result


def http_status(path: str, token: str) -> str:
    """Return only an HTTP status or exception class, never any response detail."""
    opener = build_opener(ProxyHandler({}), NoRedirect())
    request = Request(
        BASE + path,
        method="GET",
        headers={"X-Rundeck-Auth-Token": token, "Accept": "application/json"},
    )
    try:
        with opener.open(request, timeout=10) as response:
            return f"HTTP_{int(response.status)}"
    except HTTPError as error:
        return f"HTTP_{int(error.code)}"
    except URLError as error:
        reason = error.reason
        return "NETWORK_TIMEOUT" if isinstance(reason, TimeoutError) else "NETWORK_ERROR"
    except (OSError, TimeoutError):
        return "NETWORK_ERROR"


def probe_paths(config: dict[str, str]) -> list[tuple[str, str]]:
    project = config.get("RUNDECK_PROJECT", "Linux").strip()
    group = config.get("RUNDECK_JOB_GROUP", "").strip()
    name = config.get("RUNDECK_JOB_NAME", "").strip()
    job_id = config.get("RUNDECK_RUN_JOB_ID", "").strip()
    paths = [("API system info", f"/api/{API_VERSION}/system/info")]
    if project and group and name:
        query = urlencode({
            "groupPathExact": group,
            "jobFilter": name,
            "adhoc": "false",
            "max": "20",
            "offset": "0",
        })
        paths.append(("Poller executions", f"/api/{API_VERSION}/project/{quote(project, safe='')}/executions?{query}"))
    if project and job_id and not job_id.startswith("REPLACE_"):
        query = urlencode({"jobIdFilter": job_id})
        paths.append(("Watchdog running executions", f"/api/{API_VERSION}/project/{quote(project, safe='')}/executions/running?{query}"))
    return paths


def main() -> int:
    print("=== SPHERE DEV RUNDECK READER API (GET ONLY) ===")
    config = load_config()
    try:
        token = TOKEN_PATH.read_text(encoding="utf-8").strip()
    except OSError:
        print("READER_CREDENTIAL=UNAVAILABLE")
        return 2
    if not token:
        print("READER_CREDENTIAL=EMPTY")
        return 2
    print("READER_CREDENTIAL=PRESENT (not displayed)")
    print("ENV_CONFIG=" + ("PRESENT" if ENV_PATH.is_file() else "MISSING"))
    targets = probe_paths(config)
    for label, target in targets:
        print(f"{label}: {http_status(target, token)}")
    if len(targets) < 3:
        print("NOTE: One or more endpoint probes skipped because job configuration is incomplete.")
    print("NOTE: 403 may reflect token, ACL or endpoint policy; do not infer an exact cause from status alone.")
    print("=== COMPLETE (READ ONLY; NO DEPLOY) ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

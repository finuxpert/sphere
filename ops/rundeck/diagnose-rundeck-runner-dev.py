#!/usr/bin/env python3
"""Validate a newly generated SPHERE DEV Runner token without modifying anything.

Run as an operator on JAHSVR-SPHERE. Never print or persist token content.
Only GET requests are issued; no job run, abort, configuration changes or
systemctl actions. HTTP 200 is evidence of readable scope, NOT run/kill ACL.
"""
from __future__ import annotations

import getpass
import json
import re
import subprocess
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

BASE = "http://10.14.55.205:4440"
API_VERSION = 44
ENV_FILE = Path("/etc/sphere/rundeck-dev.env")
JOB_ID_KEYS = ("RUNDECK_PERF_JOB_ID", "RUNDECK_AVAIL_JOB_ID")
UUID_PATTERN = re.compile(r"[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}\Z")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def parse_assignment(line: str) -> tuple[str, str] | None:
    item = line.strip()
    if not item or item.startswith("#") or "=" not in item:
        return None
    key, value = item.split("=", 1)
    key = key.strip()
    if key not in JOB_ID_KEYS:
        return None
    value = value.strip().strip('"').strip("'")
    return key, value


def job_ids() -> dict[str, str]:
    # Base values from systemd unit; EnvironmentFile overrides them.
    values: dict[str, str] = {}
    result = subprocess.run(
        ["systemctl", "cat", "sphere-rundeck-api.service"],
        capture_output=True, text=True, check=False, timeout=8,
    )
    if result.returncode == 0:
        for match in re.finditer(r"Environment=([^\n]+)", result.stdout):
            for item in match.group(1).split():
                found = parse_assignment(item)
                if found:
                    values[found[0]] = found[1]

    try:
        lines = ENV_FILE.read_text(encoding="utf-8").splitlines()
    except OSError:
        lines = []
    for line in lines:
        found = parse_assignment(line)
        if found:
            values[found[0]] = found[1]

    return {key: values[key] for key in JOB_ID_KEYS
            if key in values and UUID_PATTERN.fullmatch(values[key])}


def get_status(path: str, token: str) -> str:
    opener = build_opener(ProxyHandler({}), NoRedirect())
    request = Request(
        BASE + path,
        headers={"X-Rundeck-Auth-Token": token, "Accept": "application/json"},
        method="GET",
    )
    try:
        with opener.open(request, timeout=10) as response:
            return f"HTTP_{int(response.status)}"
    except HTTPError as error:
        return f"HTTP_{int(error.code)}"
    except URLError:
        return "NETWORK_ERROR"
    except (OSError, TimeoutError):
        return "NETWORK_ERROR"



def get_identity(token: str) -> tuple[str, str]:
    """Return only non-secret identity labels; discard the full response body."""
    opener = build_opener(ProxyHandler({}), NoRedirect())
    request = Request(
        BASE + f"/api/{API_VERSION}/user/info",
        headers={"X-Rundeck-Auth-Token": token, "Accept": "application/json"},
        method="GET",
    )
    try:
        with opener.open(request, timeout=10) as response:
            payload = json.loads(response.read(32768))
        if not isinstance(payload, dict):
            return "UNVERIFIED", "UNVERIFIED"
        raw_user = next(
            (payload.get(name) for name in ("login", "username", "userName", "user")
             if isinstance(payload.get(name), str) and payload.get(name)),
            None,
        )
        raw_roles = payload.get("roles")
        if isinstance(raw_roles, list):
            roles = ",".join(str(role) for role in raw_roles if isinstance(role, str))
        elif isinstance(raw_roles, str):
            roles = raw_roles
        else:
            roles = ""
        sanitize = lambda value: re.sub(r"[^A-Za-z0-9_.,-]", "", str(value))[:160] or "UNVERIFIED"
        return sanitize(raw_user), sanitize(roles)
    except (HTTPError, URLError, OSError, ValueError, TypeError):
        return "UNVERIFIED", "UNVERIFIED"


def main() -> int:
    print("=== SPHERE DEV RUNNER VERIFICATION (GET ONLY) ===")
    print("NO CHANGES: existing reader/runner files and SAP jobs remain untouched")
    ids = job_ids()
    if len(ids) != len(JOB_ID_KEYS):
        print("BLOCKED: whitelisted job IDs not fully resolved from live DEV config")
        return 2
    print("DEV_WHITELIST_JOB_IDS=PRESENT (both values withheld)")

    try:
        token = getpass.getpass("Paste NEW Runner token (hidden; not stored): ").strip()
    except (EOFError, KeyboardInterrupt):
        print("CANCELLED")
        return 2
    if not token:
        print("BLOCKED: empty token")
        return 2

    targets = [
        ("API system info", f"/api/{API_VERSION}/system/info"),
        ("Token identity endpoint", f"/api/{API_VERSION}/user/info"),
    ]
    for key, label in (
        ("RUNDECK_PERF_JOB_ID", "Performance"),
        ("RUNDECK_AVAIL_JOB_ID", "Service Availability"),
    ):
        job_id = quote(ids[key], safe="")
        targets.extend([
            (f"{label} job read", f"/api/{API_VERSION}/job/{job_id}"),
            (f"{label} execution list", f"/api/{API_VERSION}/job/{job_id}/executions?status=running&max=1"),
        ])

    statuses = {label: get_status(path, token) for label, path in targets}
    for label, status in statuses.items():
        print(f"{label}: {status}")
    user, roles = get_identity(token)
    print(f"TOKEN_USER={user}")
    print(f"TOKEN_ROLES={roles}")
    if user == "admin" or "admin" in roles.lower().split(","):
        print("PRIVILEGE_REVIEW=REQUIRED (admin identity or role)")
    elif user == "UNVERIFIED" or roles == "UNVERIFIED":
        print("PRIVILEGE_REVIEW=REQUIRED (identity or roles not verified)")
    else:
        print("PRIVILEGE_REVIEW=CHECK_SCOPE_WITH_ACL")

    # A narrowly scoped service token may be denied system info while still
    # having the two required job read scopes. System/user endpoints are advisory.
    required = [label for label, _ in targets
                if label.endswith("job read") or label.endswith("execution list")]
    all_ok = all(statuses[label] == "HTTP_200" for label in required)
    print("RUNNER_READ_SCOPE=" + ("PASS" if all_ok else "FAIL"))
    print("RUN_KILL_SCOPE=NOT_TESTED (requires separate ACL inspection; no POST sent)")
    print("SYSTEMD_CREDENTIAL_FILE=UNCHANGED")
    print("=== COMPLETE (NO DEPLOY; NO JOB ACTION) ===")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

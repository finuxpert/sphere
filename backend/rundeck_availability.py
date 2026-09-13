"""Read and normalize the existing Rundeck Service Availability report.

Availability is determined from the operational port checks already executed by Rundeck.
Resource changes in SPHERE remain supporting evidence and are not used here to infer UP/DOWN.
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import quote, urlencode

from backend.rundeck_credentials import credential_mode, read_credential
from backend.rundeck_poller import API_VERSION, request, output_text

ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
SERVICE_RE = re.compile(
    r"(?P<endpoint>(?:[A-Za-z0-9._-]+|(?:\d{1,3}\.){3}\d{1,3}):\d+)\s+"
    r"(?P<description>.+?)\s+(?:✅|❌|✔|✘|\[?OK\]?|\[?FAIL\]?\s*)?"
    r"(?P<status>UP|DOWN)\s*$",
    re.IGNORECASE,
)
INSTANCE_RE = re.compile(r"instance\s*(\d+)", re.IGNORECASE)
DISPATCHER_RE = re.compile(r"dispatcher\s*(\d+)", re.IGNORECASE)


def _settings() -> tuple[str, str, str]:
    project = os.getenv("RUNDECK_AVAILABILITY_PROJECT", os.getenv("RUNDECK_PROJECT", "Linux")).strip() or "Linux"
    group = os.getenv("RUNDECK_AVAILABILITY_JOB_GROUP", "SAP/AOP").strip()
    job_filter = os.getenv("RUNDECK_AVAILABILITY_JOB_FILTER", "Service Availability Report").strip()
    if not job_filter:
        raise RuntimeError("Rundeck availability job filter is not configured")
    return project, group, job_filter


def _reader_token() -> str:
    return read_credential("rundeck-reader", "RUNDECK_TOKEN_FILE")


def _execution_matches(execution: dict, group: str, job_filter: str) -> bool:
    job = execution.get("job") or {}
    job_group = str(job.get("group") or "").strip()
    job_name = str(job.get("name") or "").strip()
    if group and job_group != group:
        return False
    return job_filter.casefold() in job_name.casefold()


def _latest_execution() -> dict:
    project, group, job_filter = _settings()
    query_data = {
        "jobFilter": job_filter,
        "adhoc": "false",
        "max": 20,
        "offset": 0,
    }
    if group:
        query_data["groupPathExact"] = group
    page = json.loads(request(
        f"/api/{API_VERSION}/project/{quote(project, safe='')}/executions?{urlencode(query_data)}",
        _reader_token(),
        "application/json",
    ))
    matches = [row for row in page.get("executions", []) if _execution_matches(row, group, job_filter)]
    completed = [row for row in matches if str(row.get("status") or "").lower() not in ("running", "scheduled")]
    if not completed:
        raise RuntimeError("No completed Rundeck Service Availability execution found")
    return max(completed, key=lambda row: int(row.get("id") or 0))


def _clean_description(value: str) -> str:
    value = value.replace("✅", " ").replace("❌", " ").replace("✔", " ").replace("✘", " ")
    return " ".join(value.split())


def _role(description: str) -> str:
    lowered = description.lower()
    if "disaster recovery" in lowered or lowered.startswith("dr ") or " dr " in f" {lowered} ":
        return "DR"
    if "secondary" in lowered:
        return "SECONDARY"
    if "primary" in lowered:
        return "PRIMARY"
    return ""


def _service_identity(endpoint: str, description: str) -> tuple[str, str]:
    lowered = description.lower()
    if "dispatcher instance" in lowered and "application server" in lowered:
        match = INSTANCE_RE.search(description)
        return "SAP_APP", f"APP{match.group(1)}" if match else endpoint.split(":", 1)[0]
    if "sap fiori/web dispatcher" in lowered:
        return "WEB_DISPATCHER", "HTTPS" if "https" in lowered else "HTTP"
    if "hana system db port" in lowered:
        return "HANA_SYSTEM_DB", _role(description) or endpoint.split(":", 1)[0]
    if "node replication internal port" in lowered:
        return "HANA_REPLICATION", _role(description) or endpoint.split(":", 1)[0]
    if lowered.startswith("ssh") or " ssh " in f" {lowered} ":
        match = DISPATCHER_RE.search(description)
        if match:
            return "SSH", f"APP{match.group(1)}"
        role = _role(description)
        return "SSH", role or endpoint.split(":", 1)[0]
    return "OTHER", endpoint


def parse_availability_report(text: str) -> list[dict]:
    services: list[dict] = []
    for raw_line in str(text or "").splitlines():
        line = ANSI_RE.sub("", raw_line).strip()
        match = SERVICE_RE.search(line)
        if not match:
            continue
        endpoint = match.group("endpoint")
        description = _clean_description(match.group("description"))
        status = match.group("status").upper()
        category, name = _service_identity(endpoint, description)
        services.append({
            "endpoint": endpoint,
            "description": description,
            "status": status,
            "category": category,
            "name": name,
        })
    return services


def _indexed(services: list[dict], category: str) -> list[dict]:
    rows = [row for row in services if row.get("category") == category]
    if category == "SAP_APP":
        return sorted(rows, key=lambda row: int(re.sub(r"\D", "", row.get("name", "")) or 999))
    return rows


def _summary(services: list[dict]) -> dict:
    apps = _indexed(services, "SAP_APP")
    app_down = [row["name"] for row in apps if row["status"] == "DOWN"]
    if app_down:
        sap_state = "CRITICAL"
    elif len(apps) >= 5 and all(row["status"] == "UP" for row in apps):
        sap_state = "NORMAL"
    elif apps:
        sap_state = "ATTENTION"
    else:
        sap_state = "UNKNOWN"
    return {
        "sap_state": sap_state,
        "sap_app_down": app_down,
        "service_count": len(services),
        "down_count": sum(1 for row in services if row["status"] == "DOWN"),
    }


def latest_availability() -> dict:
    execution = _latest_execution()
    state = str(execution.get("status") or "").lower()
    if state != "succeeded":
        raise RuntimeError(f"Latest Service Availability execution status is {state or 'unknown'}")
    execution_id = str(execution.get("id") or "").strip()
    if not execution_id.isdigit():
        raise RuntimeError("Invalid Rundeck Service Availability execution ID")

    raw = output_text(execution_id, _reader_token()).decode("utf-8", errors="replace")
    services = parse_availability_report(raw)
    if not services:
        raise RuntimeError("Service Availability output could not be parsed")

    job = execution.get("job") or {}
    finished_at = (execution.get("date-ended") or {}).get("date") or (execution.get("date-started") or {}).get("date")
    return {
        "source": "rundeck-service-availability",
        "credential_mode": credential_mode("rundeck-reader", "RUNDECK_TOKEN_FILE"),
        "execution_id": execution_id,
        "execution_status": state,
        "collected_at": finished_at,
        "job": {
            "id": job.get("id"),
            "group": job.get("group"),
            "name": job.get("name"),
        },
        "summary": _summary(services),
        "sap_app": _indexed(services, "SAP_APP"),
        "hana_system_db": _indexed(services, "HANA_SYSTEM_DB"),
        "hana_replication": _indexed(services, "HANA_REPLICATION"),
        "web_dispatcher": _indexed(services, "WEB_DISPATCHER"),
        "ssh": _indexed(services, "SSH"),
        "services": services,
    }

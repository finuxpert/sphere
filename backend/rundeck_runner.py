"""Narrow Rundeck runner used by SPHERE Collect Now.

No user supplied job ID is accepted. The only executable job is resolved from the
server-side whitelisted Rundeck project/group/name (or an explicit server-side ID).
"""
from __future__ import annotations

import json
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, urlencode
from urllib.request import ProxyHandler, Request, build_opener

from backend.rundeck_credentials import credential_mode, read_credential
from backend.rundeck_poller import API_VERSION, BASE, NoRedirect, output_text
from backend.rundeck_store import ROOT, ingest, write_json

COOLDOWN_SECONDS = int(os.getenv("RUNDECK_COLLECT_COOLDOWN_SECONDS", "300"))
WATCH_INTERVAL_SECONDS = max(2, int(os.getenv("RUNDECK_COLLECT_WATCH_INTERVAL_SECONDS", "5")))
WATCH_MAX_SECONDS = max(60, int(os.getenv("RUNDECK_COLLECT_WATCH_MAX_SECONDS", "900")))


def _token() -> str:
    return read_credential("rundeck-runner", "RUNDECK_RUNNER_TOKEN_FILE")


def _job_identity() -> tuple[str, str, str]:
    project = os.getenv("RUNDECK_PROJECT", "Linux").strip()
    group = os.getenv("RUNDECK_JOB_GROUP", "").strip()
    name = os.getenv("RUNDECK_JOB_NAME", "").strip()
    if not project or not group or not name:
        raise RuntimeError("Whitelisted Rundeck job identity is not configured")
    return project, group, name


def _request(path: str, method: str = "GET") -> dict | list:
    opener = build_opener(ProxyHandler({}), NoRedirect())
    request = Request(
        BASE + path,
        method=method,
        headers={
            "X-Rundeck-Auth-Token": _token(),
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        data=b"{}" if method == "POST" else None,
    )
    with opener.open(request, timeout=30) as response:
        if response.status not in (200, 201):
            raise RuntimeError("Unexpected Rundeck response")
        if response.headers.get_content_type() in ("text/html", "application/xhtml+xml"):
            raise RuntimeError("Rundeck returned HTML")
        return json.loads(response.read(1024 * 1024))


def _state_file() -> Path:
    return ROOT / "collect-now.json"


def _read_state() -> dict:
    path = _state_file()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _discover_job_id() -> str:
    """Resolve only the fixed server-side job identity; no browser input participates."""
    project, group, name = _job_identity()
    query = urlencode({"groupPathExact": group, "jobFilter": name})
    payload = _request(f"/api/{API_VERSION}/project/{quote(project, safe='')}/jobs?{query}")
    jobs = payload if isinstance(payload, list) else payload.get("jobs", [])
    matches = [
        item for item in jobs
        if str(item.get("group") or "").strip() == group
        and str(item.get("name") or "").strip() == name
        and str(item.get("id") or "").strip()
    ]
    if len(matches) != 1:
        raise RuntimeError("Whitelisted Rundeck job could not be resolved uniquely")
    return str(matches[0]["id"]).strip()


def _job_id() -> str:
    configured = os.getenv("RUNDECK_RUN_JOB_ID", "").strip()
    if configured:
        return configured

    project, group, name = _job_identity()
    state = _read_state()
    if (
        state.get("job_id")
        and state.get("job_project") == project
        and state.get("job_group") == group
        and state.get("job_name") == name
    ):
        return str(state["job_id"])
    return _discover_job_id()


def _expected_hosts() -> list[str]:
    hosts = [host.strip() for host in os.getenv("RUNDECK_EXPECTED_HOSTS", "").split(",") if host.strip()]
    if len(set(hosts)) != 5:
        raise RuntimeError("Exactly five expected SAP App Servers must be configured")
    return hosts


def _latest_running_job(job_id: str) -> dict | None:
    """Detect the whitelisted job even when it was started outside SPHERE."""
    page = _request(f"/api/{API_VERSION}/job/{quote(job_id, safe='')}/executions?status=running&max=20")
    executions = [
        item for item in (page.get("executions", []) if isinstance(page, dict) else [])
        if str(item.get("status") or "").lower() in ("running", "scheduled")
    ]
    if not executions:
        return None
    return max(executions, key=lambda item: int(item.get("id") or 0))


def _ingest_completed_execution(execution: dict, state: dict) -> dict:
    if str(execution.get("status") or "").lower() != "succeeded":
        return state
    execution_id = str(execution.get("id") or "").strip()
    if not execution_id or state.get("collection_id") == f"rundeck-{execution_id}":
        return state
    raw = output_text(execution_id, _token())
    result = ingest(execution, raw, _expected_hosts())
    state.update({
        "collection_id": result.get("collection_id"),
        "collection_status": result.get("status"),
        "ingested_at": datetime.now(timezone.utc).isoformat(),
        "ingest_status": "READY" if result.get("status") == "READY" else str(result.get("status") or "UNKNOWN"),
    })
    state.pop("ingest_error_type", None)
    return state


def _finalize_execution(execution: dict, state: dict) -> dict:
    status_value = str(execution.get("status") or state.get("status") or "unknown").lower()
    state["status"] = status_value
    if status_value not in ("running", "scheduled"):
        state["finished_at"] = (
            (execution.get("date-ended") or {}).get("date")
            or state.get("finished_at")
            or datetime.now(timezone.utc).isoformat()
        )
    if status_value == "succeeded" and not state.get("collection_id"):
        try:
            state = _ingest_completed_execution(execution, state)
        except Exception as error:
            # The scheduled read-only poller remains the fallback ingestion path.
            state["ingest_status"] = "PENDING_POLLER"
            state["ingest_error_type"] = type(error).__name__
    return state


def _watch_execution(execution_id: str) -> None:
    deadline = time.monotonic() + WATCH_MAX_SECONDS
    while time.monotonic() < deadline:
        try:
            execution = _request(f"/api/{API_VERSION}/execution/{execution_id}")
            if not isinstance(execution, dict):
                raise RuntimeError("Unexpected Rundeck execution payload")
            current = _read_state()
            if str(current.get("execution_id") or "") != execution_id:
                return
            current = _finalize_execution(execution, current)
            write_json(_state_file(), current)
            if current.get("status") not in ("running", "scheduled"):
                return
        except Exception as error:
            current = _read_state()
            if str(current.get("execution_id") or "") == execution_id:
                current["watch_status"] = "RETRYING"
                current["watch_error_type"] = type(error).__name__
                write_json(_state_file(), current)
        time.sleep(WATCH_INTERVAL_SECONDS)

    current = _read_state()
    if str(current.get("execution_id") or "") == execution_id:
        current["watch_status"] = "TIMED_OUT"
        write_json(_state_file(), current)


def status() -> dict:
    state = _read_state()
    auth_mode = credential_mode("rundeck-runner", "RUNDECK_RUNNER_TOKEN_FILE")
    ready = auth_mode != "missing"
    readiness_reason = "READY" if ready else "RUNNER_CREDENTIAL_MISSING"
    job_id = ""

    if ready:
        try:
            job_id = _job_id()
            project, group, name = _job_identity()
            state.update({
                "job_id": job_id,
                "job_project": project,
                "job_group": group,
                "job_name": name,
            })
        except Exception as error:
            ready = False
            readiness_reason = type(error).__name__.upper()

    execution_id = str(state.get("execution_id") or "")
    if ready and execution_id:
        try:
            execution = _request(f"/api/{API_VERSION}/execution/{execution_id}")
            if isinstance(execution, dict):
                state = _finalize_execution(execution, state)
                write_json(_state_file(), state)
        except Exception:
            state["rundeck_status_check"] = "unavailable"

    if ready and job_id:
        try:
            active = _latest_running_job(job_id)
            if active:
                state["execution_id"] = str(active.get("id") or "")
                state["status"] = str(active.get("status") or "running").lower()
                state["external_running_execution"] = state.get("requested_at") is None
        except Exception:
            state["rundeck_job_check"] = "unavailable"

    requested = _parse_time(state.get("requested_at"))
    cooldown_until = requested + timedelta(seconds=COOLDOWN_SECONDS) if requested else None
    running = state.get("status") in ("running", "scheduled")
    cooldown = bool(cooldown_until and datetime.now(timezone.utc) < cooldown_until)
    return {
        **state,
        "running": running,
        "cooldown": cooldown,
        "cooldown_seconds": COOLDOWN_SECONDS,
        "cooldown_until": cooldown_until.isoformat() if cooldown_until else None,
        "allowed": ready and not running and not cooldown,
        "ready": ready,
        "readiness_reason": readiness_reason,
        "job_id_configured": bool(os.getenv("RUNDECK_RUN_JOB_ID", "").strip()),
        "job_id_resolved": bool(job_id),
        "credential_mode": auth_mode,
    }


def collect_now(requested_by: str = "sphere", actor: str | None = None) -> dict:
    """Start only the approved collector job and return immediately.

    ``actor`` is accepted for API compatibility; it never influences job selection.
    """
    if actor:
        requested_by = actor
    current = status()
    if not current["allowed"]:
        return current
    job_id = str(current.get("job_id") or _job_id())
    execution = _request(f"/api/{API_VERSION}/job/{quote(job_id, safe='')}/run", method="POST")
    if not isinstance(execution, dict):
        raise RuntimeError("Unexpected Rundeck execution payload")
    execution_id = str(execution.get("id") or "").strip()
    if not execution_id.isdigit():
        raise RuntimeError("Rundeck did not return a valid execution ID")
    project, group, name = _job_identity()
    state = {
        "execution_id": execution_id,
        "job_id": job_id,
        "job_project": project,
        "job_group": group,
        "job_name": name,
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "requested_by": requested_by[:120],
        "status": str(execution.get("status") or "running").lower(),
        "external_running_execution": False,
        "ingest_status": "WAITING_FOR_RUNDECK",
    }
    write_json(_state_file(), state)
    threading.Thread(
        target=_watch_execution,
        args=(execution_id,),
        daemon=True,
        name=f"sphere-rundeck-{execution_id}",
    ).start()
    return status()

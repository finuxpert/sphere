"""Narrow Rundeck runner used by SPHERE Collect Now.

No user supplied job ID is accepted. Collect Now can execute only the two server-side
whitelisted SPHERE collectors: performance/work-process and service availability.
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
from backend.rundeck_store import ROOT, collections, ingest, write_json

COOLDOWN_SECONDS = int(os.getenv("RUNDECK_COLLECT_COOLDOWN_SECONDS", "300"))
WATCH_INTERVAL_SECONDS = max(2, int(os.getenv("RUNDECK_COLLECT_WATCH_INTERVAL_SECONDS", "5")))
WATCH_MAX_SECONDS = max(60, int(os.getenv("RUNDECK_COLLECT_WATCH_MAX_SECONDS", "900")))
RUNNING_STATES = {"running", "scheduled"}


def _token() -> str:
    return read_credential("rundeck-runner", "RUNDECK_RUNNER_TOKEN_FILE")


def _performance_identity() -> tuple[str, str, str]:
    project = os.getenv("RUNDECK_PROJECT", "Linux").strip()
    group = os.getenv("RUNDECK_JOB_GROUP", "").strip()
    name = os.getenv("RUNDECK_JOB_NAME", "").strip()
    if not project or not group or not name:
        raise RuntimeError("Performance collector identity is not configured")
    return project, group, name


def _availability_identity() -> tuple[str, str, str]:
    project = os.getenv("RUNDECK_AVAILABILITY_PROJECT", os.getenv("RUNDECK_PROJECT", "Linux")).strip()
    group = os.getenv("RUNDECK_AVAILABILITY_JOB_GROUP", "SAP/AOP").strip()
    name = os.getenv("RUNDECK_AVAIL_JOB_NAME", "").strip()
    if not project or not group:
        raise RuntimeError("Availability collector identity is not configured")
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


def _discover_exact_job_id(project: str, group: str, name: str) -> str:
    if not name:
        raise RuntimeError("Whitelisted Rundeck job name is not configured")
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


def _job_specs() -> dict[str, dict]:
    perf_project, perf_group, perf_name = _performance_identity()
    avail_project, avail_group, avail_name = _availability_identity()

    perf_id = os.getenv("RUNDECK_PERF_JOB_ID", os.getenv("RUNDECK_RUN_JOB_ID", "")).strip()
    avail_id = os.getenv("RUNDECK_AVAIL_JOB_ID", "").strip()
    if not perf_id:
        perf_id = _discover_exact_job_id(perf_project, perf_group, perf_name)
    if not avail_id:
        avail_id = _discover_exact_job_id(avail_project, avail_group, avail_name)

    return {
        "performance": {
            "key": "performance",
            "label": "Performance",
            "job_id": perf_id,
            "project": perf_project,
            "group": perf_group,
            "name": perf_name,
        },
        "availability": {
            "key": "availability",
            "label": "Availability",
            "job_id": avail_id,
            "project": avail_project,
            "group": avail_group,
            "name": avail_name or "Service Availability Report",
        },
    }


def _expected_hosts() -> list[str]:
    hosts = [host.strip() for host in os.getenv("RUNDECK_EXPECTED_HOSTS", "").split(",") if host.strip()]
    if len(set(hosts)) != 5:
        raise RuntimeError("Exactly five expected SAP App Servers must be configured")
    return hosts


def _latest_running_job(job_id: str) -> dict | None:
    page = _request(f"/api/{API_VERSION}/job/{quote(job_id, safe='')}/executions?status=running&max=20")
    executions = [
        item for item in (page.get("executions", []) if isinstance(page, dict) else [])
        if str(item.get("status") or "").lower() in RUNNING_STATES
    ]
    if not executions:
        return None
    return max(executions, key=lambda item: int(item.get("id") or 0))


def _source_template(spec: dict, previous: dict | None = None) -> dict:
    source = dict(previous or {})
    source.update({
        "key": spec["key"],
        "label": spec["label"],
        "job_id": spec["job_id"],
        "job_project": spec["project"],
        "job_group": spec["group"],
        "job_name": spec["name"],
    })
    return source


def _refresh_performance_from_store(source: dict) -> dict:
    execution_id = str(source.get("execution_id") or "")
    if not execution_id or source.get("collection_id"):
        return source
    row = next((item for item in collections() if str(item.get("execution_id") or "") == execution_id), None)
    if not row:
        return source
    source.update({
        "collection_id": row.get("collection_id"),
        "collection_status": row.get("status"),
        "ingest_status": "READY" if row.get("status") == "READY" else str(row.get("status") or "UNKNOWN"),
    })
    return source


def _ingest_performance_execution(execution: dict, source: dict) -> dict:
    execution_id = str(execution.get("id") or "").strip()
    if not execution_id or source.get("collection_id") == f"rundeck-{execution_id}":
        return source
    raw = output_text(execution_id, _token())
    result = ingest(execution, raw, _expected_hosts())
    source.update({
        "collection_id": result.get("collection_id"),
        "collection_status": result.get("status"),
        "ingested_at": datetime.now(timezone.utc).isoformat(),
        "ingest_status": "READY" if result.get("status") == "READY" else str(result.get("status") or "UNKNOWN"),
    })
    source.pop("ingest_error_type", None)
    return source


def _ingest_availability_execution(execution: dict, source: dict) -> dict:
    from backend.rundeck_availability import ALLOWED_CATEGORIES, _compact_snapshot, parse_availability_report

    execution_id = str(execution.get("id") or "").strip()
    if not execution_id or str(source.get("availability_execution_id") or "") == execution_id:
        return source
    raw = output_text(execution_id, _token()).decode("utf-8", errors="replace")
    services = parse_availability_report(raw)
    allowed = [row for row in services if row.get("category") in ALLOWED_CATEGORIES]
    if not allowed:
        raise RuntimeError("Service Availability output could not be parsed")
    finished_at = (execution.get("date-ended") or {}).get("date") or (execution.get("date-started") or {}).get("date")
    snapshot = _compact_snapshot({
        "execution_id": execution_id,
        "collected_at": finished_at,
        "services": services,
    })
    history_file = ROOT / "availability-history.jsonl"
    ROOT.mkdir(parents=True, exist_ok=True)
    duplicate = False
    if history_file.exists():
        try:
            with history_file.open("rb") as stream:
                stream.seek(0, 2)
                size = stream.tell()
                stream.seek(max(0, size - 8192))
                tail = stream.read().decode("utf-8", errors="ignore").splitlines()
                if tail:
                    duplicate = str(json.loads(tail[-1]).get("execution_id") or "") == execution_id
        except (OSError, json.JSONDecodeError):
            duplicate = False
    if not duplicate:
        with history_file.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(snapshot, separators=(",", ":"), sort_keys=True) + "\n")
    source.update({
        "availability_execution_id": execution_id,
        "ingested_at": datetime.now(timezone.utc).isoformat(),
        "ingest_status": "READY",
        "service_count": len(allowed),
    })
    source.pop("ingest_error_type", None)
    return source


def _finalize_source(spec: dict, execution: dict, source: dict) -> dict:
    status_value = str(execution.get("status") or source.get("status") or "unknown").lower()
    source["status"] = status_value
    if status_value not in RUNNING_STATES:
        source["finished_at"] = (
            (execution.get("date-ended") or {}).get("date")
            or source.get("finished_at")
            or datetime.now(timezone.utc).isoformat()
        )
    if status_value == "succeeded" and source.get("ingest_status") != "READY":
        try:
            source = (
                _ingest_performance_execution(execution, source)
                if spec["key"] == "performance"
                else _ingest_availability_execution(execution, source)
            )
        except Exception as error:
            source["ingest_status"] = "PENDING_POLLER" if spec["key"] == "performance" else "PENDING_REFRESH"
            source["ingest_error_type"] = type(error).__name__
    if spec["key"] == "performance":
        source = _refresh_performance_from_store(source)
    return source


def _source_ready(key: str, source: dict) -> bool:
    if str(source.get("status") or "").lower() != "succeeded":
        return False
    if key == "performance":
        return source.get("ingest_status") == "READY" and source.get("collection_status") == "READY"
    return source.get("ingest_status") == "READY"


def _bundle_status(sources: dict) -> str:
    if not sources:
        return "IDLE"
    values = [str(source.get("status") or "").lower() for source in sources.values()]
    if any(value in RUNNING_STATES for value in values):
        return "RUNNING"
    ready = sum(1 for key, source in sources.items() if _source_ready(key, source))
    if ready == len(sources) and ready > 0:
        return "READY"
    failed = sum(1 for value in values if value in {"failed", "aborted", "timedout"})
    if ready > 0 or (failed > 0 and failed < len(sources)):
        return "PARTIAL"
    if failed == len(sources) and failed > 0:
        return "FAILED"
    return "WAITING"


def _source_skew_seconds(sources: dict) -> int | None:
    stamps = [_parse_time(source.get("finished_at")) for source in sources.values()]
    if len(stamps) != 2 or any(stamp is None for stamp in stamps):
        return None
    return int(abs((stamps[0] - stamps[1]).total_seconds()))


def _watch_bundle(execution_ids: dict[str, str]) -> None:
    deadline = time.monotonic() + WATCH_MAX_SECONDS
    while time.monotonic() < deadline:
        state = _read_state()
        sources = dict(state.get("sources") or {})
        active = False
        for key, execution_id in execution_ids.items():
            source = dict(sources.get(key) or {})
            if str(source.get("execution_id") or "") != execution_id:
                continue
            try:
                execution = _request(f"/api/{API_VERSION}/execution/{execution_id}")
                if not isinstance(execution, dict):
                    raise RuntimeError("Unexpected Rundeck execution payload")
                spec = {
                    "key": key,
                    "label": source.get("label") or key.title(),
                    "job_id": source.get("job_id") or "",
                    "project": source.get("job_project") or "",
                    "group": source.get("job_group") or "",
                    "name": source.get("job_name") or "",
                }
                source = _finalize_source(spec, execution, source)
                source.pop("watch_error_type", None)
                if str(source.get("status") or "").lower() in RUNNING_STATES:
                    active = True
            except Exception as error:
                source["watch_status"] = "RETRYING"
                source["watch_error_type"] = type(error).__name__
                active = True
            sources[key] = source
        state["sources"] = sources
        state["bundle_status"] = _bundle_status(sources)
        state["source_skew_seconds"] = _source_skew_seconds(sources)
        write_json(_state_file(), state)
        if not active:
            return
        time.sleep(WATCH_INTERVAL_SECONDS)

    state = _read_state()
    state["watch_status"] = "TIMED_OUT"
    state["bundle_status"] = _bundle_status(state.get("sources") or {})
    write_json(_state_file(), state)


def status() -> dict:
    state = _read_state()
    auth_mode = credential_mode("rundeck-runner", "RUNDECK_RUNNER_TOKEN_FILE")
    ready = auth_mode != "missing"
    readiness_reason = "READY" if ready else "RUNNER_CREDENTIAL_MISSING"
    specs: dict[str, dict] = {}

    if ready:
        try:
            specs = _job_specs()
        except Exception as error:
            ready = False
            readiness_reason = type(error).__name__.upper()

    sources = dict(state.get("sources") or {})
    if ready:
        for key, spec in specs.items():
            source = _source_template(spec, sources.get(key))
            execution_id = str(source.get("execution_id") or "")
            if execution_id:
                try:
                    execution = _request(f"/api/{API_VERSION}/execution/{execution_id}")
                    if isinstance(execution, dict):
                        source = _finalize_source(spec, execution, source)
                except Exception:
                    source["rundeck_status_check"] = "unavailable"
            try:
                active = _latest_running_job(spec["job_id"])
                if active and str(source.get("status") or "").lower() not in RUNNING_STATES:
                    source["execution_id"] = str(active.get("id") or "")
                    source["status"] = str(active.get("status") or "running").lower()
                    source["external_running_execution"] = True
            except Exception:
                source["rundeck_job_check"] = "unavailable"
            if key == "performance":
                source = _refresh_performance_from_store(source)
            sources[key] = source

    state["sources"] = sources
    bundle_status = _bundle_status(sources)
    running = bundle_status == "RUNNING"
    requested = _parse_time(state.get("requested_at"))
    cooldown_until = requested + timedelta(seconds=COOLDOWN_SECONDS) if requested else None
    cooldown = bool(cooldown_until and datetime.now(timezone.utc) < cooldown_until)
    source_skew = _source_skew_seconds(sources)
    performance = sources.get("performance") or {}

    result = {
        **state,
        "sources": sources,
        "bundle_status": bundle_status,
        "source_skew_seconds": source_skew,
        "running": running,
        "cooldown": cooldown,
        "cooldown_seconds": COOLDOWN_SECONDS,
        "cooldown_until": cooldown_until.isoformat() if cooldown_until else None,
        "allowed": ready and not running and not cooldown,
        "ready": ready,
        "readiness_reason": readiness_reason,
        "jobs_resolved": {key: bool(spec.get("job_id")) for key, spec in specs.items()},
        "credential_mode": auth_mode,
        # Backward-compatible performance fields used by the existing header UI.
        "execution_id": performance.get("execution_id"),
        "job_id": performance.get("job_id"),
        "job_project": performance.get("job_project"),
        "job_group": performance.get("job_group"),
        "job_name": performance.get("job_name"),
        "job_id_configured": bool(os.getenv("RUNDECK_PERF_JOB_ID", os.getenv("RUNDECK_RUN_JOB_ID", "")).strip()),
        "job_id_resolved": bool(performance.get("job_id")),
    }
    if state:
        write_json(_state_file(), {key: value for key, value in result.items() if key not in {
            "running", "cooldown", "cooldown_seconds", "cooldown_until", "allowed", "ready",
            "readiness_reason", "jobs_resolved", "credential_mode", "job_id_configured", "job_id_resolved",
        }})
    return result


def collect_now(requested_by: str = "sphere", actor: str | None = None) -> dict:
    """Start the two approved collectors as one bundle and return immediately."""
    if actor:
        requested_by = actor
    current = status()
    if not current["allowed"]:
        return current

    specs = _job_specs()
    state = {
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "requested_by": requested_by[:120],
        "bundle_status": "STARTING",
        "sources": {},
    }
    execution_ids: dict[str, str] = {}

    for key, spec in specs.items():
        source = _source_template(spec)
        source["ingest_status"] = "WAITING_FOR_RUNDECK"
        try:
            execution = _request(f"/api/{API_VERSION}/job/{quote(spec['job_id'], safe='')}/run", method="POST")
            if not isinstance(execution, dict):
                raise RuntimeError("Unexpected Rundeck execution payload")
            execution_id = str(execution.get("id") or "").strip()
            if not execution_id.isdigit():
                raise RuntimeError("Rundeck did not return a valid execution ID")
            source.update({
                "execution_id": execution_id,
                "status": str(execution.get("status") or "running").lower(),
                "external_running_execution": False,
            })
            execution_ids[key] = execution_id
        except Exception as error:
            source.update({
                "status": "failed",
                "ingest_status": "NOT_STARTED",
                "launch_error_type": type(error).__name__,
                "finished_at": datetime.now(timezone.utc).isoformat(),
            })
        state["sources"][key] = source

    state["bundle_status"] = _bundle_status(state["sources"])
    state["source_skew_seconds"] = _source_skew_seconds(state["sources"])
    write_json(_state_file(), state)

    if execution_ids:
        threading.Thread(
            target=_watch_bundle,
            args=(execution_ids,),
            daemon=True,
            name="sphere-rundeck-collect-bundle",
        ).start()
    else:
        raise RuntimeError("Neither approved Rundeck collector could be started")

    return status()

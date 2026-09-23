"""Read, normalize and retain the existing Rundeck Service Availability report.

Availability is determined from the operational port checks already executed by Rundeck.
Resource changes in SPHERE remain supporting evidence and are not used here to infer UP/DOWN.
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timedelta, timezone
from statistics import median
from pathlib import Path
from urllib.parse import quote, urlencode

from backend.rundeck_credentials import credential_mode, read_credential
from backend.rundeck_poller import API_VERSION, request, output_text
from backend.rundeck_store import ROOT

ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
SERVICE_RE = re.compile(
    r"(?P<endpoint>(?:[A-Za-z0-9._-]+|(?:\d{1,3}\.){3}\d{1,3}):\d+)\s+"
    r"(?P<description>.+?)\s+(?:✅|❌|✔|✘|\[?OK\]?|\[?FAIL\]?\s*)?"
    r"(?P<status>UP|DOWN)\s*$",
    re.IGNORECASE,
)
INSTANCE_RE = re.compile(r"instance\s*(\d+)", re.IGNORECASE)
DISPATCHER_RE = re.compile(r"dispatcher\s*(\d+)", re.IGNORECASE)
RANGE_HOURS = {"30m": 0.5, "1h": 1, "3h": 3, "6h": 6, "24h": 24, "7d": 168, "30d": 720}
ALLOWED_CATEGORIES = {"SAP_APP", "HANA_SYSTEM_DB", "HANA_REPLICATION", "SSH", "WEB_DISPATCHER"}
SERVICE_CATEGORIES = {"SAP_APP", "HANA_SYSTEM_DB", "WEB_DISPATCHER"}
TECHNICAL_CATEGORIES = {"HANA_REPLICATION", "SSH"}
CATEGORY_LABEL = {
    "SAP_APP": "SAP App",
    "HANA_SYSTEM_DB": "HANA",
    "HANA_REPLICATION": "Replication",
    "SSH": "SSH",
    "WEB_DISPATCHER": "Web",
}
CATEGORY_METRIC_LABEL = {
    "SAP_APP": "SAP App Availability",
    "HANA_SYSTEM_DB": "HANA System DB Availability",
    "HANA_REPLICATION": "HANA Replication Availability",
    "SSH": "SSH Reachability",
    "WEB_DISPATCHER": "Web Dispatcher Availability",
}
HISTORY_FILE = ROOT / "availability-history.jsonl"
AVAILABILITY_GAP_FACTOR = max(1.5, float(os.getenv("SPHERE_AVAILABILITY_GAP_FACTOR", "2.2")))


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
    role_order = {"PRIMARY": 0, "SECONDARY": 1, "DR": 2, "HTTP": 0, "HTTPS": 1}
    return sorted(rows, key=lambda row: (role_order.get(str(row.get("name") or ""), 50), str(row.get("name") or "")))


def _status_by_name(services: list[dict], category: str) -> dict[str, str]:
    return {
        str(row.get("name") or "UNKNOWN").upper(): str(row.get("status") or "UNKNOWN").upper()
        for row in _indexed(services, category)
    }


def _issue_labels(services: list[dict]) -> list[str]:
    down = [row for row in services if row.get("category") in ALLOWED_CATEGORIES and str(row.get("status") or "").upper() == "DOWN"]
    labels: list[str] = []

    apps = [str(row.get("name") or "SAP App") for row in down if row.get("category") == "SAP_APP"]
    labels.extend(f"{name} DOWN" for name in apps)

    hana_down = {str(row.get("name") or "UNKNOWN").upper() for row in down if row.get("category") == "HANA_SYSTEM_DB"}
    replication_down = {str(row.get("name") or "UNKNOWN").upper() for row in down if row.get("category") == "HANA_REPLICATION"}
    for role in ("PRIMARY", "SECONDARY", "DR"):
        if role in hana_down and role in replication_down:
            labels.append(f"{role.title()} service + replication DOWN")
        elif role in hana_down:
            labels.append(f"HANA {role.title()} DOWN")
        elif role in replication_down:
            labels.append(f"{role.title()} replication DOWN")

    web = [str(row.get("name") or "Web") for row in down if row.get("category") == "WEB_DISPATCHER"]
    labels.extend(f"Web {name} DOWN" for name in web)

    ssh = [str(row.get("name") or "SSH") for row in down if row.get("category") == "SSH"]
    labels.extend(f"{name} SSH DOWN" for name in ssh)
    return labels


def _issue_text(labels: list[str]) -> str:
    if not labels:
        return ""
    if len(labels) <= 2:
        return " · ".join(labels)
    return f"{' · '.join(labels[:2])} · +{len(labels) - 2}"


def summarize_services(services: list[dict]) -> dict:
    tracked = [row for row in services if row.get("category") in ALLOWED_CATEGORIES]
    apps = _indexed(services, "SAP_APP")
    app_down = [row["name"] for row in apps if row["status"] == "DOWN"]
    service_down = [row for row in tracked if row.get("category") in SERVICE_CATEGORIES and row.get("status") == "DOWN"]
    technical_down = [row for row in tracked if row.get("category") in TECHNICAL_CATEGORIES and row.get("status") == "DOWN"]
    any_down = service_down or technical_down
    labels = _issue_labels(services)

    if app_down:
        service_state = "CRITICAL"
    elif any_down:
        service_state = "ATTENTION"
    elif tracked and all(row.get("status") == "UP" for row in tracked):
        service_state = "NORMAL"
    elif tracked:
        service_state = "ATTENTION"
    else:
        service_state = "UNKNOWN"

    return {
        "service_state": service_state,
        "sap_state": "CRITICAL" if app_down else ("NORMAL" if apps and all(row["status"] == "UP" for row in apps) else "ATTENTION" if apps else "UNKNOWN"),
        "sap_app_down": app_down,
        "service_count": len(tracked),
        "down_count": len(service_down) + len(technical_down),
        "service_down_count": len(service_down),
        "technical_down_count": len(technical_down),
        "supporting_down_count": len(technical_down),
        "issue_labels": labels,
        "issue_text": _issue_text(labels),
        "hana": _status_by_name(services, "HANA_SYSTEM_DB"),
        "replication": _status_by_name(services, "HANA_REPLICATION"),
        "web": _status_by_name(services, "WEB_DISPATCHER"),
    }


def _parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _compact_snapshot(payload: dict) -> dict:
    return {
        "execution_id": payload.get("execution_id"),
        "collected_at": payload.get("collected_at"),
        "services": [
            {
                "category": row.get("category"),
                "name": row.get("name"),
                "status": row.get("status"),
            }
            for row in payload.get("services", [])
            if row.get("category") in ALLOWED_CATEGORIES
        ],
    }


def _persist_snapshot(payload: dict) -> None:
    snapshot = _compact_snapshot(payload)
    if not snapshot.get("execution_id") or not snapshot.get("collected_at"):
        return
    ROOT.mkdir(parents=True, exist_ok=True)
    last_execution = None
    if HISTORY_FILE.exists():
        try:
            with HISTORY_FILE.open("rb") as stream:
                stream.seek(0, 2)
                size = stream.tell()
                stream.seek(max(0, size - 8192))
                tail = stream.read().decode("utf-8", errors="ignore").splitlines()
                if tail:
                    last_execution = json.loads(tail[-1]).get("execution_id")
        except (OSError, json.JSONDecodeError):
            last_execution = None
    if str(last_execution or "") == str(snapshot["execution_id"]):
        return
    try:
        with HISTORY_FILE.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(snapshot, separators=(",", ":"), sort_keys=True) + "\n")
    except OSError:
        return


def _history_snapshots(hours: float) -> list[dict]:
    if not HISTORY_FILE.exists():
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    rows: list[dict] = []
    try:
        with HISTORY_FILE.open("r", encoding="utf-8") as stream:
            for line in stream:
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                stamp = _parse_timestamp(row.get("collected_at"))
                if stamp and stamp.astimezone(timezone.utc) >= cutoff:
                    rows.append(row)
    except OSError:
        return []
    return rows


def _category_snapshots(snapshots: list[dict], category: str) -> list[dict]:
    """Keep snapshots that actually contain an observation for the requested category."""
    selected = []
    for snapshot in snapshots:
        if any(str(row.get("category") or "").upper() == category for row in snapshot.get("services", [])):
            selected.append(snapshot)
    return selected


def availability_observation_profile(
    snapshots: list[dict],
    requested_since: datetime | None = None,
    fallback_seconds: int | None = None,
) -> dict:
    """Describe observation coverage without equating missing samples to DOWN.

    Service Availability history is evidence observed by SPHERE. Cadence is derived
    from retained execution timestamps when possible; the configured value is only a
    fallback. Gaps therefore mean NO OBSERVATION, never inferred downtime.
    """
    fallback = max(60, int(fallback_seconds or os.getenv("SPHERE_AVAILABILITY_CADENCE_SECONDS", "600")))
    stamps = sorted({
        stamp.astimezone(timezone.utc)
        for snapshot in snapshots
        if (stamp := _parse_timestamp(snapshot.get("collected_at")))
    })
    deltas = [
        int((right - left).total_seconds())
        for left, right in zip(stamps, stamps[1:])
        if (right - left).total_seconds() >= 60
    ]
    expected = max(60, int(round(median(deltas) / 60.0) * 60)) if deltas else fallback
    threshold = max(expected + 60, int(round(expected * AVAILABILITY_GAP_FACTOR)))

    gaps = []
    for left, right in zip(stamps, stamps[1:]):
        delta = int((right - left).total_seconds())
        if delta <= threshold:
            continue
        missing_from = left + timedelta(seconds=expected)
        missing_to = right - timedelta(seconds=expected)
        if missing_to <= missing_from:
            missing_from = left
            missing_to = right
        estimated_missing = max(1, int(round(delta / expected)) - 1)
        gaps.append({
            "kind": "NO_OBSERVATION",
            "from": missing_from.isoformat(),
            "to": missing_to.isoformat(),
            "between_observations_seconds": delta,
            "duration_seconds": max(0, int((missing_to - missing_from).total_seconds())),
            "estimated_missing_checks": estimated_missing,
        })

    history_started = stamps[0] if stamps else None
    latest = stamps[-1] if stamps else None
    requested = requested_since.astimezone(timezone.utc) if requested_since else None
    coverage_limited = bool(
        requested and history_started and
        (history_started - requested).total_seconds() > threshold
    )
    return {
        "expected_cadence_seconds": expected,
        "gap_threshold_seconds": threshold,
        "observation_gaps": gaps,
        "history_started_at": history_started.isoformat() if history_started else None,
        "latest_observation_at": latest.isoformat() if latest else None,
        "coverage_limited": coverage_limited,
        "range_started_at": requested.isoformat() if requested else None,
        "semantics": "OBSERVED_AVAILABILITY",
    }


def availability_change_events(snapshots: list[dict], since=None, limit: int | None = None, category: str | None = None) -> list[dict]:
    cutoff = _parse_timestamp(since) if isinstance(since, str) else since
    category_filter = str(category or "").upper()
    previous: dict[tuple[str, str], str] = {}
    events: list[dict] = []
    ordered = sorted(snapshots, key=lambda row: _parse_timestamp(row.get("collected_at")) or datetime.min.replace(tzinfo=timezone.utc))
    for snapshot in ordered:
        stamp = _parse_timestamp(snapshot.get("collected_at"))
        if not stamp:
            continue
        for service in snapshot.get("services", []):
            service_category = str(service.get("category") or "").upper()
            name = str(service.get("name") or "UNKNOWN").upper()
            status = str(service.get("status") or "UNKNOWN").upper()
            if service_category not in ALLOWED_CATEGORIES or status not in {"UP", "DOWN"}:
                continue
            key = (service_category, name)
            before = previous.get(key)
            previous[key] = status
            if cutoff and stamp < cutoff:
                continue
            if category_filter and service_category != category_filter:
                continue
            if before is None and status != "DOWN":
                continue
            if before == status:
                continue
            label = f"{CATEGORY_LABEL.get(service_category, service_category)} {name}"
            events.append({
                "at": stamp.astimezone(timezone.utc).isoformat(),
                "execution_id": snapshot.get("execution_id"),
                "category": service_category,
                "name": name,
                "from": before or "UNKNOWN",
                "to": status,
                "kind": "observed-down" if before is None else "transition",
                "title": f"{label} {'observed DOWN' if before is None else f'{before} → {status}'}",
            })
    return events[-limit:] if limit and limit > 0 else events


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
    payload = {
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
        "summary": summarize_services(services),
        "sap_app": _indexed(services, "SAP_APP"),
        "hana_system_db": _indexed(services, "HANA_SYSTEM_DB"),
        "hana_replication": _indexed(services, "HANA_REPLICATION"),
        "web_dispatcher": _indexed(services, "WEB_DISPATCHER"),
        "ssh": _indexed(services, "SSH"),
        "services": services,
    }
    _persist_snapshot(payload)
    payload["recent_changes"] = availability_change_events(_history_snapshots(24), limit=8)
    return payload


def availability_history(range_key: str = "24h", category: str = "SAP_APP") -> dict:
    if range_key not in RANGE_HOURS:
        raise ValueError("Unsupported availability range")
    category = str(category or "SAP_APP").upper()
    if category not in ALLOWED_CATEGORIES:
        raise ValueError("Unsupported availability category")

    latest_availability()
    requested_since = datetime.now(timezone.utc) - timedelta(hours=RANGE_HOURS[range_key])
    snapshots = _history_snapshots(RANGE_HOURS[range_key])
    category_snapshots = _category_snapshots(snapshots, category)
    profile = availability_observation_profile(category_snapshots, requested_since=requested_since)
    items: list[dict] = []
    counters: dict[str, dict[str, int]] = {}
    for snapshot in category_snapshots:
        bucket = snapshot.get("collected_at")
        for row in snapshot.get("services", []):
            if row.get("category") != category:
                continue
            name = str(row.get("name") or "UNKNOWN")
            status = str(row.get("status") or "UNKNOWN").upper()
            if status not in {"UP", "DOWN"}:
                continue
            value = 100 if status == "UP" else 0
            items.append({
                "bucket": bucket,
                "host": name,
                "avg_value": value,
                "max_value": value,
                "status": status,
                "execution_id": snapshot.get("execution_id"),
            })
            counter = counters.setdefault(name, {"up": 0, "down": 0})
            counter["up" if status == "UP" else "down"] += 1

    uptime = []
    for name, counts in sorted(counters.items()):
        checks = counts["up"] + counts["down"]
        uptime.append({
            "name": name,
            "checks": checks,
            "up": counts["up"],
            "down": counts["down"],
            "uptime_pct": round((counts["up"] / checks) * 100, 2) if checks else None,
        })

    return {
        "range": range_key,
        "category": category,
        "metric": "availability",
        "metric_label": CATEGORY_METRIC_LABEL.get(category, "Availability"),
        "unit": "%",
        "bucket_interval_seconds": profile["expected_cadence_seconds"],
        "expected_cadence_seconds": profile["expected_cadence_seconds"],
        "gap_threshold_seconds": profile["gap_threshold_seconds"],
        "observation_gaps": profile["observation_gaps"],
        "coverage_limited": profile["coverage_limited"],
        "range_started_at": profile["range_started_at"],
        "history_started_at": profile["history_started_at"],
        "latest_observation_at": profile["latest_observation_at"],
        "observation_semantics": profile["semantics"],
        "warning": None,
        "critical": None,
        "items": items,
        "uptime": uptime,
        "transitions": availability_change_events(category_snapshots, category=category),
        "note": "Observed availability from retained Service Availability executions. Missing observations are UNKNOWN/NO OBSERVATION and are never inferred as DOWN.",
    }
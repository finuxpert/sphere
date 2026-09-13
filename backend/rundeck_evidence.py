"""Cross-source operational evidence for SPHERE Rundeck monitoring.

This module aligns SAP performance observations, selected workload history and
retained Service Availability snapshots. It provides supporting evidence only;
it does not assign root cause.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from backend.rundeck_availability import (
    RANGE_HOURS,
    _history_snapshots,
    availability_change_events,
    latest_availability,
)
from backend.rundeck_incident import performance_incident_summary
from backend.rundeck_job_history import sap_job_history

MAX_SKEW_MINUTES = max(1, int(os.getenv("SPHERE_CORRELATION_MAX_SKEW_MIN", "20")))
WORKLOAD_LOOKBACK_DAYS = max(1, min(90, int(os.getenv("SPHERE_EVIDENCE_WORKLOAD_LOOKBACK_DAYS", "90"))))
WORKLOAD_GAP_MINUTES = max(5, int(os.getenv("SPHERE_EVIDENCE_WORKLOAD_GAP_MINUTES", "25")))
DEFAULT_AVAILABILITY_RANGE = os.getenv("SPHERE_EVIDENCE_AVAILABILITY_RANGE", "7d")
if DEFAULT_AVAILABILITY_RANGE not in RANGE_HOURS:
    DEFAULT_AVAILABILITY_RANGE = "7d"


def _dt(value):
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _iso(value):
    parsed = _dt(value)
    return parsed.astimezone(timezone.utc).isoformat() if parsed else None


def source_alignment(source_times: dict, max_skew_minutes: int | None = None) -> dict:
    threshold = int(max_skew_minutes or MAX_SKEW_MINUTES)
    available = {}
    for name, value in source_times.items():
        parsed = _dt(value)
        if parsed:
            available[name] = parsed
    if not available:
        return {"state": "INSUFFICIENT DATA", "max_skew_minutes": None, "threshold_minutes": threshold, "sources": []}
    newest = max(available.values())
    oldest = min(available.values())
    skew = round((newest - oldest).total_seconds() / 60.0, 1)
    state = "ALIGNED" if len(available) >= 2 and skew <= threshold else "LIMITED" if len(available) >= 2 else "INSUFFICIENT DATA"
    sources = [{
        "name": name,
        "observed_at": value.astimezone(timezone.utc).isoformat(),
        "delta_minutes": round((newest - value).total_seconds() / 60.0, 1),
        "within_window": (newest - value).total_seconds() / 60.0 <= threshold,
    } for name, value in sorted(available.items())]
    return {
        "state": state,
        "max_skew_minutes": skew,
        "threshold_minutes": threshold,
        "reference_at": newest.astimezone(timezone.utc).isoformat(),
        "sources": sources,
    }


def _latest_episode(items: list[dict]) -> list[dict]:
    ordered = sorted(
        [row for row in items if _dt(row.get("collected_at"))],
        key=lambda row: _dt(row.get("collected_at")),
    )
    if not ordered:
        return []
    episodes = []
    current = []
    for row in ordered:
        stamp = _dt(row.get("collected_at"))
        previous = _dt(current[-1].get("collected_at")) if current else None
        if current and stamp and previous and stamp - previous > timedelta(minutes=WORKLOAD_GAP_MINUTES):
            episodes.append(current)
            current = []
        current.append(row)
    if current:
        episodes.append(current)
    return episodes[-1]


def _num(value, digits=1):
    try:
        return f"{float(value):.{digits}f}"
    except (TypeError, ValueError):
        return "—"


def _workload(incident: dict, job: str | None, host: str | None, consumer_type: str | None):
    current = incident.get("current_workload") or {}
    key = str(job or current.get("consumer_key") or "").strip()
    if not key:
        return None
    resolved_host = str(host or incident.get("affected_server") or "").strip() or None
    resolved_type = str(consumer_type or current.get("consumer_type") or "").strip().upper() or None
    since = datetime.now(timezone.utc) - timedelta(days=WORKLOAD_LOOKBACK_DAYS)
    try:
        history = sap_job_history(key, since, host=resolved_host, consumer_type=resolved_type, limit=1000)
    except RuntimeError:
        return {"consumer_key": key, "consumer_type": resolved_type, "host": resolved_host, "checks": 0, "first_seen": None, "last_seen": None, "items": []}
    episode = _latest_episode(history.get("items") or [])
    first_seen = _dt(episode[0].get("collected_at")) if episode else None
    last_seen = _dt(episode[-1].get("collected_at")) if episode else None
    return {
        "consumer_key": key,
        "consumer_type": resolved_type or history.get("consumer_type"),
        "host": resolved_host,
        "checks": len(episode),
        "first_seen": _iso(first_seen),
        "last_seen": _iso(last_seen),
        "items": list(reversed(episode)),
    }


def _availability_evidence(snapshots: list[dict], since=None) -> list[dict]:
    events = []
    for change in availability_change_events(snapshots, since=since):
        events.append({
            "at": change.get("at"),
            "source": "Availability",
            "kind": f"availability-{change.get('kind') or 'transition'}",
            "state": change.get("to") or "UNKNOWN",
            "title": change.get("title") or "Availability changed",
            "detail": "Retained Rundeck availability observation.",
        })
    return events


def evidence_timeline(job=None, host=None, consumer_type=None, availability_range=DEFAULT_AVAILABILITY_RANGE) -> dict:
    if availability_range not in RANGE_HOURS:
        raise ValueError("Unsupported availability range")

    incident = performance_incident_summary()
    workload = _workload(incident, job, host, consumer_type)

    availability_error = None
    try:
        latest_availability()
        snapshots = _history_snapshots(RANGE_HOURS[availability_range])
    except Exception as error:
        snapshots = []
        availability_error = type(error).__name__

    issue_start = _dt(incident.get("signal_active_since"))
    availability_since = issue_start - timedelta(hours=2) if issue_start else None
    availability_events = _availability_evidence(snapshots, availability_since)
    latest_availability_snapshot = snapshots[-1] if snapshots else None

    performance_at = incident.get("last_observed") or incident.get("collection_finished_at")
    workload_at = workload.get("last_seen") if workload else None
    availability_at = latest_availability_snapshot.get("collected_at") if latest_availability_snapshot else None
    alignment = source_alignment({"Performance": performance_at, "Workload": workload_at, "Availability": availability_at})

    events = []
    signal = incident.get("primary_signal") or {}
    if incident.get("active") and issue_start:
        events.append({
            "at": _iso(issue_start),
            "source": "SAP Signal",
            "kind": "issue-start",
            "state": incident.get("status") or signal.get("severity") or "ATTENTION",
            "title": f"{signal.get('label') or 'SAP performance signal'} started",
            "detail": f"{incident.get('affected_server') or 'SAP App'} · current continuous issue window.",
        })

    if workload and workload.get("first_seen"):
        events.append({
            "at": workload["first_seen"],
            "source": "Workload",
            "kind": "workload-first-seen",
            "state": "OBSERVED",
            "title": f"{workload.get('consumer_key')} first observed",
            "detail": f"{workload.get('checks')} checks in the latest continuous episode on {workload.get('host') or 'SAP App'}.",
        })

    if workload and workload.get("items"):
        latest_row = workload["items"][0]
        details = latest_row.get("details") or {}
        pss = details.get("total_pss_gb") if details.get("total_pss_gb") is not None else details.get("pss_gb")
        events.append({
            "at": _iso(latest_row.get("collected_at")),
            "source": "Workload",
            "kind": "workload-latest",
            "state": "OBSERVED",
            "title": f"{workload.get('consumer_key')} observed",
            "detail": f"CPU {_num(latest_row.get('cpu_pct'))}% · PSS {_num(pss, 2)} GB.",
        })

    metrics = incident.get("current_host_metrics") or {}
    if _dt(performance_at):
        events.append({
            "at": _iso(performance_at),
            "source": "Host",
            "kind": "host-latest",
            "state": metrics.get("resource_health") or ("WARNING" if incident.get("host_resource_pressure") else "NORMAL"),
            "title": f"{incident.get('affected_server') or 'SAP App'} host observed",
            "detail": f"CPU {_num(metrics.get('cpu_pct'))}% · Memory {_num(metrics.get('ram_pct'))}% · I/O Wait {_num(metrics.get('io_wait_pct'))}% · Critical WP {_num(metrics.get('wp_critical'), 0)}.",
        })

    events.extend(availability_events)
    events = [row for row in events if row.get("at")]
    events.sort(key=lambda row: _dt(row.get("at")) or datetime.min.replace(tzinfo=timezone.utc))
    events = events[-16:]

    interpretation = []
    if issue_start and workload and _dt(workload.get("first_seen")):
        first = _dt(workload.get("first_seen"))
        if first < issue_start:
            minutes = int((issue_start - first).total_seconds() // 60)
            interpretation.append(f"Selected workload was already observed {minutes // 60}h {minutes % 60}m before the current issue window.")
    if alignment.get("state") == "LIMITED":
        interpretation.append(f"Source timing exceeds the {alignment.get('threshold_minutes')} minute alignment window.")
    elif alignment.get("state") == "INSUFFICIENT DATA":
        interpretation.append("Cross-source timing needs at least two timestamped sources.")

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "correlation_mode": "supporting-evidence",
        "incident": {
            "active": bool(incident.get("active")),
            "status": incident.get("status"),
            "affected_server": incident.get("affected_server"),
            "signal_active_since": _iso(incident.get("signal_active_since")),
            "last_observed": _iso(incident.get("last_observed")),
            "primary_signal": signal,
        },
        "selected_workload": {key: value for key, value in (workload or {}).items() if key != "items"} if workload else None,
        "alignment": alignment,
        "summary": {
            "alignment": alignment.get("state"),
            "source_skew_minutes": alignment.get("max_skew_minutes"),
            "event_count": len(events),
            "availability_change_count": len(availability_events),
            "workload_checks": int(workload.get("checks") or 0) if workload else 0,
        },
        "coverage": {
            "workload_observations": int(workload.get("checks") or 0) if workload else 0,
            "availability_snapshots": len(snapshots),
            "availability_history_started_at": _iso(snapshots[0].get("collected_at")) if snapshots else None,
            "availability_error": availability_error,
        },
        "events": events,
        "interpretation": interpretation,
        "note": "Timing and co-observation are supporting evidence only; root cause still requires SAP and infrastructure validation.",
    }
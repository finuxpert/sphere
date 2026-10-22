"""Calendar-month CPU/RAM pressure and same-host workload co-observation.

All evidence originates in retained READY Rundeck collections. Pressure is based
on host CPU/RAM percentages, not process PSS, and must never imply SAP response
time or workload-level root cause. No data is extrapolated over collector gaps.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from statistics import median
from zoneinfo import ZoneInfo
from typing import Any

from sqlalchemy import text

from backend.rundeck_monitoring import CPU_WARNING, CPU_CRITICAL, RAM_WARNING, RAM_CRITICAL


def _rounded(value: Any, precision: int = 1) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), precision)
    except (TypeError, ValueError):
        return None


def detect_pressure_episodes(samples: list[dict], metric: str, warning: float) -> list[dict]:
    """Split pressure runs on healthy samples, missing values or collector gaps.

    Episode timestamps are first/last observed sample times, never inferred
    start/end or duration. A gap must not be silently treated as pressure.
    """
    if metric not in {"cpu_pct", "ram_pct"}:
        raise ValueError("Unsupported pressure metric")
    by_host: dict[str, list[dict]] = defaultdict(list)
    for sample in samples:
        if sample.get("host") and isinstance(sample.get("collected_at"), datetime):
            by_host[str(sample["host"])].append(sample)
    episodes: list[dict] = []
    for host, rows in by_host.items():
        rows.sort(key=lambda item: item["collected_at"])
        intervals = [
            (right["collected_at"] - left["collected_at"]).total_seconds()
            for left, right in zip(rows, rows[1:])
            if 0 < (right["collected_at"] - left["collected_at"]).total_seconds() <= 3600
        ]
        gap_limit = min(3600, max(600, (median(intervals) if intervals else 600) * 1.8))
        active = None

        def finish() -> None:
            if active is not None:
                episodes.append(active.copy())

        for row in rows:
            at = row["collected_at"]
            value = row.get(metric)
            eligible = value is not None and float(value) >= warning
            contiguous = active and 0 < (at - active["last_at"]).total_seconds() <= gap_limit
            if not eligible:
                finish()
                active = None
                continue
            if not contiguous:
                finish()
                active = {
                    "host": host,
                    "first_at": at,
                    "last_at": at,
                    "peak_pct": float(value),
                    "peak_at": at,
                    "observed_host_checks": 0,
                }
            active["last_at"] = at
            active["observed_host_checks"] += 1
            if float(value) > active["peak_pct"]:
                active["peak_pct"] = float(value)
                active["peak_at"] = at
        finish()
    episodes.sort(key=lambda row: (-row["peak_pct"], row["first_at"]))
    return [{
        **episode,
        "peak_pct": _rounded(episode["peak_pct"]),
    } for episode in episodes]


def monthly_pressure_observations(conn, start: datetime, end: datetime, source: str, complete_clause: str) -> dict:
    """Return resource pressure observations and correlated retained workloads.

    Queries are bounded to the chosen WIB calendar-month window and join by
    committed collection ID + exact APP host. Filters use the existing SPHERE
    warning threshold configuration.
    """
    params = {
        "start": start, "end": end,
        "cpu_warning": CPU_WARNING, "cpu_critical": CPU_CRITICAL,
        "ram_warning": RAM_WARNING, "ram_critical": RAM_CRITICAL,
    }
    samples = [dict(row) for row in conn.execute(text(f"""
        SELECT hm.collection_id, hm.host, hm.collected_at,
               hm.cpu_pct, hm.ram_pct, hm.wp_critical
          FROM rundeck_host_metrics hm
          JOIN rundeck_collections c ON c.collection_id = hm.collection_id
         WHERE {complete_clause}
           AND COALESCE(c.finished_at, c.started_at) >= :start
           AND COALESCE(c.finished_at, c.started_at) < :end
           AND hm.collected_at >= :start AND hm.collected_at < :end
         ORDER BY hm.host, hm.collected_at
    """), params).mappings().all()]
    cpu_episodes = detect_pressure_episodes(samples, "cpu_pct", CPU_WARNING)
    ram_episodes = detect_pressure_episodes(samples, "ram_pct", RAM_WARNING)

    hosts: dict[str, dict] = {}
    for row in samples:
        host = str(row["host"])
        values = hosts.setdefault(host, {
            "host": host, "complete_host_checks": 0,
            "cpu_values": [], "ram_values": [], "critical_wp_host_checks": 0,
            "cpu_warning_host_checks": 0, "ram_warning_host_checks": 0,
        })
        values["complete_host_checks"] += 1
        if row.get("cpu_pct") is not None:
            cpu = float(row["cpu_pct"])
            values["cpu_values"].append(cpu)
            if cpu >= CPU_WARNING:
                values["cpu_warning_host_checks"] += 1
        if row.get("ram_pct") is not None:
            ram = float(row["ram_pct"])
            values["ram_values"].append(ram)
            if ram >= RAM_WARNING:
                values["ram_warning_host_checks"] += 1
        if row.get("wp_critical") is not None and row["wp_critical"] > 0:
            values["critical_wp_host_checks"] += 1

    # Daily APP-host peak/average (not global daily averages). Missing days stay absent.
    host_days: dict[tuple[str, str], dict] = {}
    for row in samples:
        day = row["collected_at"].astimezone(ZoneInfo("Asia/Jakarta")).date().isoformat()
        key = (day, str(row["host"]))
        item = host_days.setdefault(key, {
            "day": day, "host": str(row["host"]), "cpu_values": [], "ram_values": [],
        })
        if row.get("cpu_pct") is not None:
            item["cpu_values"].append(float(row["cpu_pct"]))
        if row.get("ram_pct") is not None:
            item["ram_values"].append(float(row["ram_pct"]))
    daily_hosts = []
    for item in host_days.values():
        cpu, ram = item["cpu_values"], item["ram_values"]
        daily_hosts.append({
            "day": item["day"], "host": item["host"],
            "avg_cpu_pct": _rounded(sum(cpu) / len(cpu)) if cpu else None,
            "peak_cpu_pct": _rounded(max(cpu)) if cpu else None,
            "avg_ram_pct": _rounded(sum(ram) / len(ram)) if ram else None,
            "peak_ram_pct": _rounded(max(ram)) if ram else None,
        })
    daily_hosts.sort(key=lambda row: (row["day"], row["host"]))

    host_summary = []
    for values in hosts.values():
        cpu, ram = values.pop("cpu_values"), values.pop("ram_values")
        values.update({
            "avg_cpu_pct": _rounded(sum(cpu) / len(cpu)) if cpu else None,
            "peak_cpu_pct": _rounded(max(cpu)) if cpu else None,
            "avg_ram_pct": _rounded(sum(ram) / len(ram)) if ram else None,
            "peak_ram_pct": _rounded(max(ram)) if ram else None,
        })
        host_summary.append(values)
    host_summary.sort(key=lambda row: row["host"])

    # All retained workload identities may be correlated, not just previously
    # persisted "Top Consumers"; missing workload names remain unknown.
    correlation_rows = conn.execute(text(f"""
        SELECT tc.consumer_type, tc.consumer_key,
               COUNT(DISTINCT (tc.collection_id, tc.host))
                   FILTER (WHERE hm.cpu_pct >= :cpu_warning) AS cpu_pressure_host_checks,
               COUNT(DISTINCT (tc.collection_id, tc.host))
                   FILTER (WHERE hm.ram_pct >= :ram_warning) AS ram_pressure_host_checks,
               COUNT(DISTINCT (tc.collection_id, tc.host))
                   FILTER (WHERE COALESCE(hm.wp_critical, 0) > 0) AS wp_host_checks,
               MAX(tc.cpu_pct) FILTER (WHERE hm.cpu_pct >= :cpu_warning) AS cpu_peak_during_cpu_pressure,
               MAX(NULLIF(COALESCE(tc.details->>'total_pss_gb', tc.details->>'pss_gb'), '')::double precision)
                   FILTER (WHERE hm.ram_pct >= :ram_warning) AS pss_peak_during_ram_pressure
          FROM {source} tc
          JOIN rundeck_collections c ON c.collection_id = tc.collection_id
          JOIN rundeck_host_metrics hm
            ON hm.collection_id = tc.collection_id AND hm.host = tc.host
         WHERE {complete_clause}
           AND COALESCE(c.finished_at, c.started_at) >= :start
           AND COALESCE(c.finished_at, c.started_at) < :end
           AND tc.collected_at >= :start AND tc.collected_at < :end
           AND hm.collected_at >= :start AND hm.collected_at < :end
           AND tc.consumer_type IN ('JOB', 'PROGRAM')
         GROUP BY tc.consumer_type, tc.consumer_key
    """), params).mappings().all()
    correlation = {}
    for row in correlation_rows:
        key = (str(row["consumer_type"]), str(row["consumer_key"]))
        correlation[key] = {
            "cpu_pressure_host_checks": int(row["cpu_pressure_host_checks"] or 0),
            "ram_pressure_host_checks": int(row["ram_pressure_host_checks"] or 0),
            "wp_host_checks": int(row["wp_host_checks"] or 0),
            "cpu_peak_during_cpu_pressure": _rounded(row["cpu_peak_during_cpu_pressure"]),
            "pss_peak_during_ram_pressure": _rounded(row["pss_peak_during_ram_pressure"], 2),
        }
    return {
        "thresholds": {
            "cpu_warning_pct": CPU_WARNING, "cpu_critical_pct": CPU_CRITICAL,
            "ram_warning_pct": RAM_WARNING, "ram_critical_pct": RAM_CRITICAL,
        },
        "hosts": host_summary,
        "daily_hosts": daily_hosts,
        "cpu": {
            "episodes": len(cpu_episodes) if samples else None,
            "peak": cpu_episodes[0] if cpu_episodes else None,
            "recent_episodes": cpu_episodes[:20],
            "observed_pressure_host_checks": sum(row["cpu_warning_host_checks"] for row in host_summary) if samples else None,
        },
        "ram": {
            "episodes": len(ram_episodes) if samples else None,
            "peak": ram_episodes[0] if ram_episodes else None,
            "recent_episodes": ram_episodes[:20],
            "observed_pressure_host_checks": sum(row["ram_warning_host_checks"] for row in host_summary) if samples else None,
        },
        "correlation": correlation,
        "method": (
            "Host CPU/RAM WARNING threshold episodes from complete SPHERE collections. "
            "Pressure-workload matches require identical collection_id and APP host. "
            "Episodes cover observed samples only, not incident durations or root causes."
        ),
    }

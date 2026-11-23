"""Pure source-backed SAP evaluation presentation and pagination functions.

These helpers never issue SQL, infer SAP failures, or mutate report evidence.
The existing rundeck_evaluation module re-exports them for compatibility.
"""
from __future__ import annotations


def _monthly_abap_tuning_candidates(evaluated: list[dict], limit: int = 25) -> list[dict]:
    """Priority workload observations for ABAP review; not confirmed errors."""
    candidates = []
    for item in evaluated:
        if item.get("status") != "REVIEW REQUIRED":
            continue
        overlap = item.get("pressure_overlap") or {}
        signals = item.get("signals") or {}
        candidates.append({
            "consumer_type": item.get("consumer_type"),
            "consumer_key": item.get("consumer_key"),
            "status": item.get("status"),
            "occurrences": item.get("occurrences"),
            "observations": item.get("observations"),
            "last_seen": item.get("last_seen"),
            "hosts": item.get("hosts") or [],
            "avg_cpu_pct": item.get("avg_cpu_pct"),
            "peak_cpu_pct": item.get("peak_cpu_pct"),
            "avg_cpu_core_equivalent": item.get("avg_cpu_core_equivalent"),
            "peak_cpu_core_equivalent": item.get("peak_cpu_core_equivalent"),
            "avg_pss_gb": item.get("avg_pss_gb"),
            "peak_pss_gb": item.get("peak_pss_gb"),
            "confidence": item.get("overall_confidence"),
            "cpu_pressure_host_checks": overlap.get("cpu_pressure_host_checks", 0),
            "ram_pressure_host_checks": overlap.get("ram_pressure_host_checks", 0),
            "cpu_pressure_hosts": overlap.get("cpu_pressure_hosts") or [],
            "ram_pressure_hosts": overlap.get("ram_pressure_hosts") or [],
            "signals": {
                "sustained_high_cpu": bool(signals.get("sustained_high_cpu")),
                "high_memory": bool(signals.get("high_memory")),
                "cpu_spike": bool(signals.get("cpu_spike")),
                "baseline_anomaly": bool(signals.get("baseline_anomaly")),
            },
            "error_attribution": "NOT_ESTABLISHED",
        })
    return candidates[:max(0, limit)]


def _evaluation_page(report: dict, *, limit: int, offset: int, query: str, health: str, pressure: str = "ALL", flag: str = "ALL", consumer_type: str = "ALL") -> dict:
    """Filter the FULL evaluated population, then slice; leave all-population summary intact."""
    normalized_query = query.strip().casefold()
    group = health.upper().strip()
    if group not in {"ALL", "REVIEW", "ATTENTION", "NORMAL", "UNKNOWN"}:
        raise ValueError("health must be ALL, REVIEW, ATTENTION, NORMAL or UNKNOWN")
    if offset < 0 or offset > 100000:
        raise ValueError("offset must be between 0 and 100000")
    if len(normalized_query) > 512:
        raise ValueError("q must contain at most 512 characters")
    pressure_key = pressure.upper().strip()
    if pressure_key not in {"ALL", "CPU", "RAM", "WP"}:
        raise ValueError("pressure must be ALL, CPU, RAM or WP")
    flag_key = flag.upper().strip()
    if flag_key not in {"ALL", "HIGH_CPU", "HIGH_MEMORY", "RECURRING"}:
        raise ValueError("flag must be ALL, HIGH_CPU, HIGH_MEMORY or RECURRING")
    full = report["items"]
    def search_text(row: dict) -> str:
        details = row.get("details")
        details = details if isinstance(details, dict) else {}
        return " ".join([
            str(row.get("consumer_key") or ""),
            str(row.get("program") or ""),
            str(details.get("program") or ""),
            str(details.get("job_name") or ""),
            str(row.get("consumer_type") or ""),
            " ".join(str(host) for host in (row.get("hosts") or []) if host),
        ]).casefold()

    matching = [
        row for row in full
        if (consumer_type == "ALL" or row.get("consumer_type") == consumer_type)
        and (group == "ALL" or _evaluation_health(row) == group)
        and (pressure_key == "ALL" or (
            pressure_key == "CPU" and row.get("pressure_overlap", {}).get("cpu_pressure_host_checks", 0) > 0
        ) or (
            pressure_key == "RAM" and row.get("pressure_overlap", {}).get("ram_pressure_host_checks", 0) > 0
        ) or (
            pressure_key == "WP" and row.get("pressure_overlap", {}).get("wp_host_checks", 0) > 0
        ))
        and (flag_key == "ALL" or (
            flag_key == "HIGH_CPU" and (
                (row.get("signals") or {}).get("sustained_high_cpu")
                or (row.get("signals") or {}).get("cpu_spike")
            )
        ) or (
            flag_key == "HIGH_MEMORY" and (row.get("signals") or {}).get("high_memory")
        ) or (
            flag_key == "RECURRING" and (row.get("signals") or {}).get("recurring")
        ))
        and (not normalized_query or normalized_query in search_text(row))
    ]
    return {
        **report,
        "type": consumer_type if report.get("period") == "month" else report.get("type"),
        "items": matching[offset:offset + limit],
        "page": {
            "offset": offset, "limit": limit,
            "total": len(matching), "returned": len(matching[offset:offset + limit]),
            "has_more": offset + limit < len(matching),
            "query": query.strip(), "health": group,
            "scope": "FULL_EVALUATED_POPULATION",
        },
    }


def _evaluation_health(row: dict) -> str:
    status = str(row.get("status") or "").upper()
    if status == "REVIEW REQUIRED":
        return "REVIEW"
    if status in {"HIGH CPU", "HIGH MEMORY", "CPU SPIKE", "INCREASING CPU", "RECURRING"}:
        return "ATTENTION"
    if status == "NORMAL":
        return "NORMAL"
    return "UNKNOWN"


def _evaluation_health_summary(evaluated: list[dict]) -> dict:
    """Mutually-exclusive population counts; no approximation from first-ranked rows."""
    counts = {"review": 0, "attention": 0, "normal": 0, "unknown": 0}
    for row in evaluated:
        counts[_evaluation_health(row).lower()] += 1
    return counts



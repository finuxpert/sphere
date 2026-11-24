"""Evaluate normalized SAP workload evidence for investigation review."""

from __future__ import annotations

import os
from typing import Any


CPU_HIGH_AVG = float(os.getenv("SPHERE_EVAL_CPU_HIGH_AVG_PCT", "70"))
CPU_HIGH_PEAK = float(os.getenv("SPHERE_EVAL_CPU_HIGH_PEAK_PCT", "100"))
PSS_HIGH_GB = float(os.getenv("SPHERE_EVAL_PSS_HIGH_GB", "4"))
INCREASE_PCT = float(os.getenv("SPHERE_EVAL_INCREASE_PCT", "25"))
RECURRING_PCT = float(os.getenv("SPHERE_EVAL_RECURRING_PCT", "30"))
WP_CORRELATION_PCT = float(os.getenv("SPHERE_EVAL_WP_CORRELATION_PCT", "30"))
WP_EXCESS_ASSOCIATION_PCT = float(os.getenv("SPHERE_EVAL_WP_EXCESS_ASSOCIATION_PCT", "20"))
MIN_BASELINE_OCCURRENCES = max(2, int(os.getenv("SPHERE_EVAL_MIN_BASELINE_OCCURRENCES", "5")))
CONFIDENCE_MEDIUM_OCCURRENCES = max(2, int(os.getenv("SPHERE_EVAL_CONFIDENCE_MEDIUM_OCCURRENCES", "4")))
CONFIDENCE_HIGH_OCCURRENCES = max(CONFIDENCE_MEDIUM_OCCURRENCES, int(os.getenv("SPHERE_EVAL_CONFIDENCE_HIGH_OCCURRENCES", "20")))
HISTORICAL_BASELINE_DAYS = max(7, int(os.getenv("SPHERE_EVAL_BASELINE_DAYS", "30")))
HISTORICAL_BASELINE_MIN_OBSERVATIONS = max(5, int(os.getenv("SPHERE_EVAL_BASELINE_MIN_OBSERVATIONS", "20")))
BASELINE_DEVIATION_PCT = max(0.0, float(os.getenv("SPHERE_EVAL_BASELINE_DEVIATION_PCT", "25")))
BASELINE_CPU_MIN_DELTA_PP = max(0.0, float(os.getenv("SPHERE_EVAL_BASELINE_CPU_MIN_DELTA_PP", "15")))
BASELINE_PSS_MIN_DELTA_GB = max(0.0, float(os.getenv("SPHERE_EVAL_BASELINE_PSS_MIN_DELTA_GB", "0.5")))
SHIFT_RECENT_HOURS = max(1, int(os.getenv("SPHERE_EVAL_SHIFT_RECENT_HOURS", "6")))
SHIFT_MIN_OBSERVATIONS = max(2, int(os.getenv("SPHERE_EVAL_SHIFT_MIN_OBSERVATIONS", "3")))
SHIFT_INCREASE_PCT = max(0.0, float(os.getenv("SPHERE_EVAL_SHIFT_INCREASE_PCT", "50")))
SHIFT_CPU_MIN_DELTA_PP = max(0.0, float(os.getenv("SPHERE_EVAL_SHIFT_CPU_MIN_DELTA_PP", "20")))
_CONFIDENCE_RANK = {"LOW": 1, "MEDIUM": 2, "HIGH": 3}


def _number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _round(value: Any, digits: int = 1) -> float | None:
    number = _number(value)
    return round(number, digits) if number is not None else None


def _change_pct(current: Any, previous: Any) -> float | None:
    current_value = _number(current)
    previous_value = _number(previous)
    if current_value is None or previous_value is None or previous_value <= 0:
        return None
    return round((current_value - previous_value) / previous_value * 100.0, 1)


def _observation_confidence(occurrences: int) -> str:
    if occurrences >= CONFIDENCE_HIGH_OCCURRENCES:
        return "HIGH"
    if occurrences >= CONFIDENCE_MEDIUM_OCCURRENCES:
        return "MEDIUM"
    return "LOW"


def _cap_confidence(value: str, period_confidence: str) -> str:
    value_rank = _CONFIDENCE_RANK.get(value, 1)
    period_rank = _CONFIDENCE_RANK.get(period_confidence, 1)
    target = min(value_rank, period_rank)
    return next((name for name, rank in _CONFIDENCE_RANK.items() if rank == target), "LOW")


def _baseline_deviation(current: float | None, p95: float | None, *, min_delta: float) -> tuple[bool, float | None]:
    if current is None or p95 is None or p95 <= 0:
        return False, None
    deviation_pct = round((current - p95) / p95 * 100.0, 1)
    above = current - p95 >= min_delta and deviation_pct >= BASELINE_DEVIATION_PCT
    return above, deviation_pct


def _operational_status(
    *,
    sustained_high_cpu: bool,
    high_memory: bool,
    cpu_spike: bool,
    increasing: bool,
    recurring: bool,
    enough_window_evidence: bool,
    review_required: bool,
) -> str:
    if review_required:
        return "REVIEW REQUIRED"
    if sustained_high_cpu:
        return "HIGH CPU"
    if high_memory:
        return "HIGH MEMORY"
    if cpu_spike:
        return "CPU SPIKE"
    if increasing:
        return "INCREASING CPU"
    if recurring:
        return "RECURRING"
    if not enough_window_evidence:
        return "INSUFFICIENT DATA"
    return "NORMAL"


def assess_workload(
    current: dict,
    previous: dict | None,
    total_checks: int,
    *,
    baseline_eligible: bool = True,
    period_confidence: str = "HIGH",
    previous_period_confidence: str = "HIGH",
) -> dict:
    """Return deterministic review classification and separated confidence signals."""
    previous = previous or {}
    occurrences = int(current.get("occurrences") or 0)
    host_observations = int(current.get("host_observations") or occurrences)
    wp_host_checks = int(current.get("critical_wp_host_checks") or current.get("critical_wp_checks") or 0)
    avg_cpu = _number(current.get("avg_cpu_pct"))
    peak_cpu = _number(current.get("peak_cpu_pct"))
    avg_pss = _number(current.get("avg_pss_gb"))
    app_wp_baseline = _number(current.get("app_wp_baseline_pct"))
    baseline = current.get("historical_baseline") or {}
    baseline_observations = int(baseline.get("observations") or 0)
    baseline_cpu_p95 = _number(baseline.get("cpu_p95_pct"))
    baseline_pss_p95 = _number(baseline.get("pss_p95_gb"))
    baseline_ready = baseline_observations >= HISTORICAL_BASELINE_MIN_OBSERVATIONS

    observation_confidence = _observation_confidence(occurrences)
    overall_confidence = _cap_confidence(observation_confidence, period_confidence)
    trend_confidence = previous_period_confidence if baseline_eligible else "NOT_READY"
    change = _change_pct(avg_cpu, previous.get("avg_cpu_pct")) if baseline_eligible else None
    recurring_rate = round(occurrences / total_checks * 100.0, 1) if total_checks else 0.0
    wp_rate = round(wp_host_checks / host_observations * 100.0, 1) if host_observations else 0.0
    wp_excess = round(wp_rate - app_wp_baseline, 1) if app_wp_baseline is not None else None

    cpu_above_baseline, cpu_baseline_deviation_pct = _baseline_deviation(
        avg_cpu,
        baseline_cpu_p95 if baseline_ready else None,
        min_delta=BASELINE_CPU_MIN_DELTA_PP,
    )
    pss_above_baseline, pss_baseline_deviation_pct = _baseline_deviation(
        avg_pss,
        baseline_pss_p95 if baseline_ready else None,
        min_delta=BASELINE_PSS_MIN_DELTA_GB,
    )

    shift_previous = _number(current.get("shift_previous_avg_cpu_pct"))
    shift_recent = _number(current.get("shift_recent_avg_cpu_pct"))
    shift_previous_count = int(current.get("shift_previous_observations") or 0)
    shift_recent_count = int(current.get("shift_recent_observations") or 0)
    shift_change = _change_pct(shift_recent, shift_previous)
    performance_shift = bool(
        shift_change is not None
        and shift_previous_count >= SHIFT_MIN_OBSERVATIONS
        and shift_recent_count >= SHIFT_MIN_OBSERVATIONS
        and shift_recent is not None
        and shift_previous is not None
        and shift_recent - shift_previous >= SHIFT_CPU_MIN_DELTA_PP
        and shift_change >= SHIFT_INCREASE_PCT
    )

    sustained_high_cpu = bool((avg_cpu is not None and avg_cpu >= CPU_HIGH_AVG) or cpu_above_baseline)
    high_memory = bool((avg_pss is not None and avg_pss >= PSS_HIGH_GB) or pss_above_baseline)
    cpu_spike = bool(
        peak_cpu is not None
        and peak_cpu >= CPU_HIGH_PEAK
        and not sustained_high_cpu
        and (
            avg_cpu is None
            or peak_cpu - avg_cpu >= 40
            or (avg_cpu > 0 and peak_cpu >= avg_cpu * 1.75)
        )
    )
    high_resource = sustained_high_cpu or high_memory or cpu_spike
    increasing = bool((baseline_eligible and change is not None and change >= INCREASE_PCT) or performance_shift)
    recurring_signal = occurrences >= 3 and recurring_rate >= RECURRING_PCT
    wp_overlap_signal = host_observations >= 2 and wp_rate >= WP_CORRELATION_PCT
    wp_excess_signal = bool(
        wp_overlap_signal
        and wp_excess is not None
        and wp_excess >= WP_EXCESS_ASSOCIATION_PCT
    )
    enough_window_evidence = overall_confidence in {"MEDIUM", "HIGH"}
    recurring = recurring_signal and enough_window_evidence
    wp_associated = wp_excess_signal and enough_window_evidence
    baseline_anomaly = baseline_ready and (cpu_above_baseline or pss_above_baseline)
    review_required = bool(
        enough_window_evidence
        and (sustained_high_cpu or high_memory)
        and (increasing or wp_associated or baseline_anomaly)
    )

    # Backward-compatible assessment values are intentionally preserved.
    if review_required:
        assessment = "NEEDS REVIEW"
    elif high_resource:
        assessment = "HIGH RESOURCE"
    elif increasing:
        assessment = "INCREASING"
    elif recurring:
        assessment = "RECURRING"
    elif not enough_window_evidence:
        assessment = "LIMITED DATA"
    else:
        assessment = "STABLE"

    status = _operational_status(
        sustained_high_cpu=sustained_high_cpu,
        high_memory=high_memory,
        cpu_spike=cpu_spike,
        increasing=increasing,
        recurring=recurring,
        enough_window_evidence=enough_window_evidence,
        review_required=review_required,
    )

    reason_parts: list[str] = []
    if sustained_high_cpu:
        reason_parts.append("CPU usage is sustained above the review range" if not cpu_above_baseline else "CPU usage is above the workload historical baseline")
    if high_memory:
        reason_parts.append("memory usage is above the review range" if not pss_above_baseline else "memory usage is above the workload historical baseline")
    if cpu_spike:
        reason_parts.append("a CPU spike was observed without sustained high average CPU")
    if performance_shift:
        reason_parts.append("recent CPU usage is materially higher than the preceding six-hour window")
    elif baseline_eligible and change is not None and change >= INCREASE_PCT:
        reason_parts.append("CPU usage increased versus the previous equivalent period")
    if wp_associated:
        reason_parts.append("Critical WP overlap is materially above the APP baseline")
    if recurring and not (sustained_high_cpu or high_memory):
        reason_parts.append("the workload is repeatedly observed across collection checks")
    if not enough_window_evidence:
        reason_parts.append("data coverage is not yet sufficient for a stronger historical conclusion")
    reason = "; ".join(reason_parts) + "." if reason_parts else "No review threshold is currently met."

    baseline_status = "READY" if baseline_ready else ("BUILDING" if baseline_observations else "NOT_READY")
    anomaly_status = "ABOVE BASELINE" if baseline_anomaly else ("NORMAL RANGE" if baseline_ready else "NO BASELINE")

    return {
        "assessment": assessment,
        "status": status,
        "assessment_reason": reason,
        "observation_confidence": observation_confidence,
        "period_confidence": period_confidence,
        "overall_confidence": overall_confidence,
        "evidence_confidence": overall_confidence,
        "trend_confidence": trend_confidence,
        "trend_baseline_status": "READY" if baseline_eligible else "NOT_READY",
        "baseline_available": bool(baseline_eligible),
        "baseline_status": baseline_status,
        "anomaly_status": anomaly_status,
        "avg_cpu_change_pct": change,
        "recent_cpu_shift_pct": shift_change,
        "recurring_rate_pct": recurring_rate,
        "wp_signal_overlap_pct": wp_rate,
        "app_wp_baseline_pct": _round(app_wp_baseline),
        "wp_excess_association_pct": wp_excess,
        "critical_wp_correlation_pct": wp_rate,
        "cpu_baseline_deviation_pct": cpu_baseline_deviation_pct,
        "pss_baseline_deviation_pct": pss_baseline_deviation_pct,
        "resource_pattern": (
            "SUSTAINED_HIGH_CPU" if sustained_high_cpu else
            "HIGH_MEMORY" if high_memory else
            "CPU_SPIKE" if cpu_spike else
            "NORMAL"
        ),
        "signals": {
            "high_resource": high_resource,
            "sustained_high_cpu": sustained_high_cpu,
            "high_memory": high_memory,
            "cpu_spike": cpu_spike,
            "baseline_anomaly": baseline_anomaly,
            "performance_shift": performance_shift,
            "increasing": increasing,
            "recurring": recurring,
            "recurring_signal": recurring_signal,
            "critical_wp_correlated": wp_associated,
            "wp_signal_overlap": wp_overlap_signal,
            "wp_excess_association": wp_excess_signal,
        },
    }

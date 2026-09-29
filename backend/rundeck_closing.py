"""Operator closing records for SAP job/program performance reviews."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import text

from backend.db.session import get_engine

ALLOWED_CLOSING_STATUSES = {
    "NORMAL_EXPECTED",
    "OBSERVE",
    "OPTIMIZATION_NEEDED",
    "SCHEDULE_REVIEW",
    "INFRA_CORRELATED",
    "SAP_CAPACITY_REVIEW",
    "NEEDS_FURTHER_RCA",
    "RESOLVED",
}


def _dt(value):
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("Invalid analysis window timestamp") from exc
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _view(row) -> dict | None:
    if row is None:
        return None
    data = dict(row)
    for key in ("window_start", "window_end", "created_at", "updated_at", "closed_at"):
        value = data.get(key)
        if isinstance(value, datetime):
            data[key] = value.astimezone(timezone.utc).isoformat()
    return data


def get_analysis_closure(
    consumer_type: str,
    consumer_key: str,
    period_key: str,
    window_end,
    host: str = "",
) -> dict | None:
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")
    resolved_type = str(consumer_type or "").upper()
    if resolved_type not in {"JOB", "PROGRAM"}:
        raise ValueError("type must be JOB or PROGRAM")
    end = _dt(window_end)
    if end is None:
        raise ValueError("window_end is required")
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT *
              FROM rundeck_analysis_closures
             WHERE consumer_type = :consumer_type
               AND consumer_key = :consumer_key
               AND host = :host
               AND period_key = :period_key
               AND window_end = :window_end
             LIMIT 1
        """), {
            "consumer_type": resolved_type,
            "consumer_key": str(consumer_key),
            "host": str(host or "").upper(),
            "period_key": str(period_key or "1d").lower(),
            "window_end": end,
        }).mappings().first()
    return _view(row)


def save_analysis_closure(payload: dict) -> dict:
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")

    consumer_type = str(payload.get("consumer_type") or "").upper()
    consumer_key = str(payload.get("consumer_key") or "").strip()
    host = str(payload.get("host") or "").upper().strip()
    period_key = str(payload.get("period_key") or "1d").lower().strip()
    closing_status = str(payload.get("closing_status") or "").upper().strip()
    window_start = _dt(payload.get("window_start"))
    window_end = _dt(payload.get("window_end"))

    if consumer_type not in {"JOB", "PROGRAM"}:
        raise ValueError("consumer_type must be JOB or PROGRAM")
    if not consumer_key:
        raise ValueError("consumer_key is required")
    if period_key not in {"1d", "7d", "30d"}:
        raise ValueError("period_key must be 1d, 7d or 30d")
    if closing_status not in ALLOWED_CLOSING_STATUSES:
        raise ValueError("Unsupported closing_status")
    if window_end is None:
        raise ValueError("window_end is required")

    params = {
        "id": uuid4().hex,
        "consumer_type": consumer_type,
        "consumer_key": consumer_key,
        "host": host,
        "period_key": period_key,
        "window_start": window_start,
        "window_end": window_end,
        "closing_status": closing_status,
        "finding": str(payload.get("finding") or "").strip(),
        "recommendation": str(payload.get("recommendation") or "").strip(),
        "owner": str(payload.get("owner") or "").strip(),
        "follow_up": str(payload.get("follow_up") or "").strip(),
        "metrics": payload.get("metrics") if isinstance(payload.get("metrics"), dict) else {},
        "evidence": payload.get("evidence") if isinstance(payload.get("evidence"), dict) else {},
        "created_by": str(payload.get("created_by") or "").strip(),
    }

    with engine.begin() as conn:
        row = conn.execute(text("""
            INSERT INTO rundeck_analysis_closures (
                id, consumer_type, consumer_key, host, period_key,
                window_start, window_end, closing_status,
                finding, recommendation, owner, follow_up,
                metrics, evidence, created_by, created_at, updated_at, closed_at
            ) VALUES (
                :id, :consumer_type, :consumer_key, :host, :period_key,
                :window_start, :window_end, :closing_status,
                :finding, :recommendation, :owner, :follow_up,
                CAST(:metrics AS jsonb), CAST(:evidence AS jsonb), :created_by,
                now(), now(), now()
            )
            ON CONFLICT (consumer_type, consumer_key, host, period_key, window_end)
            DO UPDATE SET
                window_start = EXCLUDED.window_start,
                closing_status = EXCLUDED.closing_status,
                finding = EXCLUDED.finding,
                recommendation = EXCLUDED.recommendation,
                owner = EXCLUDED.owner,
                follow_up = EXCLUDED.follow_up,
                metrics = EXCLUDED.metrics,
                evidence = EXCLUDED.evidence,
                created_by = CASE
                    WHEN EXCLUDED.created_by <> '' THEN EXCLUDED.created_by
                    ELSE rundeck_analysis_closures.created_by
                END,
                updated_at = now(),
                closed_at = now()
            RETURNING *
        """), {
            **params,
            "metrics": __import__("json").dumps(params["metrics"]),
            "evidence": __import__("json").dumps(params["evidence"]),
        }).mappings().one()
    return _view(row)


def list_analysis_closures(
    consumer_type: str | None = None,
    consumer_key: str | None = None,
    days: int = 90,
    limit: int = 100,
) -> dict:
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")
    conditions = ["closed_at >= now() - make_interval(days => :days)"]
    params: dict = {"days": max(1, min(int(days), 365)), "limit": max(1, min(int(limit), 500))}
    if consumer_type:
        conditions.append("consumer_type = :consumer_type")
        params["consumer_type"] = str(consumer_type).upper()
    if consumer_key:
        conditions.append("consumer_key = :consumer_key")
        params["consumer_key"] = str(consumer_key)
    with engine.connect() as conn:
        rows = conn.execute(text(f"""
            SELECT *
              FROM rundeck_analysis_closures
             WHERE {' AND '.join(conditions)}
             ORDER BY closed_at DESC
             LIMIT :limit
        """), params).mappings().all()
    return {"items": [_view(row) for row in rows], "count": len(rows)}

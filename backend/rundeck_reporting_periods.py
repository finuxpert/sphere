"""Shared, deterministic WIB reporting period boundaries for SAP Basis reports.

Pure date math only: no DB queries, network access, app state or mutations.
Imported/re-exported by rundeck_evaluation for backward compatibility.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo


def calendar_month_bounds(month: str, now: datetime | None = None) -> tuple[datetime, datetime, datetime]:
    """WIB calendar month [start, end), capped at now; comparison is previous calendar month."""
    from re import fullmatch

    if not fullmatch(r"20[0-9]{2}-(0[1-9]|1[0-2])", str(month or "")):
        raise ValueError("month must be YYYY-MM")
    year, month_number = (int(piece) for piece in month.split("-"))
    wib = ZoneInfo("Asia/Jakarta")
    now_local = (now or datetime.now(timezone.utc)).astimezone(wib)
    start_local = datetime(year, month_number, 1, tzinfo=wib)
    if start_local > now_local:
        raise ValueError("Future calendar months are unavailable")
    end_local = datetime(year + (month_number == 12), (month_number % 12) + 1, 1, tzinfo=wib)
    previous_local = (datetime(year - 1, 12, 1, tzinfo=wib)
                      if month_number == 1 else datetime(year, month_number - 1, 1, tzinfo=wib))
    return (
        start_local.astimezone(timezone.utc),
        min(end_local, now_local).astimezone(timezone.utc),
        previous_local.astimezone(timezone.utc),
    )


def calendar_week_bounds(week_start: str, now: datetime | None = None) -> tuple[datetime, datetime, datetime]:
    """ISO reporting week: Monday 00:00 through next Monday 00:00 WIB, end-exclusive."""
    from re import fullmatch
    if not fullmatch(r"20[0-9]{2}-[0-9]{2}-[0-9]{2}", str(week_start or "")):
        raise ValueError("week_start must be YYYY-MM-DD")
    try:
        date = datetime.strptime(week_start, "%Y-%m-%d")
    except ValueError as error:
        raise ValueError("Invalid reporting week") from error
    if date.weekday() != 0:
        raise ValueError("Reporting week must start on Monday")
    wib = ZoneInfo("Asia/Jakarta")
    local_start = date.replace(tzinfo=wib)
    now_local = (now or datetime.now(timezone.utc)).astimezone(wib)
    if local_start > now_local:
        raise ValueError("Future reporting weeks are unavailable")
    return (
        local_start.astimezone(timezone.utc),
        min(local_start + timedelta(days=7), now_local).astimezone(timezone.utc),
        (local_start - timedelta(days=7)).astimezone(timezone.utc),
    )


def calendar_custom_bounds(start_date: str, end_date: str, now: datetime | None = None) -> tuple[datetime, datetime, datetime]:
    """Inclusive WIB calendar dates; 1-31 days, future/invalid dates rejected."""
    from re import fullmatch
    for label, date_string in (("start_date", start_date), ("end_date", end_date)):
        if not fullmatch(r"20[0-9]{2}-[0-9]{2}-[0-9]{2}", str(date_string or "")):
            raise ValueError(f"{label} must be YYYY-MM-DD")
    try:
        first = datetime.strptime(start_date, "%Y-%m-%d")
        last = datetime.strptime(end_date, "%Y-%m-%d")
    except ValueError as error:
        raise ValueError("Invalid custom reporting date") from error
    days = (last - first).days + 1
    if not 1 <= days <= 31:
        raise ValueError("Custom reporting range must be 1-31 calendar days")
    wib = ZoneInfo("Asia/Jakarta")
    start_local = first.replace(tzinfo=wib)
    end_local = (last + timedelta(days=1)).replace(tzinfo=wib)
    now_local = (now or datetime.now(timezone.utc)).astimezone(wib)
    if start_local > now_local or last.replace(tzinfo=wib) > now_local:
        raise ValueError("Future reporting dates are unavailable")
    return (
        start_local.astimezone(timezone.utc),
        min(end_local, now_local).astimezone(timezone.utc),
        (first - timedelta(days=days)).replace(tzinfo=wib).astimezone(timezone.utc),
    )



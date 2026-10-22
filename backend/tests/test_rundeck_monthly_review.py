"""Calendar-month boundaries for SPHERE manual SAP Basis performance reports."""
from datetime import datetime, timezone

import pytest

from backend.rundeck_evaluation import calendar_month_bounds


def test_full_september_window_is_wib_calendar_month():
    start, end, previous = calendar_month_bounds(
        "2026-09", now=datetime(2026, 10, 21, 3, 0, tzinfo=timezone.utc)
    )
    assert start == datetime(2026, 8, 31, 17, 0, tzinfo=timezone.utc)
    assert end == datetime(2026, 9, 30, 17, 0, tzinfo=timezone.utc)
    assert previous == datetime(2026, 7, 31, 17, 0, tzinfo=timezone.utc)


def test_ongoing_month_is_capped_by_now_without_future_samples():
    now = datetime(2026, 10, 21, 3, 0, tzinfo=timezone.utc)
    start, end, previous = calendar_month_bounds("2026-10", now=now)
    assert start == datetime(2026, 9, 30, 17, 0, tzinfo=timezone.utc)
    assert end == now
    assert previous == datetime(2026, 8, 31, 17, 0, tzinfo=timezone.utc)


def test_month_boundary_at_new_year():
    start, end, previous = calendar_month_bounds(
        "2026-01", now=datetime(2026, 2, 2, tzinfo=timezone.utc)
    )
    assert start == datetime(2025, 12, 31, 17, 0, tzinfo=timezone.utc)
    assert end == datetime(2026, 1, 31, 17, 0, tzinfo=timezone.utc)
    assert previous == datetime(2025, 11, 30, 17, 0, tzinfo=timezone.utc)


@pytest.mark.parametrize("month", ["2026-00", "2026-13", "2026-1", "foo", "", "2030-01"])
def test_invalid_or_future_month_is_rejected(month):
    with pytest.raises(ValueError):
        calendar_month_bounds(month, now=datetime(2026, 10, 21, tzinfo=timezone.utc))

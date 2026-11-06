"""Compare the live PROD calendar response against candidate compatible SQL.

Both requests are read-only. Run ONLY inside an isolated PROD-configured
systemd transient unit with PGOPTIONS default_transaction_read_only=on.
Never enable PROD snapshots during this verification.
"""
from __future__ import annotations

import argparse
import json
import os
import time
from datetime import date, datetime
from urllib.parse import urlencode
from urllib.request import ProxyHandler, build_opener
from zoneinfo import ZoneInfo

from fastapi.encoders import jsonable_encoder

from backend import rundeck_prod_compat_evaluation as ev
from backend import rundeck_prod_report_snapshots as snapshot

COMPARE_FIELDS = (
    "summary", "quality", "previous_quality", "sampling",
    "daily_host_trend", "monthly_pressure", "monthly_errors",
    "monthly_abap_candidates", "monthly_top_wp_cpu", "monthly_top_wp_pss",
    "thresholds", "baseline", "shift_detection",
)


def canonical(value):
    return json.dumps(jsonable_encoder(value), sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, allow_nan=False)


def baseline_page(opener, base, month, week_start, offset, limit=100):
    params = {"month": month, "week_start": week_start, "limit": limit, "offset": offset}
    url = base.rstrip("/") + "/evaluation/workloads/monthly?" + urlencode(params)
    with opener.open(url, timeout=150) as response:
        if response.status != 200:
            raise RuntimeError(f"PROD_HTTP={response.status}")
        return json.load(response)


def compare_field(key, left, right, scope):
    if canonical(left.get(key)) != canonical(right.get(key)):
        raise AssertionError(f"PARITY_MISMATCH scope={scope} field={key}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--month", required=True)
    parser.add_argument("--week-start", required=True)
    parser.add_argument("--base-url", default="http://127.0.0.1:8092")
    args = parser.parse_args()

    if os.getenv("PGOPTIONS", "").find("default_transaction_read_only=on") < 0:
        raise SystemExit("REFUSED: PostgreSQL read-only session policy is mandatory")
    if snapshot.enabled():
        raise SystemExit("REFUSED: snapshot feature must be OFF for baseline parity")
    if args.base_url != "http://127.0.0.1:8092":
        raise SystemExit("REFUSED: only loopback PROD API port 8092 is allowed")

    monday = date.fromisoformat(args.week_start)
    if monday.weekday() or monday.strftime("%Y-%m") != args.month:
        raise SystemExit("REFUSED: invalid reporting Monday/month")
    if monday.toordinal() + 7 > datetime.now(ZoneInfo("Asia/Jakarta")).date().toordinal():
        raise SystemExit("REFUSED: use one closed reporting week only")
    if os.getenv("DB_MODE", "file").lower() not in {"db", "hybrid"}:
        raise SystemExit("REFUSED: PROD DB mode expected")
    if ev.get_engine() is None:
        raise SystemExit("REFUSED: PROD database unavailable")

    # Anchor equality protects against changes arriving during this test.
    start, end, _ = ev.calendar_week_bounds(args.week_start)
    with ev.get_engine().connect() as conn:
        anchor_before = ev._calendar_month_collection_anchor(conn, start, end)
    if anchor_before == "NO_COMPLETE_COLLECTION":
        raise SystemExit("REFUSED: no complete READY source for requested week")

    opener = build_opener(ProxyHandler({}))
    began = time.monotonic()
    baseline = baseline_page(opener, args.base_url, args.month, args.week_start, 0)
    if baseline.get("page", {}).get("scope") != "FULL_EVALUATED_POPULATION":
        raise AssertionError("PROD_BASELINE_SCOPE_INVALID")
    population = baseline.get("summary", {}).get("workloads")
    total = baseline.get("page", {}).get("total")
    if not isinstance(population, int) or not (0 < population <= 5000) or total != population:
        raise AssertionError(f"PROD_BASELINE_POPULATION_INVALID population={population} total={total}")
    print(f"BASELINE_HTTP=PASS evaluated={population} first_page={len(baseline['items'])}", flush=True)

    candidate = ev.evaluation_report(
        period="week", month=args.month, week_start=args.week_start,
        consumer_type="ALL", limit=100, offset=0,
    )
    if candidate.get("runtime", {}).get("cache") not in {"MISS", "HIT"}:
        raise AssertionError("CANDIDATE_NOT_SQL")
    if candidate.get("page", {}).get("scope") != "FULL_EVALUATED_POPULATION":
        raise AssertionError("CANDIDATE_SCOPE_INVALID")
    for field in COMPARE_FIELDS:
        compare_field(field, baseline, candidate, "week")
    if baseline.get("page", {}).get("total") != candidate.get("page", {}).get("total"):
        raise AssertionError("PARITY_MISMATCH page.total")
    if canonical(baseline["items"]) != canonical(candidate["items"]):
        raise AssertionError("PARITY_MISMATCH items offset=0")
    print(f"FIRST_PAGE_PARITY=PASS compute_seconds={time.monotonic()-began:.2f}", flush=True)

    checked = len(baseline["items"])
    for offset in range(100, population, 100):
        old = baseline_page(opener, args.base_url, args.month, args.week_start, offset)
        new = ev.evaluation_report(
            period="week", month=args.month, week_start=args.week_start,
            consumer_type="ALL", limit=100, offset=offset,
        )
        if old.get("page", {}).get("total") != population:
            raise AssertionError("PROD_BASELINE_POPULATION_CHANGED")
        compare_field("summary", old, new, f"page_{offset}")
        if canonical(old["items"]) != canonical(new["items"]):
            raise AssertionError(f"PARITY_MISMATCH items offset={offset}")
        checked += len(old["items"])

    with ev.get_engine().connect() as conn:
        anchor_after = ev._calendar_month_collection_anchor(conn, start, end)
    if anchor_before != anchor_after:
        raise AssertionError("SOURCE_ANCHOR_CHANGED: inconclusive, do not promote")
    if checked != population:
        raise AssertionError(f"INCOMPLETE_FULL_POPULATION checked={checked} expected={population}")
    print(f"FINAL=PASS PROD_READ_ONLY_CALENDAR_PARITY rows={checked} "
          f"pages={(population+99)//100} seconds={time.monotonic()-began:.2f}", flush=True)


if __name__ == "__main__":
    main()

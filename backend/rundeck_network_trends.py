"""Saved network throughput for AOP APP1-APP5, from the dedicated Infrastructure collector.

One series per APP uses the highest observed single-interface rate (RX or TX)
per host/sample. We do not sum virtual, bonded and physical interfaces, which
could count the same traffic twice. No inferred samples and no SAP job verdict.
"""
from __future__ import annotations

import os
from datetime import datetime
from sqlalchemy import text

from backend.db.session import get_engine
from backend.rundeck_trends import BUCKET_SECONDS, resolve_bucket

DIRECTIONS = {
    "network_rx": ("rx_mbps", "Network RX"),
    "network_tx": ("tx_mbps", "Network TX"),
}
HOST_PATTERN = r"^AOPH[1-5]PAPPDC$"


def app_network_trend(
    since: datetime,
    range_key: str,
    bucket_key: str,
    metric_key: str,
    until: datetime | None = None,
) -> dict:
    if metric_key not in DIRECTIONS:
        raise ValueError("Unsupported network metric")
    resolved, stride = resolve_bucket(range_key, bucket_key)
    if range_key == "custom" and (resolved != "raw" or until is None):
        raise ValueError("Custom network range requires raw samples and an end time")
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Infrastructure database history is not enabled")

    field, label = DIRECTIONS[metric_key]
    bounds = "AND s.collected_at < :until" if range_key == "custom" else ""
    # All SQL identifiers are chosen from server-controlled constants, never inputs.
    common = f"""
        WITH base AS (
          SELECT s.collection_id, s.collected_at, s.sample_key AS interface,
                 s.host AS source_host,
                 'APP' || substring(upper(split_part(s.host,'.',1))
                   from '^AOPH([1-5])PAPPDC$') AS host,
                 CASE
                   WHEN (s.metrics->>'{field}') ~ '^[0-9]+([.][0-9]+)?$'
                   THEN (s.metrics->>'{field}')::double precision
                   ELSE NULL
                 END AS value
          FROM rundeck_infra_samples s
          WHERE s.kind = 'network'
            AND upper(split_part(s.host,'.',1)) ~ '{HOST_PATTERN}'
            AND s.collected_at >= :since
            {bounds}
        ), ranked AS (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY host,collected_at
            ORDER BY value DESC NULLS LAST,interface,collection_id
          ) AS sample_rank FROM base
        ), sampled AS (
          SELECT * FROM ranked WHERE sample_rank = 1 AND value IS NOT NULL
        )
    """
    if resolved == "raw":
        sql = common + """
            SELECT collected_at AS bucket, host, source_host, interface AS peak_interface,
                   collection_id AS peak_collection_id, collected_at AS peak_at,
                   collected_at AS latest_at, value AS avg_value, value AS max_value, value AS min_value,
                   1::integer AS samples
            FROM sampled ORDER BY bucket,host
        """
        params = {"since": since}
    else:
        sql = common + """
            , bucketed AS (
              SELECT *, date_bin(CAST(:stride AS interval),collected_at,
                TIMESTAMPTZ '2000-01-01 00:00:00+00') AS bucket
              FROM sampled
            ), ranked_bucket AS (
              SELECT *, ROW_NUMBER() OVER (
                PARTITION BY bucket,host ORDER BY value DESC,collected_at DESC
              ) AS peak_rank FROM bucketed
            )
            SELECT bucket,host,
                   MAX(source_host) FILTER (WHERE peak_rank=1) AS source_host,
                   MAX(interface) FILTER (WHERE peak_rank=1) AS peak_interface,
                   MAX(collection_id) FILTER (WHERE peak_rank=1) AS peak_collection_id,
                   MAX(collected_at) FILTER (WHERE peak_rank=1) AS peak_at,
                   MAX(collected_at) AS latest_at,
                   AVG(value) AS avg_value, MAX(value) AS max_value,
                   MIN(value) AS min_value, COUNT(value) AS samples
            FROM ranked_bucket GROUP BY bucket,host ORDER BY bucket,host
        """
        params = {"since": since, "stride": stride}
    if range_key == "custom":
        params["until"] = until

    with engine.connect() as conn:
        items = [dict(row._mapping) for row in conn.execute(text(sql), params)]
    # Freshness uses the last retained observation, not the earlier peak in a bucket.
    latest = max((row["latest_at"] for row in items if row.get("latest_at")), default=None)
    return {
        "since": since,
        "window_end": until if range_key == "custom" else None,
        "range": range_key,
        "bucket": resolved,
        "requested_bucket": bucket_key,
        "bucket_interval_seconds": (
            max(60, int(os.getenv("SPHERE_INFRA_TREND_CADENCE_SECONDS", "600")))
            if resolved == "raw" else BUCKET_SECONDS[resolved]
        ),
        "metric": metric_key,
        "metric_label": label,
        "unit": "Mbps",
        "warning": None,
        "critical": None,
        "network_rate_basis": "highest_interface_per_host_sample",
        "network_source": "Infrastructure collector",
        "expected_hosts": ["APP1", "APP2", "APP3", "APP4", "APP5"],
        "observed_hosts": sorted({row["host"] for row in items}),
        "last_observed_at": latest,
        "items": items,
    }

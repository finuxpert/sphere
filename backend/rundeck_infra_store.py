"""Independent persistence for SPHERE Infrastructure collections."""
from __future__ import annotations
import gzip
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import text
from backend.db.session import get_engine
from backend.rundeck_infra_parser import parse

ROOT = Path(os.getenv("SPHERE_INFRA_INGESTION_ROOT", "/var/lib/sphere/infra-ingestion"))

def now():
    return datetime.now(timezone.utc).isoformat()

def initialize(root=ROOT):
    for name in ("archive", "manifests"):
        (root / name).mkdir(parents=True, exist_ok=True, mode=0o750)

def _write(path, value):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, indent=2, default=str))
    tmp.replace(path)

def _safe_host(host):
    value = re.sub(r"[^A-Za-z0-9_.-]+", "-", str(host or "").strip())
    if not value:
        raise ValueError("Invalid infrastructure host")
    return value[:120]

def identifier(execution_id, host=None):
    value = str(execution_id)
    if not value.isdigit() or value.startswith("0"):
        raise ValueError("Invalid execution ID")
    base = "infra-rundeck-" + value
    return f"{base}-{_safe_host(host)}" if host else base

def collections(root=ROOT):
    initialize(root)
    rows = [json.loads(path.read_text()) for path in (root / "manifests").glob("infra-rundeck-*.json")]
    return sorted(rows, key=lambda row: (int(row["execution_id"]), str(row.get("host") or "")), reverse=True)

def _persist_db(row, parsed):
    engine = get_engine()
    if engine is None:
        return "DISABLED"
    with engine.begin() as conn:
        conn.execute(text("""
          INSERT INTO rundeck_infra_collections
          (collection_id, execution_id, host, status, snapshot_ts, sample_seconds, checksum_sha256, raw_path, size_bytes, created_at)
          VALUES (:collection_id,:execution_id,:host,:status,:snapshot_ts,:sample_seconds,:checksum,:raw_path,:size_bytes,:created_at)
          ON CONFLICT (collection_id) DO UPDATE SET status=EXCLUDED.status, snapshot_ts=EXCLUDED.snapshot_ts,
            sample_seconds=EXCLUDED.sample_seconds, checksum_sha256=EXCLUDED.checksum_sha256, raw_path=EXCLUDED.raw_path,
            size_bytes=EXCLUDED.size_bytes
        """), {**row, "host": parsed["hostname"], "snapshot_ts": parsed["snapshot_ts"], "sample_seconds": parsed["sample_seconds"]})
        conn.execute(text("DELETE FROM rundeck_infra_filesystems WHERE collection_id=:collection_id"), row)
        for fs in parsed["filesystems"]:
            conn.execute(text("""
              INSERT INTO rundeck_infra_filesystems
              (collection_id, host, collected_at, device, mount_point, fstype, used_pct, total_bytes, avail_bytes, is_primary, details)
              VALUES (:collection_id,:host,:collected_at,:device,:mount_point,:fstype,:used_pct,:total_bytes,:avail_bytes,:is_primary,CAST(:details AS jsonb))
            """), {
                "collection_id": row["collection_id"], "host": parsed["hostname"], "collected_at": parsed["snapshot_ts"],
                "device": fs.get("device"), "mount_point": fs.get("mount"), "fstype": fs.get("fstype"),
                "used_pct": fs.get("used_pct"), "total_bytes": fs.get("total_bytes"), "avail_bytes": fs.get("avail_bytes"),
                "is_primary": bool(fs.get("is_primary")), "details": json.dumps(fs.get("details") or {}),
            })
        conn.execute(text("DELETE FROM rundeck_infra_samples WHERE collection_id=:collection_id"), row)
        for kind in ("network", "storage"):
            for index, sample in enumerate(parsed[kind]):
                key = sample.get("interface") or sample.get("iface") or sample.get("disk") or sample.get("mount") or str(index)
                conn.execute(text("""
                  INSERT INTO rundeck_infra_samples
                  (collection_id, host, collected_at, kind, sample_key, metrics)
                  VALUES (:collection_id,:host,:collected_at,:kind,:sample_key,CAST(:metrics AS jsonb))
                """), {
                    "collection_id": row["collection_id"], "host": parsed["hostname"], "collected_at": parsed["snapshot_ts"],
                    "kind": kind, "sample_key": str(key), "metrics": json.dumps(sample),
                })
    return "STORED"

def _ingest_one(execution, raw, expected_host, root, multi=False):
    initialize(root)
    parsed = parse(raw)
    if parsed["hostname"] != expected_host:
        raise ValueError(f"Unexpected infra host: expected {expected_host}, got {parsed['hostname']}")
    if str(execution.get("status") or "").lower() != "succeeded":
        raise ValueError("Rundeck infra execution did not succeed")
    cid = identifier(execution["id"], expected_host if multi else None)
    manifest = root / "manifests" / f"{cid}.json"
    if manifest.exists():
        previous = json.loads(manifest.read_text())
        if previous.get("database_status") != "ERROR":
            return previous
    archive = root / "archive" / f"{cid}.log.gz"
    with gzip.open(archive, "wb", compresslevel=6) as stream:
        stream.write(raw)
    row = {
        "collection_id": cid, "execution_id": str(execution["id"]), "status": "READY",
        "host": parsed["hostname"], "snapshot_ts": parsed["snapshot_ts"].isoformat(),
        "sample_seconds": parsed["sample_seconds"], "checksum": hashlib.sha256(raw).hexdigest(),
        "raw_path": str(archive.relative_to(root)), "size_bytes": len(raw), "created_at": now(),
        "filesystem_count": len(parsed["filesystems"]), "network_count": len(parsed["network"]),
        "storage_count": len(parsed["storage"]),
    }
    try:
        row["database_status"] = _persist_db(row, parsed)
    except Exception as error:
        row["database_status"] = "ERROR"
        row["database_error_type"] = type(error).__name__
    _write(manifest, row)
    return row

def ingest(execution, raw, expected_host, root=ROOT):
    return _ingest_one(execution, raw, expected_host, root, multi=False)

def ingest_many(execution, raw_by_host, expected_hosts, root=ROOT):
    expected = [str(host).strip() for host in expected_hosts if str(host).strip()]
    if len(expected) < 2 or len(set(expected)) != len(expected):
        raise ValueError("Multi-host infrastructure ingestion requires unique expected hosts")
    missing = [host for host in expected if host not in raw_by_host]
    if missing:
        raise ValueError("Missing infrastructure output for: " + ",".join(missing))
    rows = [_ingest_one(execution, raw_by_host[host], host, root, multi=True) for host in expected]
    return {
        "execution_id": str(execution["id"]),
        "hosts": expected,
        "collection_ids": [row["collection_id"] for row in rows],
        "database_status": "STORED" if all(row.get("database_status") == "STORED" for row in rows) else "PARTIAL",
        "items": rows,
    }

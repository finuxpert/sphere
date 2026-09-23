"""Parser for the read-only SPHERE-INFRA-V1 collector contract."""
from __future__ import annotations
import re
import shlex
from datetime import datetime, timezone

SECTION_MARKERS = {
    "filesystem": ("## SPHERE-INFRA-FS-V1-BEGIN", "## SPHERE-INFRA-FS-V1-END"),
    "network": ("## SPHERE-INFRA-NET-V1-BEGIN", "## SPHERE-INFRA-NET-V1-END"),
    "storage": ("## SPHERE-INFRA-DISK-V1-BEGIN", "## SPHERE-INFRA-DISK-V1-END"),
    "diskmap": ("## SPHERE-INFRA-DISKMAP-V1-BEGIN", "## SPHERE-INFRA-DISKMAP-V1-END"),
}

def _number(value):
    if value in (None, "", "-", "NA", "N/A"):
        return None
    raw = str(value).strip().rstrip("%")
    try:
        return float(raw)
    except ValueError:
        return None

def _fields(line):
    line = line.strip()
    if not line or line.startswith("#"):
        return {}
    tokens = shlex.split(line.replace("\t", " "))
    row = {}
    positional = []
    for token in tokens:
        if "=" in token:
            key, value = token.split("=", 1)
            row[key.strip().lower()] = value.strip()
        else:
            positional.append(token)
    if positional:
        row["_positional"] = positional
    return row

def _section(text, name):
    begin, end = SECTION_MARKERS[name]
    match = re.search(rf"^{re.escape(begin)}\s*$\n(.*?)^{re.escape(end)}\s*$", text, re.M | re.S)
    if not match:
        raise ValueError(f"Missing or truncated {name} section")
    return [line for line in match.group(1).splitlines() if line.strip() and not line.lstrip().startswith("#")]

def _header(text):
    match = re.search(r"^## SPHERE-INFRA-V1-BEGIN\s*$\n(.*?)^## SPHERE-INFRA-FS-V1-BEGIN\s*$", text, re.M | re.S)
    if not match:
        raise ValueError("SPHERE-INFRA-V1 envelope missing")
    values = {}
    for line in match.group(1).splitlines():
        if "\t" in line:
            key, value = line.split("\t", 1)
        elif "=" in line:
            key, value = line.split("=", 1)
        else:
            parts = line.split(None, 1)
            if len(parts) != 2:
                continue
            key, value = parts
        values[key.strip().lower()] = value.strip()
    return values

def _mount(row):
    pos = row.get("_positional", [])
    return row.get("mount") or row.get("mountpoint") or row.get("target") or (pos[0] if pos and str(pos[0]).startswith("/") else None)

def _device(row):
    return row.get("device") or row.get("dev") or row.get("source")

def _filesystem_rows(lines):
    rows = []
    for line in lines:
        row = _fields(line)
        pos = list(row.get("_positional", []))

        # Real collector positional contract:
        # filesystem <device> <fstype> <size_kb> <avail_kb> <used_pct> <mount>
        if pos and pos[0].lower() == "filesystem":
            pos = pos[1:]

        device = _device(row)
        fstype = row.get("fstype") or row.get("type")
        mount = _mount(row)
        used = _number(row.get("used_pct") or row.get("use_pct") or row.get("capacity_pct"))
        total_bytes = _number(row.get("total_bytes") or row.get("size_bytes"))
        avail_bytes = _number(row.get("avail_bytes") or row.get("available_bytes"))

        if len(pos) >= 6:
            device = device or pos[0]
            fstype = fstype or pos[1]
            total_kb = _number(pos[2])
            avail_kb = _number(pos[3])
            used = used if used is not None else _number(pos[4])
            mount = mount or pos[5]
            if total_bytes is None and total_kb is not None:
                total_bytes = int(total_kb * 1024)
            if avail_bytes is None and avail_kb is not None:
                avail_bytes = int(avail_kb * 1024)
        elif used is None and len(pos) >= 2 and str(pos[1]).endswith("%"):
            used = _number(pos[1])

        if not mount:
            raise ValueError(f"Filesystem mount missing: {line}")

        rows.append({
            "device": device,
            "mount": mount,
            "fstype": fstype,
            "used_pct": used,
            "total_bytes": total_bytes,
            "avail_bytes": avail_bytes,
            "details": row,
        })
    return rows

def _dedupe_filesystems(rows):
    groups = {}
    output = []
    for row in rows:
        key = row.get("device") or f"mount:{row.get('mount')}"
        groups.setdefault(key, []).append(row)
    for group in groups.values():
        primary = next((row for row in group if row.get("mount") == "/"), None)
        if primary is None:
            primary = sorted(group, key=lambda row: (len(row.get("mount") or "~"), row.get("mount") or "~"))[0]
        for row in group:
            output.append({**row, "is_primary": row is primary})
    return output

def _generic_rows(lines):
    return [_fields(line) for line in lines]

def _diskmap(rows):
    mapping = {}
    for row in rows:
        pos = row.get("_positional", [])
        disk = row.get("disk") or row.get("device") or row.get("name") or (pos[0] if pos else None)
        mount = _mount(row) or (pos[1] if len(pos) > 1 and str(pos[1]).startswith("/") else None)
        if disk and mount:
            mapping[str(disk).removeprefix("/dev/")] = mount
    return mapping

def parse(raw):
    text = raw.decode("utf-8-sig", errors="strict") if isinstance(raw, (bytes, bytearray)) else str(raw)
    if "\x00" in text or not text.strip():
        raise ValueError("Infra output is empty or binary")
    if not re.search(r"^## SPHERE-INFRA-V1-BEGIN\s*$", text, re.M) or not re.search(r"^## SPHERE-INFRA-V1-END\s*$", text, re.M):
        raise ValueError("SPHERE-INFRA-V1 envelope missing or truncated")
    header = _header(text)
    host = header.get("hostname")
    if not host:
        raise ValueError("Infra hostname missing")
    snapshot = header.get("snapshot_ts")
    try:
        collected_at = datetime.fromisoformat(snapshot.replace("Z", "+00:00")) if snapshot else datetime.now(timezone.utc)
    except ValueError:
        raise ValueError("Invalid infra snapshot_ts") from None
    if collected_at.tzinfo is None:
        collected_at = collected_at.replace(tzinfo=timezone.utc)
    filesystems = _dedupe_filesystems(_filesystem_rows(_section(text, "filesystem")))
    network = _generic_rows(_section(text, "network"))
    storage = _generic_rows(_section(text, "storage"))
    diskmap_rows = _generic_rows(_section(text, "diskmap"))
    mapping = _diskmap(diskmap_rows)
    normalized_storage = []
    for row in storage:
        pos = row.get("_positional", [])
        disk = row.get("disk") or row.get("device") or row.get("name") or (pos[0] if pos else None)
        key = str(disk or "").removeprefix("/dev/")
        normalized_storage.append({**row, "disk": key or None, "mount": row.get("mount") or mapping.get(key)})
    return {
        "hostname": host,
        "snapshot_ts": collected_at,
        "sample_seconds": _number(header.get("sample_seconds")),
        "filesystems": filesystems,
        "network": network,
        "storage": normalized_storage,
        "diskmap": diskmap_rows,
    }

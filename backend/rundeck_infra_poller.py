"""Scheduled read-only ingestion for dedicated SPHERE Infrastructure Rundeck jobs."""
from __future__ import annotations
import fcntl
import json
import os
import re
from urllib.parse import quote, urlencode
from backend.rundeck_credentials import credential_mode, read_credential
from backend.rundeck_poller import API_VERSION, execution_matches, output_text, request
from backend.rundeck_infra_store import ROOT, collections, ingest, ingest_many, initialize, now

def _write(path, value):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, indent=2))
    tmp.replace(path)

def _source_name():
    value = re.sub(r"[^A-Za-z0-9_.-]+", "-", os.getenv("RUNDECK_INFRA_SOURCE", "").strip())
    return value[:64]

def _state_path(kind):
    source = _source_name()
    suffix = f"-{source}" if source else ""
    return ROOT / f"{kind}{suffix}.json"

def _lock_path():
    source = _source_name()
    suffix = f"-{source}" if source else ""
    return ROOT / f"poller{suffix}.lock"

def _expected_hosts():
    multi = [host.strip() for host in os.getenv("RUNDECK_INFRA_EXPECTED_HOSTS", "").split(",") if host.strip()]
    if multi:
        return multi
    single = os.getenv("RUNDECK_INFRA_EXPECTED_HOST", "AOPH1QAPPDC").strip()
    return [single] if single else []

def _group_output_entries(payload, expected_hosts):
    if not payload.get("completed") or not payload.get("execCompleted"):
        raise ValueError("Rundeck infrastructure execution output is not complete")
    entries = payload.get("entries")
    if not isinstance(entries, list) or not entries:
        raise ValueError("Rundeck infrastructure execution output is empty")
    grouped = {host: [] for host in expected_hosts}
    for entry in entries:
        if not isinstance(entry, dict) or "log" not in entry:
            continue
        node = str(entry.get("node") or "").strip()
        if node in grouped:
            grouped[node].append(str(entry.get("log", "")))
    missing = [host for host, lines in grouped.items() if not lines]
    if missing:
        raise ValueError("Rundeck output missing node streams: " + ",".join(missing))
    return {host: ("\n".join(lines) + "\n").encode("utf-8") for host, lines in grouped.items()}

def output_by_node(execution_id, token, expected_hosts):
    payload = json.loads(request(
        f"/api/{API_VERSION}/execution/{execution_id}/output?format=json&offset=0",
        token,
        "application/json",
    ))
    return _group_output_entries(payload, expected_hosts)

def poll():
    initialize()
    with _lock_path().open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        project = os.getenv("RUNDECK_INFRA_PROJECT", "Linux").strip()
        group = os.getenv("RUNDECK_INFRA_JOB_GROUP", "SAP/AOQ").strip()
        name = os.getenv("RUNDECK_INFRA_JOB_NAME", "SPHERE Infrastructure Collector - AOQ APP1").strip()
        expected_hosts = _expected_hosts()
        mode = credential_mode("rundeck-reader", "RUNDECK_TOKEN_FILE")
        if not all((project, group, name)) or not expected_hosts or len(set(expected_hosts)) != len(expected_hosts) or mode == "missing":
            _write(_state_path("poller"), {"status":"NOT_CONFIGURED","checked_at":now(),"credential_mode":mode})
            return
        token = read_credential("rundeck-reader", "RUNDECK_TOKEN_FILE")
        query = urlencode({"groupPathExact":group,"jobFilter":name,"adhoc":"false","max":20,"offset":0})
        page = json.loads(request(f"/api/{API_VERSION}/project/{quote(project, safe='')}/executions?"+query, token, "application/json"))
        executions = [row for row in page.get("executions", []) if execution_matches(row, group, name)]
        if not executions:
            _write(_state_path("poller"), {"status":"NO_MATCH","checked_at":now(),"project":project,"job_group":group,"job_name":name})
            return
        execution = max(executions, key=lambda row: int(row["id"]))
        eid = str(execution["id"])
        state = str(execution.get("status") or "").lower()
        if state in ("running","scheduled"):
            _write(_state_path("poller"), {"status":"WAITING","checked_at":now(),"latest_execution":eid})
            return

        complete_hosts = {
            row.get("host")
            for row in collections()
            if row.get("execution_id") == eid and row.get("database_status") == "STORED"
        }
        if all(host in complete_hosts for host in expected_hosts):
            _write(_state_path("poller"), {
                "status":"OK","checked_at":now(),"processed":0,"latest_execution":eid,
                "hosts":expected_hosts,"job_id_observed":(execution.get("job") or {}).get("id")
            })
            return

        if state != "succeeded":
            raise ValueError("Rundeck infrastructure execution did not succeed")

        if len(expected_hosts) == 1:
            raw = output_text(eid, token)
            result = ingest(execution, raw, expected_hosts[0])
            db_status = result.get("database_status")
            state_payload = {
                "status":"OK" if db_status == "STORED" else "ERROR",
                "checked_at":now(),"processed":1,"latest_execution":eid,
                "collection_id":result["collection_id"],"hosts":expected_hosts,
                "database_status":db_status,
                "job_id_observed":(execution.get("job") or {}).get("id")
            }
        else:
            raw_by_host = output_by_node(eid, token, expected_hosts)
            result = ingest_many(execution, raw_by_host, expected_hosts)
            db_status = result.get("database_status")
            state_payload = {
                "status":"OK" if db_status == "STORED" else "PARTIAL",
                "checked_at":now(),"processed":len(expected_hosts),"latest_execution":eid,
                "collection_ids":result["collection_ids"],"hosts":expected_hosts,
                "database_status":db_status,
                "job_id_observed":(execution.get("job") or {}).get("id")
            }
        _write(_state_path("poller"), state_payload)
        if state_payload["status"] != "OK":
            raise RuntimeError("Infrastructure ingestion did not persist all expected hosts")

if __name__ == "__main__":
    try:
        poll()
    except BlockingIOError:
        _write(_state_path("poller"), {"status":"BUSY","checked_at":now()})

"""Scheduled read-only ingestion for the dedicated SPHERE Infrastructure Rundeck job."""
from __future__ import annotations
import fcntl
import json
import os
from urllib.parse import quote, urlencode
from backend.rundeck_credentials import credential_mode, read_credential
from backend.rundeck_poller import API_VERSION, execution_matches, output_text, request
from backend.rundeck_infra_store import ROOT, collections, ingest, initialize, now

def _write(path, value):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, indent=2))
    tmp.replace(path)

def poll():
    initialize()
    with (ROOT / "poller.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        project = os.getenv("RUNDECK_INFRA_PROJECT", "Linux").strip()
        group = os.getenv("RUNDECK_INFRA_JOB_GROUP", "SAP/AOQ").strip()
        name = os.getenv("RUNDECK_INFRA_JOB_NAME", "SPHERE Infrastructure Collector - AOQ APP1").strip()
        expected_host = os.getenv("RUNDECK_INFRA_EXPECTED_HOST", "AOPH1QAPPDC").strip()
        mode = credential_mode("rundeck-reader", "RUNDECK_TOKEN_FILE")
        if not all((project, group, name, expected_host)) or mode == "missing":
            _write(ROOT / "poller.json", {"status":"NOT_CONFIGURED","checked_at":now(),"credential_mode":mode})
            return
        token = read_credential("rundeck-reader", "RUNDECK_TOKEN_FILE")
        query = urlencode({"groupPathExact":group,"jobFilter":name,"adhoc":"false","max":20,"offset":0})
        page = json.loads(request(f"/api/{API_VERSION}/project/{quote(project, safe='')}/executions?"+query, token, "application/json"))
        executions = [row for row in page.get("executions", []) if execution_matches(row, group, name)]
        if not executions:
            _write(ROOT / "poller.json", {"status":"NO_MATCH","checked_at":now(),"project":project,"job_group":group,"job_name":name})
            return
        execution = max(executions, key=lambda row: int(row["id"]))
        eid = str(execution["id"])
        state = str(execution.get("status") or "").lower()
        if state in ("running","scheduled"):
            _write(ROOT / "poller.json", {"status":"WAITING","checked_at":now(),"latest_execution":eid})
            return
        known = {
            row["execution_id"]
            for row in collections()
            if row.get("database_status") != "ERROR"
        }
        if eid in known:
            _write(ROOT / "poller.json", {"status":"OK","checked_at":now(),"processed":0,"latest_execution":eid,"job_id_observed":(execution.get("job") or {}).get("id")})
            return
        raw = output_text(eid, token) if state == "succeeded" else b""
        result = ingest(execution, raw, expected_host)
        _write(ROOT / "poller.json", {"status":"OK","checked_at":now(),"processed":1,"latest_execution":eid,"collection_id":result["collection_id"],"job_id_observed":(execution.get("job") or {}).get("id")})

if __name__ == "__main__":
    try:
        poll()
    except BlockingIOError:
        _write(ROOT / "poller.json", {"status":"BUSY","checked_at":now()})

"""Bounded self-healing guard for the single approved SPHERE Rundeck collector job."""
from __future__ import annotations

import fcntl
import json
import os
from datetime import datetime, timezone
from urllib.parse import quote, urlencode
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from backend.rundeck_credentials import credential_mode, read_credential
from backend.rundeck_store import ROOT, initialize, now, write_json

BASE = "http://10.14.55.205:4440"
API_VERSION = 44
EVENT_LIMIT = 200
EVENT_MAX_BYTES = 1024 * 1024


def append_event(event: dict):
    """Append a bounded, credential-free watchdog audit event."""
    path = ROOT / "watchdog-events.jsonl"
    lock_path = ROOT / "watchdog-events.lock"
    payload = {"at": now(), **event}
    initialize()
    with lock_path.open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        with path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(payload, separators=(",", ":")) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        try:
            if path.stat().st_size > EVENT_MAX_BYTES:
                lines = path.read_text(encoding="utf-8", errors="replace").splitlines()[-EVENT_LIMIT:]
                temporary = path.with_suffix(".tmp")
                temporary.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
                temporary.replace(path)
        except OSError:
            pass


def read_events(limit: int = 50) -> list[dict]:
    path = ROOT / "watchdog-events.jsonl"
    if not path.is_file():
        return []
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()[-max(1, min(limit, EVENT_LIMIT)):]
    except OSError:
        return []
    items = []
    for line in reversed(lines):
        try:
            value = json.loads(line)
            if isinstance(value, dict):
                items.append(value)
        except ValueError:
            continue
    return items


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _request(path: str, token: str, method: str = "GET") -> dict:
    opener = build_opener(ProxyHandler({}), NoRedirect())
    request = Request(BASE + path, method=method, data=b"" if method != "GET" else None,
                      headers={"X-Rundeck-Auth-Token": token, "Accept": "application/json"})
    with opener.open(request, timeout=20) as response:
        if response.status not in (200, 201):
            raise RuntimeError(f"Unexpected Rundeck HTTP status {response.status}")
        if response.headers.get_content_type() in ("text/html", "application/xhtml+xml"):
            raise RuntimeError("Rundeck authentication returned HTML")
        raw = response.read(1024 * 1024)
    return json.loads(raw.decode("utf-8")) if raw else {}


def _parse_iso(value) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def execution_age_seconds(execution: dict, at: datetime | None = None) -> int | None:
    started = _parse_iso((execution.get("date-started") or {}).get("date"))
    if started is None:
        return None
    current = at or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    return max(0, int((current.astimezone(timezone.utc) - started.astimezone(timezone.utc)).total_seconds()))


def job_matches(execution: dict, job_id: str, project: str, group: str, name: str) -> bool:
    job = execution.get("job") or {}
    return (str(job.get("id") or "").strip() == job_id.strip()
            and str(job.get("project") or project).strip() == project.strip()
            and str(job.get("group") or "").strip() == group.strip()
            and str(job.get("name") or "").strip() == name.strip())


def watchdog_decision(age_seconds: int | None, confirmations: int, warning_seconds: int,
                      abort_seconds: int, required_confirmations: int) -> str:
    if age_seconds is None or age_seconds < warning_seconds:
        return "NORMAL"
    if age_seconds >= abort_seconds and confirmations >= required_confirmations:
        return "ABORT"
    return "WARNING"


def _load_state() -> dict:
    path = ROOT / "watchdog.json"
    try:
        value = json.loads(path.read_text()) if path.is_file() else {}
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def _write(state: dict):
    state["checked_at"] = now()
    write_json(ROOT / "watchdog.json", state)


def run():
    initialize()
    previous = _load_state()
    enabled = os.getenv("SPHERE_WATCHDOG_ENABLED", "true").strip().lower() == "true"
    auto_abort = os.getenv("SPHERE_WATCHDOG_AUTO_ABORT", "false").strip().lower() == "true"
    warning_seconds = max(60, int(os.getenv("SPHERE_WATCHDOG_WARNING_SECONDS", "300")))
    abort_seconds = max(warning_seconds + 60, int(os.getenv("SPHERE_WATCHDOG_ABORT_SECONDS", "600")))
    required_confirmations = max(2, int(os.getenv("SPHERE_WATCHDOG_CONFIRMATIONS", "2")))
    project = os.getenv("RUNDECK_PROJECT", "Linux").strip()
    group = os.getenv("RUNDECK_JOB_GROUP", "").strip()
    name = os.getenv("RUNDECK_JOB_NAME", "").strip()
    job_id = os.getenv("RUNDECK_RUN_JOB_ID", "").strip()
    reader_mode = credential_mode("rundeck-reader", "RUNDECK_TOKEN_FILE")
    total = int(previous.get("auto_abort_total") or 0)

    if not enabled:
        _write({"status": "DISABLED", "auto_abort_enabled": auto_abort, "auto_abort_total": total})
        return
    if not job_id or job_id.startswith("REPLACE_") or not project or not group or not name or reader_mode == "missing":
        _write({"status": "NOT_CONFIGURED", "auto_abort_enabled": auto_abort,
                "reader_credential_mode": reader_mode, "auto_abort_total": total})
        return

    try:
        reader = read_credential("rundeck-reader", "RUNDECK_TOKEN_FILE")
        query = urlencode({"jobIdFilter": job_id})
        page = _request(f"/api/{API_VERSION}/project/{quote(project, safe='')}/executions/running?{query}", reader)
        running = [row for row in page.get("executions", []) if job_matches(row, job_id, project, group, name)]
        if not running:
            _write({"status": "NORMAL", "auto_abort_enabled": auto_abort, "reader_credential_mode": reader_mode,
                    "auto_abort_total": total, "last_auto_recovery": previous.get("last_auto_recovery")})
            return

        execution = min(running, key=lambda row: int(row.get("id") or 0))
        execution_id = str(execution.get("id"))
        age = execution_age_seconds(execution)
        confirmations = int(previous.get("confirmations") or 0) + 1 if str(previous.get("execution_id") or "") == execution_id else 1
        decision = watchdog_decision(age, confirmations, warning_seconds, abort_seconds, required_confirmations)
        detected_stuck_at = previous.get("detected_stuck_at") if str(previous.get("execution_id") or "") == execution_id else None
        if decision != "NORMAL" and not detected_stuck_at:
            detected_stuck_at = now()
            append_event({"event": "EXECUTION_LONG_RUNNING", "execution_id": execution_id,
                          "started_at": (execution.get("date-started") or {}).get("date"),
                          "running_duration_seconds": age, "decision": decision})
        base = {"status": "WARNING" if decision != "NORMAL" else "NORMAL", "execution_id": execution_id,
                "execution_status": str(execution.get("status") or "running"),
                "started_at": (execution.get("date-started") or {}).get("date"),
                "running_duration_seconds": age, "confirmations": confirmations,
                "warning_seconds": warning_seconds, "abort_seconds": abort_seconds,
                "required_confirmations": required_confirmations, "auto_abort_enabled": auto_abort,
                "reader_credential_mode": reader_mode,
                "runner_credential_mode": credential_mode("rundeck-runner", "RUNDECK_RUNNER_TOKEN_FILE"),
                "detected_stuck_at": detected_stuck_at,
                "auto_abort_total": total, "last_auto_recovery": previous.get("last_auto_recovery")}
        if decision != "ABORT":
            _write(base); return
        if not auto_abort:
            append_event({"event": "AUTO_ABORT_BLOCKED", "execution_id": execution_id,
                          "reason": "AUTO_ABORT_DISABLED", "running_duration_seconds": age})
            _write({**base, "status": "CRITICAL", "recovery_action": "AUTO_ABORT_DISABLED"}); return
        if base["runner_credential_mode"] == "missing":
            append_event({"event": "RECOVERY_FAILED", "execution_id": execution_id,
                          "reason": "RUNNER_CREDENTIAL_MISSING", "running_duration_seconds": age})
            _write({**base, "status": "RECOVERY_FAILED", "recovery_action": "RUNNER_CREDENTIAL_MISSING"}); return

        runner = read_credential("rundeck-runner", "RUNDECK_RUNNER_TOKEN_FILE")
        result = _request(f"/api/{API_VERSION}/execution/{execution_id}/abort", runner, method="POST")
        abort_status = str((result.get("abort") or {}).get("status") or (result.get("execution") or {}).get("status") or "").lower()
        if abort_status not in {"aborted", "pending"}:
            append_event({"event": "RECOVERY_FAILED", "execution_id": execution_id,
                          "reason": "ABORT_REJECTED", "running_duration_seconds": age})
            _write({**base, "status": "RECOVERY_FAILED", "recovery_action": "ABORT_REJECTED"}); return
        recovered_at = now()
        recovery = {
            "execution_id": execution_id,
            "detected_stuck_at": detected_stuck_at,
            "aborted_at": recovered_at,
            "running_duration_seconds": age,
            "abort_status": abort_status,
            "status": "ABORTED",
            "next_successful_collection": None,
            "recovery_confirmed_at": None,
        }
        write_json(ROOT / "watchdog-recovery.json", recovery)
        append_event({"event": "AUTO_ABORT", **recovery})
        _write({**base, "status": "RECOVERED", "recovery_action": "AUTO_ABORT", "abort_status": abort_status,
                "auto_abort_total": total + 1, "last_auto_recovery": recovered_at})
    except Exception as error:
        append_event({"event": "WATCHDOG_ERROR", "error_type": type(error).__name__})
        _write({"status": "ERROR", "error_type": type(error).__name__, "auto_abort_enabled": auto_abort,
                "auto_abort_total": total, "last_auto_recovery": previous.get("last_auto_recovery")})
        raise


if __name__ == "__main__":
    run()

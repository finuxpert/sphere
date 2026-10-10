"""Secret-free, read-only Rundeck token expiry observations for the DEV System Data panel.

No token values are read or returned. This is not an authorization endpoint and
must not be used as a gate for credential mutation.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

OBSERVED_AT = "2026-10-10"
OBSERVATIONS = {
    "reader": {
        "label": "SPHERE Read Only - Monitoring",
        "identity": "sphere_api",
        "role": "sphere_reader",
        "expires_at": "2026-11-09T23:23:13+07:00",
    },
    "runner": {
        "label": "SPHERE DEV Runner (existing credential)",
        "identity": "admin",
        "role": "review-required",
        "expires_at": "2026-10-13T20:52:16+07:00",
    },
}

def _expiry(value: str | None):
    if not isinstance(value, str) or len(value) > 40:
        return None
    try:
        date = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return date if date.tzinfo else None
    except ValueError:
        return None

def _observed_record(key: str, record: dict, source: str, now: datetime) -> dict:
    expiry = _expiry(record.get("expires_at"))
    delta = (expiry - now).total_seconds() if expiry else None
    days_remaining = math.ceil(delta / 86400) if delta is not None else None
    if delta is None:
        state = "UNKNOWN"
    elif delta <= 0:
        state = "EXPIRED"
    elif delta <= 86400:
        state = "DUE_1D"
    elif delta <= 86400 * 3:
        state = "DUE_3D"
    elif delta <= 86400 * 7:
        state = "DUE_SOON"
    else:
        state = "REPORTED"
    return {
        "kind": key,
        "label": OBSERVATIONS[key]["label"] if source == "observation" else
                 ("Monitoring Reader" if key == "reader" else "Job Runner"),
        "identity": OBSERVATIONS[key]["identity"] if source == "observation" else "UNVERIFIED",
        "role": OBSERVATIONS[key]["role"] if source == "observation" else "UNVERIFIED",
        "expires_at": expiry.isoformat() if expiry else None,
        "days_remaining": days_remaining,
        "state": state,
        "source": source,
        "last_reported_at": OBSERVED_AT if source == "observation" else
                            (_expiry(record.get("reported_at")).isoformat()
                             if _expiry(record.get("reported_at")) else None),
        "live_verified": False,
        "renewal_allowed": False,
    }

def token_lifecycle(root: Path, now: datetime | None = None) -> dict:
    """Read optional operator-reported metadata; always fail closed for mutation."""
    now = now or datetime.now(timezone.utc)
    updates: dict = {}
    register = root / "credential-lifecycle.json"
    try:
        if register.is_file() and not register.is_symlink() and register.stat().st_size <= 16384:
            raw = json.loads(register.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                updates = raw
    except (OSError, ValueError, UnicodeError):
        pass

    results = []
    for key in ("reader", "runner"):
        candidate = updates.get(key)
        if isinstance(candidate, dict):
            results.append(_observed_record(key, candidate, "operator-register", now))
        else:
            results.append(_observed_record(key, OBSERVATIONS[key], "observation", now))

    return {
        "items": results,
        "renewal_enabled": False,
        "maintainer_auth_verified": False,
        "read_only": True,
        "message": "Expiry dates are reported observations, not live Rundeck token verification.",
    }

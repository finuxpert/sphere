"""Authentication/CSRF dependencies; future gateway endpoints MUST use require_ready."""
from __future__ import annotations

from functools import lru_cache
import hmac
import os

from fastapi import Depends, HTTPException, Request

from sphere_jumphost.security.auth_store import AuthSettings, AuthStore, COOKIE_NAME, Principal


@lru_cache(maxsize=1)
def get_auth_store() -> AuthStore:
    if not os.getenv("JUMPHOST_AUTH_DB"):
        raise HTTPException(status_code=503, detail="Authentication storage is not configured")
    try:
        return AuthStore(AuthSettings.from_env())
    except (ValueError, RuntimeError, OSError) as error:
        # Fail closed; never fall back to a default local password.
        raise HTTPException(status_code=503, detail="Authentication service unavailable") from error


def require_session(request: Request, store: AuthStore = Depends(get_auth_store)) -> Principal:
    principal = store.authenticate(request.cookies.get(COOKIE_NAME))
    if principal is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return principal


def require_csrf(request: Request, principal: Principal = Depends(require_session)) -> Principal:
    supplied = request.headers.get("x-jumphost-csrf", "")
    if not supplied or not hmac.compare_digest(supplied, principal.csrf_token):
        raise HTTPException(status_code=403, detail="CSRF token required")
    return principal


def require_ready(principal: Principal = Depends(require_csrf)) -> Principal:
    if principal.must_change_password:
        raise HTTPException(status_code=403, detail="Password change required before remote access")
    return principal

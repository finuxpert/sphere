"""Session-based admin login (DEV bootstrap opt-in, never default credentials in PROD)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from sphere_jumphost.security.auth_store import (
    AuthStore, COOKIE_NAME, SESSION_TTL_SECONDS, get_cookie_path,
    LoginDenied, LoginLocked, Principal,
)
from sphere_jumphost.security.dependencies import get_auth_store, require_csrf, require_session

router = APIRouter()


class LoginInput(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class PasswordChangeInput(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)


def session_view(principal: Principal) -> dict:
    return {"username": principal.username, "must_change_password": principal.must_change_password, "csrf_token": principal.csrf_token}


@router.post("/login")
def login(payload: LoginInput, response: Response, store: AuthStore = Depends(get_auth_store)) -> dict:
    try:
        token, principal = store.login(payload.username, payload.password)
    except LoginLocked:
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later") from None
    except LoginDenied:
        raise HTTPException(status_code=401, detail="Invalid credentials") from None
    response.set_cookie(
        COOKIE_NAME, token, max_age=SESSION_TTL_SECONDS, httponly=True,
        secure=store.settings.secure_cookie, samesite="strict", path=get_cookie_path(),
    )
    response.headers["Cache-Control"] = "no-store"
    return session_view(principal)


@router.get("/me")
def me(response: Response, principal: Principal = Depends(require_session)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return session_view(principal)


@router.post("/change-password")
def change_password(
    payload: PasswordChangeInput, response: Response,
    principal: Principal = Depends(require_csrf), store: AuthStore = Depends(get_auth_store),
) -> dict:
    try:
        store.change_password(principal, payload.current_password, payload.new_password)
    except LoginDenied:
        raise HTTPException(status_code=401, detail="Current password is incorrect") from None
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    response.delete_cookie(COOKIE_NAME, path=get_cookie_path(), secure=store.settings.secure_cookie, httponly=True, samesite="strict")
    response.headers["Cache-Control"] = "no-store"
    return {"status": "PASSWORD_UPDATED", "reauthentication_required": True}


@router.post("/logout")
def logout(response: Response, principal: Principal = Depends(require_csrf), store: AuthStore = Depends(get_auth_store)) -> dict:
    store.logout(principal)
    response.delete_cookie(COOKIE_NAME, path=get_cookie_path(), secure=store.settings.secure_cookie, httponly=True, samesite="strict")
    return {"status": "LOGGED_OUT"}

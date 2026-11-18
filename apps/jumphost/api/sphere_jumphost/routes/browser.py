"""Authenticated same-origin browser API proxy to a separate loopback worker.

Fail-closed and DEV-only. No arbitrary target fetch is performed by this API.
Worker must run under the dedicated sphere-remote-browser Linux identity.
"""
from __future__ import annotations

import os
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
import httpx
from pydantic import BaseModel, ConfigDict, Field

from sphere_jumphost.models import BrowserSessionRequest
from sphere_jumphost.security.auth_store import Principal
from sphere_jumphost.security.dependencies import require_ready, require_session

router = APIRouter()
WORKER = "http://127.0.0.1:8094"


class BrowserAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["click", "key", "text", "scroll"]
    x: int = Field(default=0, ge=0, lt=1280)
    y: int = Field(default=0, ge=0, lt=720)
    key: str = Field(default="", max_length=32)
    text: str = Field(default="", max_length=256)
    delta_y: int = Field(default=0, ge=-1000, le=1000)


def browser_enabled() -> bool:
    return (
        os.environ.get("JUMPHOST_ENV") == "dev"
        and os.environ.get("JUMPHOST_BROWSER_ENABLED", "0") == "1"
        and len(os.environ.get("SPHERE_BROWSER_WORKER_TOKEN", "")) >= 32
    )


def demo_enabled() -> bool:
    """Independent flag for a completely offline demo (no internal network access)."""
    return (
        os.environ.get("JUMPHOST_ENV") == "dev"
        and os.environ.get("JUMPHOST_BROWSER_DEMO_ENABLED", "0") == "1"
        and len(os.environ.get("SPHERE_BROWSER_WORKER_TOKEN", "")) >= 32
    )


def safe_session_id(sid: str) -> str:
    # Base64url of 24 random bytes. Never allow path separators in worker paths.
    if not re.fullmatch(r"[A-Za-z0-9_-]{32}", sid):
        raise HTTPException(404, "Session not found")
    return sid


async def forward(method: str, path: str, principal: Principal, data: dict | None = None) -> httpx.Response:
    if principal.must_change_password:
        raise HTTPException(403, "Password rotation required")
    if not (browser_enabled() or demo_enabled()):
        raise HTTPException(503, "Remote browser is disabled until approved")

    headers = {
        "X-Sphere-Worker-Token": os.environ["SPHERE_BROWSER_WORKER_TOKEN"],
        "X-Sphere-Owner": principal.token_digest,
    }
    try:
        async with httpx.AsyncClient(timeout=30.0, trust_env=False, follow_redirects=False) as client:
            r = await client.request(method, WORKER + path, json=data, headers=headers)
    except (httpx.HTTPError, TimeoutError) as exc:
        raise HTTPException(502, "Browser worker unavailable") from exc

    if r.status_code >= 400:
        if r.status_code in (400, 403, 404, 410, 422, 429, 503):
            detail = "Browser action failed"
            try:
                detail = str(r.json().get("detail", detail))[:180]
            except ValueError:
                pass
            raise HTTPException(r.status_code, detail)
        raise HTTPException(502, "Browser worker operation failed")
    return r


@router.post("/demo", status_code=201)
async def start_offline_demo(principal: Principal = Depends(require_ready)):
    if not demo_enabled():
        raise HTTPException(503, "Offline demo is disabled")
    r = await forward("POST", "/v1/demo", principal)
    return r.json()


@router.post("/sessions", status_code=201)
async def create_browser_session(
    request: BrowserSessionRequest,
    principal: Principal = Depends(require_ready),
):
    if not browser_enabled():
        raise HTTPException(503, "Remote browser is disabled until approved")
    r = await forward("POST", "/v1/sessions", principal, request.model_dump())
    return r.json()


@router.get("/sessions/{sid}/frame")
async def get_browser_frame(sid: str, principal: Principal = Depends(require_session)):
    r = await forward("GET", "/v1/sessions/" + safe_session_id(sid) + "/frame", principal)
    if r.headers.get("content-type", "").split(";")[0] != "image/jpeg":
        raise HTTPException(502, "Unexpected browser image format")
    return Response(r.content, media_type="image/jpeg", headers={
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    })


@router.post("/sessions/{sid}/actions")
async def browser_action(
    sid: str, action: BrowserAction, principal: Principal = Depends(require_ready),
):
    r = await forward("POST", "/v1/sessions/" + safe_session_id(sid) + "/actions", principal, action.model_dump())
    return r.json()


@router.delete("/sessions/{sid}", status_code=204)
async def close_browser_session(sid: str, principal: Principal = Depends(require_ready)):
    await forward("DELETE", "/v1/sessions/" + safe_session_id(sid), principal)
    return Response(status_code=204)

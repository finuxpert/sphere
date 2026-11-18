"""Single-target Chromium worker. Loopback only; never expose this app in Nginx.

Run as sphere-remote-browser, NOT the authenticated API service identity.
Network is additionally restricted by the systemd IPAddressAllow policy.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
import hmac
import ipaddress
import logging
import os
import re
import secrets
import time
from typing import Literal
from urllib.parse import urlsplit, quote

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from playwright.async_api import async_playwright

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
log = logging.getLogger("sphere.remote.browser")

WORKER_TOKEN = os.environ.get("SPHERE_BROWSER_WORKER_TOKEN", "")
TARGET_ORIGIN = os.environ.get("SPHERE_BROWSER_ALLOWED_ORIGIN", "").rstrip("/")
INSECURE_TLS = os.environ.get("SPHERE_BROWSER_DEV_INSECURE_TLS", "0") == "1"
IDLE_SECONDS = 180
MAX_LIFETIME_SECONDS = 1200
WIDTH, HEIGHT = 1280, 720

_rfc1918 = tuple(ipaddress.ip_network(net) for net in (
    "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"
))
_registry_lock = asyncio.Lock()
_sessions = {}


def origin(url: str) -> str:
    u = urlsplit(url)
    if u.scheme != "https" or not u.hostname or not u.port or u.username or u.password:
        raise ValueError("An explicit HTTPS IP address and port are required")
    if u.hostname != str(ipaddress.IPv4Address(u.hostname)):
        raise ValueError("Host must be a literal IPv4 address")
    if not any(ipaddress.ip_address(u.hostname) in net for net in _rfc1918):
        raise ValueError("Target must be a permitted RFC1918 IPv4 destination")
    return "https://" + u.hostname + ":" + str(u.port)


def configured_origin() -> str:
    try:
        result = origin(TARGET_ORIGIN)
        if result != TARGET_ORIGIN or len(WORKER_TOKEN) < 32:
            raise ValueError("Incomplete worker configuration")
        if INSECURE_TLS and os.getenv("JUMPHOST_ENV") != "dev":
            raise ValueError("TLS bypass is DEV-only")
        return result
    except (ValueError, ipaddress.AddressValueError) as exc:
        raise HTTPException(503, "Browser worker is not configured") from exc


def worker_auth(
    x_sphere_worker_token: str = Header(default=""),
    x_sphere_owner: str = Header(default=""),
) -> str:
    configured_origin()
    if not x_sphere_worker_token or not hmac.compare_digest(x_sphere_worker_token, WORKER_TOKEN):
        raise HTTPException(401, "Worker authentication required")
    if not re.fullmatch(r"[0-9a-f]{64}", x_sphere_owner):
        raise HTTPException(403, "Invalid owner")
    return x_sphere_owner


class Start(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str = Field(min_length=10, max_length=2048)


class Action(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["click", "key", "text", "scroll"]
    x: int = Field(default=0, ge=0, lt=WIDTH)
    y: int = Field(default=0, ge=0, lt=HEIGHT)
    key: str = Field(default="", max_length=32)
    text: str = Field(default="", max_length=256)
    delta_y: int = Field(default=0, ge=-1000, le=1000)


@dataclass
class Session:
    owner: str
    engine: object
    browser: object
    context: object
    page: object
    lock: asyncio.Lock
    created: float
    touched: float


async def stop(s: Session):
    async with s.lock:
        try:
            await s.browser.close()
        finally:
            await s.engine.stop()


async def purge():
    now = time.monotonic()
    for sid, s in list(_sessions.items()):
        if now - s.touched > IDLE_SECONDS or now - s.created > MAX_LIFETIME_SECONDS:
            del _sessions[sid]
            await stop(s)


def session_for(sid: str, owner: str) -> Session:
    s = _sessions.get(sid)
    if s is None or not hmac.compare_digest(s.owner, owner):
        raise HTTPException(404, "Session not found")
    now = time.monotonic()
    if now - s.touched > IDLE_SECONDS or now - s.created > MAX_LIFETIME_SECONDS:
        raise HTTPException(410, "Session expired")
    s.touched = now
    return s


@app.get("/health")
def health():
    return {"service": "sphere-browser-worker", "status": "ready"}


@app.post("/v1/sessions", status_code=201)
async def create_session(data: Start, owner: str = Depends(worker_auth)):
    expected = configured_origin()
    try:
        if origin(data.url) != expected:
            raise HTTPException(403, "Target not in allowlist")
    except (ValueError, ipaddress.AddressValueError) as exc:
        raise HTTPException(400, "Invalid browser destination") from exc

    async with _registry_lock:
        await purge()
        if _sessions:
            raise HTTPException(429, "Browser worker is busy (one session maximum)")

        engine = await async_playwright().start()
        browser = None
        try:
            browser = await engine.chromium.launch(headless=True, chromium_sandbox=True)
            context = await browser.new_context(
                viewport={"width": WIDTH, "height": HEIGHT},
                accept_downloads=False, service_workers="block",
                ignore_https_errors=INSECURE_TLS,
                permissions=[],
            )

            async def guard(route):
                u = route.request.url
                try:
                    if origin(u) == expected:
                        await route.continue_()
                        return
                except (ValueError, ipaddress.AddressValueError):
                    pass
                await route.abort()

            async def guard_websocket(ws):
                # HTTPS pages use WSS, not HTTPS, for WebSocket URLs.
                w = urlsplit(ws.url)
                if (w.scheme == "wss" and w.username is None and w.password is None
                        and w.hostname == urlsplit(expected).hostname
                        and w.port == urlsplit(expected).port):
                    await ws.connect_to_server()
                else:
                    await ws.close()

            await context.route("**/*", guard)
            await context.route_web_socket("**/*", guard_websocket)
            page = await context.new_page()
            response = await page.goto(expected + "/", wait_until="domcontentloaded", timeout=20000)
            if response is None or response.status >= 400:
                raise HTTPException(502, "Destination did not load successfully")
            sid = secrets.token_urlsafe(24)
            now = time.monotonic()
            _sessions[sid] = Session(owner, engine, browser, context, page, asyncio.Lock(), now, now)
            log.info("Browser session created")
            return {"session_id": sid, "width": WIDTH, "height": HEIGHT}
        except Exception:
            if browser is not None:
                await browser.close()
            await engine.stop()
            raise



DEMO_HTML = """<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>SPHERE Remote Offline Demo</title>
<style>
body{background:#101c2b;color:#e9f3ff;font:24px system-ui;margin:60px}
h1{font-size:42px}p{color:#b4d3f3}
input,button{padding:16px;font:22px system-ui;border-radius:9px}
button{background:#2877c9;color:#fff;border:0;cursor:pointer;margin:12px}
#result{font-size:24px;color:#a8f0c6;margin-top:30px}
</style></head><body>
<h1>SPHERE Remote · Demo Interaktif</h1>
<p>Ini halaman lokal Chromium, bukan DPA dan tanpa akses jaringan.</p>
<label for="name">Ketik sesuatu:</label>
<input id="name" placeholder="Uji keyboard" autocomplete="off">
<button id="button" onclick="go()">Klik saya</button>
<p id="result">Menunggu interaksi...</p>
<script>
let clicks=0;
function go(){
 clicks++;
 document.getElementById('result').textContent=
 'Klik: '+clicks+' | Input: '+document.getElementById('name').value;
}
</script></body></html>"""


@app.post("/v1/demo", status_code=201)
async def create_offline_demo(owner: str = Depends(worker_auth)):
    """Start an authenticated, network-disabled Chromium demo session."""
    if os.getenv("JUMPHOST_ENV") != "dev":
        raise HTTPException(503, "Offline browser demo is DEV-only")

    async with _registry_lock:
        await purge()
        if _sessions:
            raise HTTPException(429, "Browser worker is busy (one session maximum)")

        engine = await async_playwright().start()
        browser = None
        try:
            browser = await engine.chromium.launch(headless=True, chromium_sandbox=True)
            context = await browser.new_context(
                viewport={"width": WIDTH, "height": HEIGHT},
                accept_downloads=False, service_workers="block", permissions=[],
            )

            async def deny_network(route):
                await route.abort()

            async def deny_websocket(ws):
                await ws.close()

            await context.route("**/*", deny_network)
            await context.route_web_socket("**/*", deny_websocket)
            page = await context.new_page()
            await page.goto(
                "data:text/html;charset=utf-8," + quote(DEMO_HTML),
                wait_until="domcontentloaded", timeout=12000,
            )
            sid = secrets.token_urlsafe(24)
            now = time.monotonic()
            _sessions[sid] = Session(
                owner, engine, browser, context, page, asyncio.Lock(), now, now
            )
            log.info("Offline Chromium demo session started")
            return {"session_id": sid, "width": WIDTH, "height": HEIGHT, "demo": True}
        except Exception:
            if browser is not None:
                await browser.close()
            await engine.stop()
            raise


@app.get("/v1/sessions/{sid}/frame")
async def frame(sid: str, owner: str = Depends(worker_auth)):
    s = session_for(sid, owner)
    async with s.lock:
        raw = await s.page.screenshot(type="jpeg", quality=65, timeout=12000)
    return Response(raw, media_type="image/jpeg", headers={
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
    })


@app.post("/v1/sessions/{sid}/actions")
async def action(sid: str, data: Action, owner: str = Depends(worker_auth)):
    s = session_for(sid, owner)
    async with s.lock:
        if data.type == "click":
            await s.page.mouse.click(data.x, data.y)
        elif data.type == "scroll":
            await s.page.mouse.wheel(0, data.delta_y)
        elif data.type == "text":
            if not data.text:
                raise HTTPException(422, "Text is required")
            await s.page.keyboard.insert_text(data.text)
        elif data.type == "key":
            allowed = {"Enter", "Tab", "Escape", "Backspace", "Delete", "Space",
                       "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"}
            if data.key not in allowed:
                raise HTTPException(422, "Unsupported key")
            await s.page.keyboard.press(data.key)
    return {"status": "ok"}


@app.delete("/v1/sessions/{sid}", status_code=204)
async def close(sid: str, owner: str = Depends(worker_auth)):
    async with _registry_lock:
        s = session_for(sid, owner)
        del _sessions[sid]
        await stop(s)
    log.info("Browser session closed")
    return Response(status_code=204)


_reaper_task = None


async def reap_idle_sessions():
    while True:
        await asyncio.sleep(15)
        try:
            async with _registry_lock:
                await purge()
        except Exception:
            log.exception("Browser session cleanup failed")


@app.on_event("startup")
async def startup():
    global _reaper_task
    _reaper_task = asyncio.create_task(reap_idle_sessions())


@app.on_event("shutdown")
async def shutdown():
    if _reaper_task is not None:
        _reaper_task.cancel()
        await asyncio.gather(_reaper_task, return_exceptions=True)
    async with _registry_lock:
        for sid, s in list(_sessions.items()):
            del _sessions[sid]
            await stop(s)

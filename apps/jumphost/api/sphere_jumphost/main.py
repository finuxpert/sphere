"""Standalone FastAPI app. NEVER mounts into SPHERE Rundeck API."""
from fastapi import FastAPI

from sphere_jumphost import __version__
from sphere_jumphost.routes import auth, browser, health, ssh

app = FastAPI(title="SPHERE Jump Host API", version=__version__, docs_url=None, redoc_url=None, openapi_url=None)
app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(ssh.router, prefix="/api/v1/ssh", tags=["ssh"])
app.include_router(browser.router, prefix="/api/v1/browser", tags=["browser"])

"""Health remains public but has no session, target, or infrastructure details."""
from fastapi import APIRouter, Depends
from sphere_jumphost import __version__
from sphere_jumphost.security.auth_store import Principal
from sphere_jumphost.security.dependencies import require_session
from sphere_jumphost.routes.browser import browser_enabled

router = APIRouter()

@router.get("/health")
def health() -> dict[str, str]:
    return {"service": "sphere-jumphost", "version": __version__, "status": "BROWSER_DEV_GATED" if browser_enabled() else "SCAFFOLD_ONLY"}

@router.get("/capabilities")
def capabilities(_principal: Principal = Depends(require_session)) -> dict:
    return {"ssh_sessions": False, "browser_sessions": browser_enabled(), "authentication_configured": True, "status": "GATED_DEV" if browser_enabled() else "DISABLED"}

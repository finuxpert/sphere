"""Remote browser not active; never fetch arbitrary URLs from server."""
from fastapi import APIRouter, Depends, HTTPException
from sphere_jumphost.models import BrowserSessionRequest
from sphere_jumphost.security.auth_store import Principal
from sphere_jumphost.security.dependencies import require_ready

router = APIRouter()

@router.post("/sessions", status_code=501)
def create_browser_session(_request: BrowserSessionRequest, _principal: Principal = Depends(require_ready)) -> None:
    raise HTTPException(status_code=501, detail="Remote browser sessions are not implemented in scaffold")

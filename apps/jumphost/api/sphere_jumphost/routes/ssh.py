"""SSH session endpoint intentionally not active; authenticated, CSRF-checked and gated."""
from fastapi import APIRouter, Depends, HTTPException
from sphere_jumphost.models import SSHSessionRequest
from sphere_jumphost.security.auth_store import Principal
from sphere_jumphost.security.dependencies import require_ready

router = APIRouter()

@router.post("/sessions", status_code=501)
def create_ssh_session(_request: SSHSessionRequest, _principal: Principal = Depends(require_ready)) -> None:
    raise HTTPException(status_code=501, detail="SSH sessions are not implemented in scaffold")

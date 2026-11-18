# SPHERE Remote v0.3 — gated Chromium browser prototype

**DEV source only. Not yet an approved enterprise remote-access service.**
This code is fail-closed. Keep it disabled on externally accessible DEV until
corporate IT/security approves SSO/MFA, target authorization, audit retention
and endpoint hardening.

## Implemented

- React admin session + CSRF gate for browser create/input/close.
- Separate Chromium worker on loopback 127.0.0.1:8094 running as dedicated
  sphere-remote-browser user; not the monitoring API identity.
- One configured literal RFC1918 IPv4 HTTPS origin. Request routing enforces
  the origin for HTTPS/WSS; service workers and downloads are blocked.
- Worker-to-API shared secret (32+ characters) and per-login ownership.
- Chromium sandbox mandatory, no --no-sandbox fallback.
- Browser image polling via authenticated FastAPI, click, scroll, text input,
  selected keys; one active session, 3-minute idle / 20-minute absolute expiry.
- Existing SSH remains disabled; monitoring PROD unchanged.

## Limitations and prerequisites

- Corporate SSO/MFA, per-target approval, durable audit and security review
  are not implemented. Shared corporate NAT + app-only password is insufficient
  for unrestricted remote access.
- Screenshot polling ~1.2s is a DEV MVP, not WebSocket streaming. No clipboard,
  downloads/uploads, drag/drop, file chooser, new windows or arbitrary keys.
- Validate target HTTPS certificate. A DEV-only TLS bypass exists behind
  SPHERE_BROWSER_DEV_INSECURE_TLS=1, but only for approved isolated QA.
- The systemd worker policy denies all egress except localhost by default;
  an approved single-destination IPAddressAllow drop-in is mandatory.
- Do not enable with default admin/admin or to circumvent company policy.

## Deployment contract — reviewed DEV release only

1. Deploy approved apps/jumphost/api, browser_worker and web into a new
   /opt/sphere-jumphost-dev/releases/COMMIT release. Run QA before switching
   current. Preserve the existing auth.sqlite3.
2. Add fastapi==0.115.12 and uvicorn==0.34.2 to the isolated existing
   /opt/sphere-remote-browser-lab/venv. Do not uninstall Playwright.
3. Generate a unique worker token using openssl rand -hex 32. Deliver the
   SAME SPHERE_BROWSER_WORKER_TOKEN to two distinct root-managed 0640
   EnvironmentFiles:
   - /etc/sphere/jumphost-dev.env (root:sphere-jumphost)
   - /etc/sphere/remote-browser-dev.env (root:sphere-remote-browser)
   Never commit or paste secrets into chat, logs, CLI arguments or screenshots.
4. Worker file values:
   JUMPHOST_ENV=dev
   SPHERE_BROWSER_ALLOWED_ORIGIN=https://APPROVED_RFC1918_IP:PORT
   SPHERE_BROWSER_DEV_INSECURE_TLS=0
   SPHERE_BROWSER_WORKER_TOKEN=SECRET
   API file values:
   JUMPHOST_ENV=dev
   JUMPHOST_BROWSER_ENABLED=0
   SPHERE_BROWSER_WORKER_TOKEN=SECRET
5. Install ops/systemd/sphere-remote-browser-dev.service.example as
   sphere-remote-browser-dev.service. Default egress only localhost.
   After IT approval, add systemd drop-in IPAddressAllow=APPROVED_IP/32.
   systemctl daemon-reload and start worker.
6. Verify loopback worker health at http://127.0.0.1:8094/health and run
   tests. Nginx must NEVER expose worker port 8094 directly.
7. Only after authorization, set JUMPHOST_BROWSER_ENABLED=1 and restart
   standalone sphere-jumphost-dev-api; do not restart monitoring services.

## Required tests

- Python API: python -m unittest discover -s apps/jumphost/api/tests -v
  using the existing Python 3.12 jumphost API environment.
- Worker: from apps/jumphost/browser_worker run
  /opt/sphere-remote-browser-lab/venv/bin/python -m unittest -v test_policy
- Frontend: from apps/jumphost/web run
  JUMPHOST_WEB_BASE=/dev/remote/ npm run build
- Gate OFF: capabilities browser_sessions=false; anonymous create=401;
  authenticated create=503.
- Gate ON only in approved QA: fixed origin loads screenshot; mouse/keyboard
  work; unapproved destinations rejected; session ownership and expiry tested.
- Verify monitoring DEV and PROD still healthy.

## Rollback

Set JUMPHOST_BROWSER_ENABLED=0 and restart standalone DEV API.
Stop and disable sphere-remote-browser-dev.service. Restore previous
/opt/sphere-jumphost-dev/current release for UI regressions, keeping auth DB.
No Nginx changes required for rollback.

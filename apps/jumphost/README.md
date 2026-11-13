# SPHERE Jump Host — Authenticated Scaffold v0.2.1

**Standalone prototype**, not yet a functioning SSH/remote-browser gateway. Based on the `finuxpert/sphere` DEV repository structure. No existing SPHERE files are changed. Dev/prod route and service name are kept separate.

## Naming contract

| Concern | Name |
|---|---|
| Repository directory | `apps/jumphost/` |
| Python namespace | `sphere_jumphost` |
| Backend entrypoint | `sphere_jumphost.main:app` |
| UI path (DEV) | `/dev/jumphost/` |
| UI path (future PROD) | `/jumphost/` |
| External API path (DEV) | `/dev/jumphost/api/v1/` |
| External API path (future PROD) | `/jumphost/api/v1/` |
| Internal API path | `/api/v1/` |
| DEV service | `sphere-jumphost-dev-api` |
| PROD service (future) | `sphere-jumphost-prod-api` |
| Config prefix | `JUMPHOST_` |
| Auth database | `/var/lib/sphere-jumphost-{env}/auth.sqlite3` |

## Implemented in v0.2.1

- React login UI for an `admin` account, with forced change-password UI for first DEV login.
- Backend authentication backed by SQLite, 600,000-iteration salted PBKDF2-SHA256 password hashes; no plaintext password storage.
- Session token is random and stored as SHA-256 digest in DB; browser receives `HttpOnly`, `SameSite=Strict`, `Secure` session cookie (Secure can be disabled **DEV-only for loopback HTTP QA**).
- Backend CSRF validation for actions with an authenticated cookie (`X-Jumphost-CSRF` header).
- 8-hour absolute session expiration, logout/revocation, password-change revokes all account sessions.
- Login lockout after 5 failures for 15 minutes (persistent across service restarts). *Initial scaffold is single-admin; a real deployment requires distributed rate limits and enterprise identity integration.*
- All SSH and internal browser routes explicitly return `501` **even after authentication**. When unauthenticated, these routes return `401`, and when password rotation is pending, `403`.
- Capabilities endpoint requires authentication; health endpoint is intentionally public but minimal.

## Default credentials requested for DEV testing

**Username `admin` / password `admin` — only after explicit DEV bootstrap and only on a non-public, isolated test system.** These values are **not secure defaults**.

To activate DEV bootstrap, use `ops/jumphost-dev.env.example` as a reference:

```env
JUMPHOST_ENV=dev
JUMPHOST_PUBLIC_BASE_PATH=/dev/jumphost
JUMPHOST_AUTH_DB=/var/lib/sphere-jumphost-dev/auth.sqlite3
JUMPHOST_DEV_BOOTSTRAP_ADMIN_ADMIN=1
JUMPHOST_COOKIE_SECURE=1
```

Upon the first login, the user **must** choose a new password of at least 12 characters with letters and digits. Until this is done, API access to any remote session is denied. Changing password invalidates all sessions and requires a new login. **After first provisioning, set `JUMPHOST_DEV_BOOTSTRAP_ADMIN_ADMIN=0` so deleting/recreating the DB will not silently recreate weak credentials.**

**PROD cannot bootstrap admin/admin:** `JUMPHOST_ENV=prod` with `JUMPHOST_DEV_BOOTSTRAP_ADMIN_ADMIN=1` fails validation. Production requires an administrator-provisioned strong password, and should use corporate SSO/MFA as soon as developed. For the standalone local account scaffold, create the admin interactively:

```bash
# Run as the dedicated service account with JUMPHOST_ENV=prod and private auth storage.
cd apps/jumphost/api
python -m sphere_jumphost.provision_admin
```

Do not set passwords in shell history, committed env files, or CI logs. HTTPS and VPN allowlisting, MFA, target RBAC, session audit and SSRF controls remain prerequisites before any remote access is enabled.

## Structure

```text
apps/jumphost/
├── ARCHITECTURE.md
├── README.md
├── api/
│   ├── requirements.txt
│   ├── sphere_jumphost/
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── provision_admin.py
│   │   ├── routes/{auth,health,ssh,browser}.py
│   │   └── security/{auth_store,dependencies}.py
│   └── tests/{test_auth,test_contract,test_models}.py
├── web/
│   ├── src/{App,JumpHostWorkspace,main}.jsx
│   ├── src/styles.css
│   ├── package.json
│   └── vite.config.js
├── ops/
│   ├── jumphost-dev.env.example
│   ├── jumphost-prod.env.example
│   ├── nginx/jumphost-dev.locations.conf.example
│   └── systemd/sphere-jumphost-dev-api.service.example
└── tools/safe_copy.py
```

## Local DEV QA (not for public deployment)

```bash
cd apps/jumphost/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
mkdir -p /tmp/sphere-jumphost-local
export JUMPHOST_ENV=dev
export JUMPHOST_AUTH_DB=/tmp/sphere-jumphost-local/auth.sqlite3
export JUMPHOST_DEV_BOOTSTRAP_ADMIN_ADMIN=1
export JUMPHOST_COOKIE_SECURE=0  # DEV localhost HTTP ONLY
uvicorn sphere_jumphost.main:app --host 127.0.0.1 --port 8093
```

In another terminal:

```bash
cd apps/jumphost/web
npm install
JUMPHOST_WEB_BASE=/dev/jumphost/ npm run dev
# Open http://127.0.0.1:5174/dev/jumphost/
# Login admin/admin, change password, login again.
```

Vite proxies `/jumphost/api/*` to `127.0.0.1:8093/api/*`. Static files do **not** constitute a security boundary: backend endpoints must enforce authentication regardless of what is displayed in UI.

## Offline QA

```bash
cd apps/jumphost/api
python -m unittest discover -s tests -v
python -m compileall -q sphere_jumphost
# In apps/jumphost/web after dependencies are available:
JUMPHOST_WEB_BASE=/dev/jumphost/ npm run build
```

## Safe integration with repo

Extract in a clean workspace. Use `tools/safe_copy.py` in a branch derived from `rundeck-sphere-dev`:

```bash
python apps/jumphost/tools/safe_copy.py /path/to/sphere
python apps/jumphost/tools/safe_copy.py /path/to/sphere --apply
```

Dry run first. The copy tool refuses existing destinations, so it does not overwrite monitoring or Rundeck files. No production deploy config is applied by this scaffold. Nginx example remains `deny all` by default.

## Remaining mandatory gates

Enterprise identity (SSO/MFA), per-target RBAC and inventory, audit trail, network allowlist, DNS pinning and SSRF protection, SSH host-key verification, isolated Chromium, session controls, release/security review. No remote access traffic is initiated by v0.2.1.

## DEV routing correction (v0.2.1)

The initial v0.2.0 scaffold hardcoded `/jumphost/` and would conflict with the
existing SPHERE production vhost fallback. DEV MUST use `/dev/jumphost/`:

```bash
cd apps/jumphost/web
JUMPHOST_WEB_BASE=/dev/jumphost/ npm run build
```

The API service MUST set `JUMPHOST_PUBLIC_BASE_PATH=/dev/jumphost` so the session
cookie is scoped only to DEV Jump Host. Reusing the PROD build at this path
causes broken assets and login. The shipped Nginx template is **deny all**;
it must not be enabled without a verified corporate access policy. A DEV-only
`admin/admin` seed is permitted for localhost lab use and must be rotated
BEFORE any externally reachable Nginx route is enabled.

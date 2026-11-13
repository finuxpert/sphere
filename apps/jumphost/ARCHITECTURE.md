# SPHERE Remote: isolated auth scaffold (v0.2.2)

```text
Laptop (HTTPS) --> /dev/remote/ (DEV React SPA, login + workspace)
              --> /dev/remote/api/v1/* --> Nginx --> 127.0.0.1:8093/api/v1/*
                                                       |
                                      sphere_jumphost FastAPI
                                                       |
                              SQLite admin/session store (restricted 0600)
                                                       |
                           SSH 501 DISABLED / Browser 501 DISABLED
```

**Authentication:** HTTP-only, Secure, SameSite Strict session cookie (Path `/dev/remote` for DEV, `/remote` for future PROD); random token hashed in SQLite; server-side expiry; CSRF token returned on `/api/v1/auth/me` for same-origin UI. Rotating the password destroys all sessions. Weak `admin/admin` is opt-in only for DEV bootstrap, never accepted as PROD bootstrap, and forced to change before accessing protected remote routes. Even authenticated calls return 501 for SSH/browser sessions.

**Future SSH remote gateway:** dedicated `sphere_jumphost/ssh_gateway/`, not reused Rundeck API. Needs MFA, host allowlist, role authorization, host-key verification, connection lifecycle and audit.

**Future browser remote gateway:** dedicated `sphere_jumphost/browser_gateway/`, isolated per-user remote Chromium, explicit allowed destinations, and no unrestricted URL proxying. Do not use direct iframe from laptop to internal resources.

**Deployment:** separate service, env and persistence, dedicated non-root identity. Nginx example `deny all` by default. Never enable public network exposure merely because a login form exists. Recommended security review covers authentication, rate limit, CSRF, trust boundary, CSP, IP/VPN restriction, SSRF/DNS rebinding, audit, sessions and WebSocket handshake.

**External API:**

| Method/path (internal) | Result |
|---|---|
| GET `/api/v1/health` | non-sensitive liveness |
| POST `/api/v1/auth/login` | login + HttpOnly cookie |
| GET `/api/v1/auth/me` | authenticated session profile + CSRF |
| POST `/api/v1/auth/change-password` | current password + CSRF required; revoke all sessions |
| POST `/api/v1/auth/logout` | CSRF required; revoke session |
| GET `/api/v1/capabilities` | auth required; remote sessions disabled |
| POST `/api/v1/ssh/sessions` | auth + CSRF + password rotation gate; 501 |
| POST `/api/v1/browser/sessions` | auth + CSRF + password rotation gate; 501 |

All paths are private behind the reverse proxy until corporate approval. Keep API auth separate from monitoring API and do not reuse application credentials.

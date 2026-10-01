# SPHERE

SPHERE — **SAP Performance Health Evaluation & Reporting** — is a SAP performance monitoring, evaluation, investigation, and reporting platform for SAP operations.

Current application version on the Rundeck DEV and PROD lines: **v1.34.29**.

- Production: https://sphere.astraotoparts.co.id
- Development: https://sphere.astraotoparts.co.id/dev/

## Current positioning

SPHERE is not a replacement for SAP standard troubleshooting tools and it does not declare a final root cause automatically.

Its role is to centralize retained performance evidence, correlate SAP Application Server resource conditions with SAP workload context, support historical evaluation, and make the initial investigation path faster and more consistent.

Primary operating flow:

```text
Collect → Monitor → Detect → Correlate → Evaluate → Investigate → Report
```

The current source of truth for implemented flow and feature scope is:

`docs/CURRENT-FLOW-AND-FEATURES.md`

## Active release lines

The repository keeps four release branches:

| Branch | Purpose |
|---|---|
| `sphere-dev` | Manual Upload Logs development line |
| `sphere-prod` | Manual Upload Logs production line |
| `rundeck-sphere-dev` | Active Rundeck-integrated development/test line |
| `rundeck-sphere-prod` | Active Rundeck-integrated production line |

Temporary cleanup/hotfix branches may exist while work is in progress, but they are not release lines and should be removed after their changes are contained in an active branch.

Promotion path for the active Rundeck runtime:

```text
rundeck-sphere-dev
    ↓ QA + readiness
    ↓ Pull Request
rundeck-sphere-prod
    ↓ production build/deploy
https://sphere.astraotoparts.co.id
```

Do not develop directly on a production branch and do not force-reset a production branch to DEV.

## Data ingestion

SPHERE supports two intentional ingestion modes.

### Rundeck-integrated runtime

The active production runtime uses `rundeck-sphere-prod`.

Rundeck is responsible for SAP-side collection. SPHERE discovers completed Rundeck executions, reads retained execution output through the Rundeck REST API, validates/normalizes the evidence, stores operational history, and presents it through the SPHERE UI.

SPHERE must not SSH/SCP directly to SAP Application Servers.

### Manual fallback

Manual Upload Logs remains available as an operational fallback. The manual branch family (`sphere-dev` / `sphere-prod`) does not require the Rundeck REST API.

## Application architecture

- Frontend: React + Vite
- Backend: FastAPI
- Database: PostgreSQL
- Collector/orchestrator: Rundeck
- Reverse proxy: Nginx
- Production API service: `sphere-rundeck-prod-api.service`
- DEV API service: `sphere-rundeck-api.service`
- Collector poller: systemd service/timer
- Infrastructure poller: systemd service/timer
- Collector watchdog: systemd service/timer
- Observability: Prometheus-compatible metrics and alert rules

## Active user workspaces

The main navigation exposes two analysis workspaces:

1. **ST03N Analysis** — SAP workload and response-time analysis.
2. **Performance Analysis** — SAP performance, infrastructure, workload, historical evaluation, evidence, and investigation.

Performance Analysis currently provides:

- Live Monitoring and History modes
- Infrastructure overview: filesystem, network, and storage I/O
- SAP Application Server status
- Server performance trend
- Current Workloads
- Selected Job / Program context
- Job / Program Performance analysis
- Observation History
- Infrastructure Analysis
- Correlated Events
- SAP Availability
- SAP Issues
- System Data
- System Health
- Jobs & Programs to Review for 1 Day / 7 Days / 30 Days
- Workload Explorer / historical analysis
- PDF performance report/export

Authoritative live SM37 execution evidence is a separate trust plane. The UI must continue to show the source as not connected until an approved SM37 execution feed is configured. Sampled Work Process evidence must never be presented as an authoritative SM37 match.

## Release validation

On `JAHSVR-SPHERE`:

```bash
cd /root/rundeck-sphere-dev
git fetch origin
git reset --hard origin/rundeck-sphere-dev

/opt/sphere-rundeck-dev/venv/bin/python -m unittest backend.tests.test_rundeck
npm run qa
bash ops/rundeck/prod-readiness-check.sh
```

Required final readiness markers:

```text
READINESS PASS: collector fresh, watchdog healthy, auto-healing enabled
SPHERE PROD READINESS PASS
HEAD <validated-dev-sha>
```

A Vite chunk-size warning is informational. A failed unit test, QA command, readiness check, Nginx validation, API smoke test, or deployment gate is a release blocker.

Production deployment procedures and rollback behavior are documented in:

`ops/rundeck/OPERATIONS.md`

## Current documentation

Use these documents as active references:

- `docs/CURRENT-FLOW-AND-FEATURES.md` — implemented operating flow and feature inventory
- `docs/RUNDECK_INTEGRATION_RUNBOOK.md` — Rundeck API integration and security boundary
- `docs/BASIS-JOB-INTELLIGENCE.md` — sampled workload vs authoritative SM37 execution trust boundary
- `docs/LEGACY-TELEMETRY-COMPATIBILITY.md` — compatibility rules for historical enhanced telemetry markers
- `docs/rundeck-development.md` — DEV runtime and UI/collector contract
- `docs/VISUAL-QA.md` — optional Playwright visual regression checks
- `docs/ai-coding-workflow-style.md` — repository implementation workflow
- `docs/presentation/IFUNTASTIC-2026.md` — presentation storyline, safe wording, evaluation boundary, and animation guidance
- `docs/presentation/ASSET-SOURCES.md` — approved branding/screenshot sources and presentation sanitization rules
- `docs/presentation/FINAL-DECK-RELEASE.md` — final iFuntastic deck identity, PowerPoint compatibility status, checksum, and submission boundary
- `ops/rundeck/OPERATIONS.md` — release, deployment, watchdog, platform health, and retention operations

Historical competition copy, one-off optimization notes, and obsolete RCA-era validation documents are intentionally not maintained as current documentation.

## Repository guardrails

- Preserve the four release branches above.
- Remove temporary branches only after confirming their commits are contained in an active branch.
- Preserve active parser, frontend, backend, PostgreSQL migration, test, and deployment dependencies.
- Preserve backward compatibility for historical collector markers only where the active parser still requires it.
- Do not introduce new RCA-named product files or version-number-only documentation.
- Never commit Rundeck tokens, SAP credentials, passwords, private keys, raw SAP logs, or runtime secrets.
- Production changes must pass DEV validation and be promoted through a normal Pull Request.

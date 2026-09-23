# SPHERE

SPHERE — **SAP Performance Health Evaluation & Reporting** — is a SAP Basis operations workspace for performance monitoring, ST03N/LOG analysis, operational evidence, Case History, and initial RCA support.

Current stable Rundeck baseline: **v1.33.0**

Production: **https://sphere.astraotoparts.co.id**  
Development: **https://sphere.astraotoparts.co.id/dev/**

## Branch model

Only these four branches are active:

| Branch | Purpose |
|---|---|
| `sphere-prod` | Manual-only production line. Operators upload collected `.txt`/`.log` files through **Upload Logs**; this branch does not depend on the Rundeck REST API. |
| `sphere-dev` | Development line for the manual Upload Logs workflow; no automatic Rundeck API ingestion. |
| `rundeck-sphere-prod` | **Active production line.** Automatically ingests retained collection evidence through the Rundeck REST API; manual Upload Logs remains available as fallback. |
| `rundeck-sphere-dev` | Development/test line for the Rundeck REST API integration before promotion to `rundeck-sphere-prod`. |

Promotion paths:

```text
sphere-dev
    ↓ PR
sphere-prod

rundeck-sphere-dev
    ↓ QA + PROD readiness
    ↓ Pull Request
rundeck-sphere-prod
    ↓ production build/deploy
https://sphere.astraotoparts.co.id
```

Do not develop directly on a production branch and do not force-reset a production branch to DEV. Temporary/hotfix branches should be removed after their commits are contained in the corresponding active branch.

## Data-ingestion modes

SPHERE has two intentionally separate ingestion modes:

- **Manual branch family (`sphere-dev` / `sphere-prod`)** — the operator collects/export logs externally and uploads the resulting text/log file through **Upload Logs**. No Rundeck API is required.
- **Rundeck branch family (`rundeck-sphere-dev` / `rundeck-sphere-prod`)** — SPHERE automatically discovers completed Rundeck executions and reads execution metadata/output through the **Rundeck REST API**. SPHERE does not SSH/SCP directly to SAP application servers. Manual Upload Logs remains available as an operational fallback.

The current active production runtime is `rundeck-sphere-prod`.

## Application architecture

- Frontend: React + Vite
- Backend: FastAPI
- Database: PostgreSQL
- Collector/orchestrator: Rundeck
- Web proxy: Nginx
- Production API service: `sphere-rundeck-prod-api.service`
- DEV API service: `sphere-rundeck-api.service`

SPHERE does not connect directly to SAP application servers. Rundeck remains responsible for SAP server collection. SPHERE consumes and visualizes the retained evidence.

## Rundeck release workflow

### 1. Validate DEV

On `JAHSVR-SPHERE`:

```bash
cd /root/rundeck-sphere-dev
git fetch origin
git reset --hard origin/rundeck-sphere-dev

/opt/sphere-rundeck-dev/venv/bin/python -m unittest backend.tests.test_rundeck
npm run qa
bash ops/rundeck/prod-readiness-check.sh
```

Required final gate:

```text
READINESS PASS: collector fresh, watchdog healthy, auto-healing enabled
SPHERE PROD READINESS PASS
HEAD <validated-dev-sha>
```

The readiness script supports normal Git checkouts and Git worktrees; `.git` does not need to be a directory.

### 2. Promote through GitHub

Create a normal Pull Request:

```text
base:    rundeck-sphere-prod
compare: rundeck-sphere-dev
```

Review the diff and merge normally. Do not use force push or replace the PROD ref with the DEV ref.

### 3. Deploy production

After the PR is merged:

```bash
cd /root/rundeck-sphere-prod
git fetch origin
git reset --hard origin/rundeck-sphere-prod
npm ci
npm run qa
npm run build
bash ops/rundeck/deploy-prod.sh
```

Successful deployment ends with:

```text
PRODUCTION DEPLOY SUCCESS
REVISION <prod-sha>
```

`deploy-prod.sh` is transactional. It validates the PROD checkout, build base, API/service health, production routes, platform readiness, DEV isolation, and legacy API guardrails. If activation or smoke validation fails, it restores the previous production web/API release and Nginx configuration.

Detailed operational procedures are documented in `ops/rundeck/OPERATIONS.md`.

## Validation

Primary release gates:

```bash
/opt/sphere-rundeck-dev/venv/bin/python -m unittest backend.tests.test_rundeck
npm run qa
bash ops/rundeck/prod-readiness-check.sh
```

A Vite chunk-size warning is an optimization warning, not automatically a release failure. A non-zero QA/build/readiness exit code is a release blocker.

## Rundeck integration

Rundeck integration, ACL, credential handling, token rotation, and security guardrails are documented in:

`docs/RUNDECK_INTEGRATION_RUNBOOK.md`

Never commit Rundeck tokens, passwords, or runtime credentials to GitHub.

## Repository guardrails

- Preserve the four active branches above.
- Remove temporary branches only after confirming they are fully contained in an active branch.
- Preserve active parser, frontend, backend, database, migration, test, and deployment dependencies.
- Preserve collector protocol compatibility markers such as `RCA-SNAPSHOT-V2.2`, `RCA-WP-V2.2`, and `RCA-EXT`.
- Preserve database migration history.
- Do not restore retired CBJ monitoring/deployment assets into active SPHERE branches.
- Production changes must pass DEV validation and be promoted through a PR.

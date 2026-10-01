# SPHERE

SPHERE — **SAP Performance Health Evaluation & Reporting** — is a SAP performance monitoring, evaluation, investigation, and reporting platform for SAP operations.

Current Rundeck-integrated release: **v1.34.37**.

- Production: https://sphere.astraotoparts.co.id
- Development: https://sphere.astraotoparts.co.id/dev/

## Product position

SPHERE centralizes retained SAP performance evidence, correlates SAP Application Server resource conditions with Job/Program workload context, supports historical investigation, and provides a consistent operator drill-down path.

SPHERE is not a replacement for SAP standard troubleshooting tools and it does not declare a final root cause automatically.

Primary operating flow:

```text
Collect → Monitor → Detect → Correlate → Evaluate → Investigate → Report
```

The implementation source of truth is:

`docs/CURRENT-FLOW-AND-FEATURES.md`

## Active release lines

| Branch | Purpose |
|---|---|
| `sphere-dev` | Manual Upload Logs development line |
| `sphere-prod` | Manual Upload Logs production line |
| `rundeck-sphere-dev` | Active Rundeck-integrated development/test line |
| `rundeck-sphere-prod` | Active Rundeck-integrated production line |

Promotion path:

```text
rundeck-sphere-dev
    ↓ QA + readiness
    ↓ reviewed promotion
rundeck-sphere-prod
    ↓ production build/deploy
https://sphere.astraotoparts.co.id
```

Do not force-reset PROD to DEV. PROD-only deployment/routing files must be preserved during promotion.

## Runtime architecture

```text
SAP Application Servers
        ↓
Rundeck collection/orchestration
        ↓
Rundeck REST API
        ↓
SPHERE FastAPI ingestion
        ↓
PostgreSQL + retained raw evidence
        ↓
React/Vite operator UI
```

- Frontend: React + Vite
- Backend: FastAPI
- Database: PostgreSQL
- Collector/orchestrator: Rundeck
- Reverse proxy: Nginx
- DEV API: port 8091
- PROD API: port 8092
- Observability: Prometheus-compatible metrics + alert rules

SPHERE must not SSH/SCP directly to SAP Application Servers.

## Current operator workspace

Main navigation:

1. **ST03N Analysis**
2. **Performance Analysis**

Performance Analysis exposes:

- Live Monitoring
- History
- Infrastructure overview and Infrastructure Analysis
- SAP Application Servers
- Server Trend
- Current Jobs & Programs
- Selected Job / Program context
- Performance Analysis with Current / 3H / 6H / 24H / 7D / 30D
- Observation Details
- Historical Bucket Details
- SAP WP / Trace Signal Details
- Observation History
- Correlated Events
- SAP Availability
- SAP Issues
- System Data
- System Health
- Jobs & Programs to Review
- Workload Explorer / historical analysis
- PDF reporting

## Important evidence semantics

- Correlation is temporal/context evidence; it is not proof of causation.
- Missing availability observations are not inferred as DOWN.
- APP Critical WP is APP-server evidence, not workload execution status.
- CPU for grouped workloads may exceed 100% because multiple processes/CPU cores can be aggregated.
- PSS is the current memory metric used in workload analysis. Legacy RSS evidence must not be compared 1:1.
- Historical Server Trend uses bucketed values. Peak mode keeps **Bucket**, **Peak At**, **Peak Value**, and **Peak Collection** separate.
- WP trace `Error at Snapshot` is only current-at-snapshot evidence when collector recency is `AT_SNAPSHOT`.
- `Latest Trace Error` may be historical and does not mean the SAP job failed.
- SM37 remains the authority for SAP background-job execution status.

## Build paths

Vite base is branch-aware:

- `rundeck-sphere-dev` → `/dev/`
- `rundeck-sphere-prod` → `/`

Production deploy blocks activation if the built bundle still references `/dev/assets/`.

## Validation

DEV:

```bash
cd /root/rundeck-sphere-dev
git fetch origin
git reset --hard origin/rundeck-sphere-dev
npm run qa
bash ops/rundeck/prod-readiness-check.sh
```

Production:

```bash
cd /root/rundeck-sphere-prod
git fetch origin
git reset --hard origin/rundeck-sphere-prod
npm run build
bash ops/rundeck/deploy-prod.sh
```

A Vite chunk-size warning is informational. Failed QA, readiness, Nginx validation, API smoke tests, route isolation, or transactional deploy checks are release blockers.

## Documentation map

- `docs/CURRENT-FLOW-AND-FEATURES.md` — current implemented product flow and UI contract
- `docs/RUNDECK_INTEGRATION_RUNBOOK.md` — Rundeck integration/security boundary
- `docs/BASIS-JOB-INTELLIGENCE.md` — workload/WP trace/SM37 trust boundary
- `docs/LEGACY-TELEMETRY-COMPATIBILITY.md` — retained legacy protocol compatibility
- `docs/rundeck-development.md` — DEV/PROD runtime contract
- `docs/VISUAL-QA.md` — current visual and interaction QA checklist
- `ops/rundeck/OPERATIONS.md` — deployment, rollback, health, retention, and release operations
- `docs/presentation/` — presentation-specific material; not runtime source of truth

## Repository guardrails

- Preserve active release branches.
- Preserve PROD-only deployment/routing/service files during promotion.
- Do not introduce RCA wording as a product verdict.
- Never commit Rundeck tokens, SAP credentials, passwords, private keys, raw SAP logs, or runtime secrets.
- Keep missing-data semantics explicit; do not synthesize unavailable evidence as zero.
- Production changes must be validated on DEV before promotion.

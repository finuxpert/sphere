# SPHERE

SPHERE — **SAP Performance Health Evaluation & Reporting** — is a SAP performance monitoring, evaluation, investigation, and reporting platform for SAP operations.

Current Rundeck-integrated DEV source candidate: **v1.34.75** (server QA/deployment pending).

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

## Single-server DEV/PROD deployment topology

The active Rundeck-integrated DEV and PROD runtimes are deployed on the **same SPHERE server** with separate Git checkouts and isolated runtime paths:

```text
JAHSVR-SPHERE
├─ /root/rundeck-sphere-dev   → branch rundeck-sphere-dev  → https://sphere.astraotoparts.co.id/dev/
└─ /root/rundeck-sphere-prod  → branch rundeck-sphere-prod → https://sphere.astraotoparts.co.id/
```

Runtime separation:

- DEV API: port `8091`, current API symlink `/opt/sphere-rundeck-dev/current`, current web symlink `/var/www/sphere-dev/current`.
- PROD API: port `8092`, current API symlink `/opt/sphere-rundeck-prod/current`, current web symlink `/var/www/sphere.astraotoparts.co.id/current`.
- DEV and PROD use different branch-aware Vite bases: `/dev/` and `/`.
- A DEV deployment must leave the current PROD web/API release unchanged.
- A PROD deployment must leave the current DEV web/API release unchanged.
- Branch promotion is completed before production deployment. The production checkout consumes the approved `rundeck-sphere-prod` branch; it must not merge DEV during deployment.

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
- Selected Job / Program context with workload-scoped APP Critical WP wording
- Jobs & Programs to Review beside Current Jobs & Programs
- Bottom workflow uses equal-height panels: Current Jobs and Review scroll internally while Selected Job remains fixed.
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
- One-page PDF quick reporting for Basis/Infrastructure handoff

## Important evidence semantics

- Correlation is temporal/context evidence; it is not proof of causation.
- Missing availability observations are not inferred as DOWN.
- APP Critical WP is APP-server evidence, not workload execution status. Selected-workload UI keeps **0** distinct from **Not observed for selected workload**.
- CPU for grouped workloads may exceed 100% because multiple processes/CPU cores can be aggregated.
- PSS is the current memory metric used in workload analysis. Legacy RSS evidence must not be compared 1:1.
- Historical Server Trend uses bucketed values. Peak mode keeps **Bucket**, **Peak At**, **Peak Value**, and **Peak Collection** separate.
- WP trace `Error at Snapshot` is only current-at-snapshot evidence when collector recency is `AT_SNAPSHOT`.
- `Latest Trace Error` may be historical and does not mean the SAP job failed. The UI labels retained trace errors as **AT SNAPSHOT** or **HISTORICAL**.
- SM37 remains the authority for SAP background-job execution status.
- A Current Performance Analysis range with one saved observation is shown as a **Selected Observation**, not as a misleading trend line.
- PDF reports show Performance and Availability source times and keep `ALIGNED` / `PARTIAL` explicit when the report sources are not from the same timing window.
- PDF operational state uses the same service/resource/freshness semantics as the System Health header; Critical WP alone raises ATTENTION rather than declaring a service outage.

## Build paths

Vite base is branch-aware:

- `rundeck-sphere-dev` → `/dev/`
- `rundeck-sphere-prod` → `/`

Production deploy blocks activation if the built bundle still references `/dev/assets/`.

## Validation and deployment

Canonical DEV refresh, QA, readiness, and deployment:

```bash
cd /root/rundeck-sphere-dev && \
git fetch origin && \
git reset --hard origin/rundeck-sphere-dev && \
bash ops/rundeck/qa-build-dev.sh && \
bash ops/rundeck/prod-readiness-check.sh && \
bash ops/rundeck/deploy-dev.sh
```

Canonical PROD deployment after the approved DEV release has already been promoted to `rundeck-sphere-prod`:

```bash
cd /root/rundeck-sphere-prod && \
git fetch origin && \
git reset --hard origin/rundeck-sphere-prod && \
npm ci && \
npm run qa && \
npm run build && \
bash ops/rundeck/deploy-prod.sh
```

Expected production source is the remote `rundeck-sphere-prod` HEAD. Do **not** merge `rundeck-sphere-dev` inside the production checkout during deployment.

`deploy-dev.sh` and `deploy-prod.sh` are transactional. They validate their target branch/runtime, update only their managed Nginx/runtime paths, perform smoke checks, and roll back the target environment on failure. Cross-environment guards verify that deploying one environment does not replace the other.

A Vite chunk-size warning is informational. Failed QA, readiness, Nginx validation, API smoke tests, route isolation, cross-environment guards, or transactional deploy checks are release blockers.

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


### Live cockpit v1.34.61

- Live Monitoring is the single primary workspace; standalone History was removed.
- Historical Job / Program search is available from Jobs & Programs to Review and opens the shared Performance Analysis drawer.
- Current Jobs and Review use a direct 50/50 workflow; clicking either side opens Performance Analysis without an intermediate Selected Job card.
- Trend workspace is split into Server Trend (60%) and Technical Trend (40%) with a shared time range.
- SAP App Servers includes operational summary/status, and SAP Issues consolidates performance, availability, technical checks, and SM37 feed state.


### Live cockpit v1.34.61

- Top cockpit is content-driven at 42/58 for SAP App Servers and Infrastructure; dead vertical space is removed.
- Trend workspace now shows Server Trend 1 / Server Trend 2 / Technical Trend at roughly 35/35/30 with one shared Time Range, Interval, and Avg/Peak control rail. Defaults are CPU, Memory, and Load.
- Current Jobs and Jobs & Programs to Review stay 50/50, use a compact equal-height scan area, and Current Jobs fills its full pane width.
- Six analysis shortcuts remain always visible.
- Analysis drawers share one restrained visual contract with fewer separators, lighter tables, consistent Back/Close navigation, and no “Back to Selected Job” wording.


### Live cockpit v1.34.61

- Host memory wording is now explicit RAM; workload memory remains PSS Memory.
- Server Trend 1 and Server Trend 2 share one collection-gap strip instead of duplicating the same gap message.
- The six analysis shortcuts show the selected workload context above them and use compact whole-tile actions.
- Current Jobs and Review use adaptive bounded height rather than a fixed lower-band height.
- SAP Issues uses drawer-level scrolling and clearer checked-indicator wording.
- Observation History separates CPU, PSS and Critical WP ranges.
- Infrastructure history is shorter on desktop so Current Snapshot is visible sooner and Network numeric values are not clipped.


### v1.34.61 visual consistency

- Cockpit and drawer typography use one hierarchy for titles, labels, status text and numeric data.
- Host memory is RAM; workload memory is PSS Memory everywhere including PDF.
- Trend titles show the active metric with a middle-dot separator.
- Analysis shortcuts and context text are more readable with less border chrome.
- Current Jobs and Review tables use larger operational text and tabular numeric alignment.
- PDF Preview chrome is more compact, while the one-page PDF increases report typography and uses RAM / PSS Memory / WP Context wording.


### v1.34.61 cockpit consolidation

- The obsolete Live Monitoring tab is removed; SAP Performance is the single cockpit view.
- Current Jobs, Review and historical Search are merged into one full-width Jobs & Programs workspace with Live / Review / Search modes.
- The analysis rail removes redundant helper labels and uses one-line shortcut summaries with a concise selected-workload context.
- Infrastructure now uses the same SphereIcon title treatment as the other cockpit sections.
- Correlated Events and SAP Availability drawers use the same spacing and hierarchy as the other analysis drawers.
- PDF preview now mirrors the current cockpit more closely with two Server Trend charts, a Technical Status strip, Analysis Context and Jobs & Programs Review.


### v1.34.61 finishing

- Jobs & Programs now keeps Live / Review / Search beside the workspace title and uses the full available width.
- Review no longer has a second Search button; Search is a dedicated mode with an empty pre-query state.
- Live selected-row emphasis is reduced to a subtle background plus left accent.
- Performance Analysis is slightly narrower, chart-first, and uses a restrained backdrop for focus.
- Compact Correlated Events copy is shortened to avoid truncation.
- The duplicate visible SAP Performance title text is suppressed while preserving an accessible heading.

### Infrastructure observation freshness (v1.34.75 DEV)

The embedded Infrastructure overview and Infrastructure Analysis use one 15-minute freshness rule for the selected host's collection timestamp. A missing/invalid/future timestamp is `UNKNOWN`; a late collection is `STALE`. Filesystem, Network, and Storage I/O retain their last observed values for investigation but do **not** show old `CRITICAL`/`ATTENTION`/`NORMAL` as current host conditions. The main overview refreshes the host and telemetry endpoints every 60 seconds without using a mutating collection endpoint. This UI guard does **not** claim a new collector result, synthesize a filesystem percentage, or modify the SAP host.

If `/INTF` shows last-observed 92% but a fresh SAP `df -h /INTF` shows 88%, investigate the Rundeck infrastructure collection/poller. They reflect different observations until a new valid collection is persisted. See `ops/rundeck/OPERATIONS.md` for read-only checks and standard DEV QA/deploy.

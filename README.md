# SPHERE

**SPHERE — SAP Performance Health Evaluation & Reporting** is a SAP monitoring, investigation and reporting application. It correlates **retained evidence**, not a definitive SAP root cause, job-failure diagnosis, or proof of continuous service availability.

- DEV: https://sphere.astraotoparts.co.id/dev/
- PROD: https://sphere.astraotoparts.co.id/
- Repository: `finuxpert/sphere`
- Current DEV source version: [`src/app/version.js`](src/app/version.js). A GitHub commit or CI PASS **does not** prove that a particular release is active on the server.

## Active architecture

```text
SAP APP1–APP5 → Rundeck collectors → Python ingestion → PostgreSQL
                                                    ↓
                                    FastAPI → React/Vite dashboard
```

Frontend: React 19, Vite, ECharts 6, Bootstrap 5 **grid for Monitoring**, and existing custom CSS. Bootstrap is not yet the entire design system. Backend: Python/FastAPI, SQLAlchemy, psycopg and Alembic. Nginx proxies separated DEV/PROD releases on the same host.

SPHERE does not directly SSH/SCP to SAP servers. SAP standard transactions remain authoritative for underlying SAP diagnostics and SM37 execution outcomes.

## Branches and runtime separation

| Branch | Role |
|---|---|
| `rundeck-sphere-dev` | Active integrated DEV |
| `rundeck-sphere-prod` | Active integrated PROD |
| `sphere-dev`, `sphere-prod` | Separate Manual Upload Logs lines |

| Environment | Checkout | API | Active web | Active API |
|---|---|---|---|---|
| DEV | `/root/rundeck-sphere-dev` | `127.0.0.1:8091` | `/var/www/sphere-dev/current` | `/opt/sphere-rundeck-dev/current` |
| PROD | `/root/rundeck-sphere-prod` | `127.0.0.1:8092` | `/var/www/sphere.astraotoparts.co.id/current` | `/opt/sphere-rundeck-prod/current` |

DEV Vite base is `/dev/`; PROD uses `/`. Changes to DEV must never implicitly modify PROD, Rundeck production jobs, SAP systems or runtime credentials. PROD promotion is a separate approved process.

## Current operator interface — DEV source

Two top-level workspaces: **ST03N Analysis** and **Performance Analysis**.

Performance Analysis has four primary sidebar destinations: **Monitoring**, **Jobs & Programs**, **Data Collection**, **Reports**. Existing deep-link routes and modal investigations remain available.

The Monitoring overview contains:

1. **SAP APP Landscape**: five source-backed APP cards with CPU, host RAM and Critical WP/status, including provenance/freshness.
2. **Performance Trends**: **four configurable ECharts charts**, initially CPU Usage, Memory Usage, Network and Critical WP. Bootstrap Grid uses four columns on wide desktop, two on medium viewports and one on narrow screens. Shared Time Range, Interval, Aggregation (Avg/Peak), APP focus and chart metric dropdowns remain operational. Peak host, value, date and time are presented in WIB.
3. **Jobs & Programs**: summary counts, short saved-review candidates, and short latest-workload preview. The complete review, search and current workloads remain accessible through details/pages. Preview counts must not be mistaken for total observed/evaluated records.
4. **System Health**: SAP availability, SAP issues, server health, recent events and recent collection summaries, with links to full evidence.

The new compact Monitoring layout uses a Bootstrap Grid split for lower panels and conditional viewport fitting. **One-screen fit at 1536 × 864 is a visual QA target, not a verified runtime result.** Preserve natural page scrolling when the viewport is too small or unexpected evidence requires more space; never clip or hide raw records to fabricate a no-scroll claim.

Data Collection separates Automatic/Rundeck, Manual Upload, and historical collection context. Reports includes Monthly Review and PDF workflows. Manual Upload is unrelated to a Monthly Review's manual evaluation notes.

## Evidence and data-quality rules

- Missing/stale/invalid measurements are **UNKNOWN, unavailable or PARTIAL**, not zero, NORMAL or SAP DOWN.
- Performance collection freshness and service-availability freshness are independent. A READY collection does not prove the SAP service is currently available.
- APP Critical WP is APP-level evidence; it does not prove an individual Job/Program failed. **SM37** is authoritative for SAP background-job execution.
- Workload grouped CPU may exceed 100%; PSS workload memory and host RAM are different metrics.
- A chart's aggregate bucket, exact peak time/value and collection identity remain separate. Network RX/TX uses saved Infrastructure samples; a Typical Y-axis crop does not change stored peaks.
- Missing samples are gaps rather than fabricated zero points; temporal correlation is not causality.
- WP trace errors may be AT SNAPSHOT or HISTORICAL, and do not independently establish SAP job failure.

## Development and validation

```bash
npm ci
npm run qa
npm run qa:visual           # separate browser/visual suite when environment is ready
```

The GitHub workflow also checks browser boot, APP evaluation geometry, PDF output, backend unit tests and DEV release artifact production. A successful CI build does not validate the deployed browser UI against live data.

For a **read-only DEV API baseline**, after updating a clean DEV checkout:

```bash
npm run perf:baseline:dev -- --samples=10 > /tmp/sphere-dev-perf-baseline.json
```

This queries bounded GET endpoints through `127.0.0.1:8091`. It does **not** benchmark the browser UI, collector cadence, or database execution in isolation. Compare measured before/after values; do not claim improvements without numbers.

### Standard guarded DEV full-stack release

On `JAHSVR-SPHERE`, only after reviewing migrations and confirming no schema changes require execution:

```bash
cd /root/rundeck-sphere-dev
SPHERE_DEV_MIGRATION_DECISION=skip bash ops/rundeck/release-dev-fast.sh
```

The wrapper checks clean branch, fast-forward sync, QA/build, backend tests, migration guard, guarded DEV deployment and health. **Never use migration skip to bypass changed migration scripts.** The deployment result must include `FINAL=PASS`; then verify the active DEV web and API release SHA, public route and visual layout. PROD remains a separate approval. See [Rundeck development](docs/rundeck-development.md).

## Documentation — source of truth

Start at [Documentation Index](docs/DOCUMENTATION-INDEX.md).

- [Current Features & Flow](docs/CURRENT-FLOW-AND-FEATURES.md)
- [Enterprise UI Standard](docs/SPHERE-ENTERPRISE-UI-STANDARD.md)
- [Visual QA](docs/VISUAL-QA.md)
- [Rundeck DEV/PROD runbook](docs/rundeck-development.md)
- [Rundeck integration](docs/RUNDECK_INTEGRATION_RUNBOOK.md)
- [SAP Job Intelligence & SM37 trust boundary](docs/BASIS-JOB-INTELLIGENCE.md)
- [Six-month history & retention](docs/rundeck-historical-analysis-six-months.md)
- [Monthly Review WP-error validation](docs/monthly-review-wp-error-dev-validation.md)
- [Operational safety and rollback](ops/rundeck/OPERATIONS.md)

Historical release notes are not live runbooks. Keep documentation aligned to source behavior and verify runtime/deployment independently.

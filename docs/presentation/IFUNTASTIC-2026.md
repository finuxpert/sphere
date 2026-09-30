# SPHERE iFuntastic 2026 Presentation

This document keeps the iFuntastic presentation aligned with the implemented SPHERE product without turning competition copy into the technical source of truth.

Audited against:
- application version: **v1.34.29**
- branch: `rundeck-sphere-dev`
- audited HEAD: `97cec128f1482dd24be3f5efbecedfd3fd851feb`
- audit date: **2026-09-30**

The technical source of truth remains `docs/CURRENT-FLOW-AND-FEATURES.md`.

## Presentation position

Use:

**SPHERE — SAP Performance Health Evaluation & Reporting**

Presentation positioning:

**Improvement SAP Performance Monitoring & Investigation**

Safe explanation:

> SPHERE helps SAP Basis centralize monitoring evidence, review Application Server conditions and workload context, inspect history, and narrow the area that needs deeper validation.

SPHERE does not replace SAP standard tools and must not be presented as an automatic final root-cause engine.

## iFuntastic storyline

1. Cover
2. Executive Summary
3. STEP 1 — Current investigation process
4. STEP 1 — Problems in the current process
5. STEP 1 — Why the improvement is needed
6. STEP 2 — Improvement target
7. STEP 3 — Cause analysis
8. STEP 4 — Selected improvements
9. STEP 5 — SPHERE improvement journey
10. STEP 5 — Current SPHERE
11. STEP 5 — SPHERE topology
12. STEP 6 — Before vs After
13. STEP 5 — Implementation evidence and example check flow
14. STEP 6 — Evaluation
15. STEP 7 & 8 — Standardization and next improvement

## Current presentation topology

```text
SAP Application Servers / Infrastructure
        ↓
Rundeck
Collection & Schedule
        ↓
Rundeck REST API
        ↓
SPHERE Backend
Read • Validate • Store
        ↓
PostgreSQL
History • Evidence
        ↓
SPHERE Web UI
Live Monitoring • History • Report
        ↓
SAP Basis • Infrastructure • Functional
```

Boundary:

- SPHERE does not SSH/SCP directly to SAP Application Servers.
- Rundeck remains the SAP-side collection/orchestration layer.
- SPHERE reads retained execution data through the Rundeck REST API.

## Improvement journey used in the deck

- **Mar 2026 — ST03N Analyzer:** simplify workload and response-time review.
- **Jun 2026 — WP-SCOUT:** collect CPU, memory, Work Process, and dev_w* evidence.
- **Jul 2026 — Rundeck Automation:** scheduled collection across APP1–APP5.
- **Aug 2026 — SPHERE Monitoring:** server and workload information brought into one dashboard.
- **Sep 2026 — SPHERE v1.34.29:** Live Monitoring, History, Performance Review, Infrastructure, Availability, and evidence-oriented investigation.

The timeline is a project-development story. It must not be used to imply capabilities that are no longer active.

## Presentation-safe implemented capabilities

- Automated collection through Rundeck
- Live Monitoring
- SAP Application Server monitoring
- Server Trend
- Current Workloads
- Job / Program Performance Review
- History / Workload Explorer
- Infrastructure monitoring
- SAP Availability and SAP Issues
- ST03N Analysis
- System Health
- PDF performance report/export

## Evaluation wording

Implemented process changes may be shown as Before vs After.

Current early process estimate used in the draft deck:

- Before: **40–75 minutes**
- After: **5–15 minutes**
- Potential time reduction: **70–80%**

This is an **initial estimate**, not a formal time-study result.

Do not present it as a final measured benefit until actual validated incident measurements are available.

## SM37 wording

Use:

**“Integrasi sumber data eksekusi SM37 resmi”**

Do not claim that sampled workload observations are authoritative SM37 execution records.

The current live source remains not connected until an approved authoritative feed is configured.

## Presentation language

Prefer Basis/Infrastructure language:

- kondisi server
- Application Server
- CPU / memory / I/O Wait
- Critical WP
- current workload
- Job / Program
- history
- evidence
- area yang perlu dicek
- validasi teknis

Avoid unnecessary product/developer jargon in competition slides.

## Animation guidance

Use a restrained corporate style:

- slide transition: **Fade**
- timeline: reveal left to right when presenting
- topology: reveal by data-flow order
- Before vs After: show Before first, then After
- avoid Bounce, Spin, large Zoom, 3D, or decorative motion

Compatibility and editability take priority over complex object animation.

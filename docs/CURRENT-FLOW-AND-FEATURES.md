# SPHERE Current Flow and Features

This document is the source of truth for the implemented SPHERE operating flow on **v1.34.29**.

It describes what the current application does. It is intentionally separated from competition copy, future roadmap ideas, and unmeasured business-impact claims.

## Product position

**SPHERE — SAP Performance Health Evaluation & Reporting**

Operational position:

**SAP Performance Monitoring, Evaluation & Investigation Platform**

SPHERE centralizes SAP performance evidence and helps operators move from a broad symptom such as "SAP is slow" toward a narrower, evidence-backed investigation scope.

SPHERE does not replace SAP standard tools such as ST03N, SM50/SM66, SM37, STAD, ST05, SAT, database/SQL analysis, enqueue/lock analysis, traces, or dumps. Deep validation remains a SAP Basis activity when the case requires it.

## End-to-end flow

```text
SAP Application Servers
        ↓
Rundeck collection/orchestration
        ↓
Rundeck REST API
        ↓
SPHERE FastAPI ingestion/validation
        ↓
PostgreSQL + retained raw evidence
        ↓
Live Monitoring / History
        ↓
Detect operational signals
        ↓
Correlate server resource + SAP workload
        ↓
Evaluate Job / Program patterns
        ↓
Investigate selected context
        ↓
Operational evidence / PDF report
```

Presentation shorthand:

```text
Collect → Monitor → Detect → Correlate → Evaluate → Investigate → Report
```

## 1. Collect

Rundeck is the SAP-side automation and orchestration layer.

Responsibilities:

- execute the approved SAP collection workflow
- collect data consistently across the configured SAP Application Servers
- retain execution metadata and output
- expose completed execution data through the Rundeck REST API

SPHERE does not SSH or SCP directly to SAP Application Servers.

Manual Upload Logs remains available as a fallback path.

## 2. Ingest and retain

The Rundeck-integrated backend:

- discovers eligible completed executions
- reads execution metadata and output
- validates expected hosts and collection completeness
- stores retained operational history
- projects normalized data into PostgreSQL
- keeps raw collection evidence for audit/investigation
- separates READY/PARTIAL/FAILED collection semantics

The database currently includes retained structures for monitoring history, workload observations, SAP job execution evidence, infrastructure monitoring, and analysis closure/evidence data.

## 3. Monitor

The primary Performance Analysis workspace has two top-level modes:

- **Live Monitoring**
- **History**

Live Monitoring provides an operator-oriented view of current retained evidence rather than a collection of unrelated technical screens.

### Infrastructure overview

Current infrastructure monitoring covers:

- filesystem utilization
- network RX/TX
- network errors/drops
- storage I/O utilization
- data freshness/stale indication
- multi-host selection

### SAP Application Servers

The Application Server view gives a per-host operational context and supports focused inspection.

### Server Trend

Historical server trend supports resource investigation across selectable periods/metrics and keeps live/current context distinct from historical evidence.

### Current Workloads

Current workload evidence surfaces active Job/Program consumers and their relationship with SAP Application Server context.

## 4. Detect

SPHERE surfaces operational signals that may require attention, including:

- CPU usage
- memory usage
- I/O Wait
- Critical Work Process
- filesystem pressure
- storage I/O pressure
- network drops/errors
- SAP operational issues
- SAP availability observations
- heavy or recurring Job / Program workload
- stale/partial monitoring evidence

Status/evaluation signals narrow investigation. They must not be presented as an automatic final root-cause declaration.

## 5. Correlate

The central investigation model is:

```text
Application Server
    → Resource condition
    → Critical WP context
    → Current workload
    → Job / ABAP Program
    → Historical pattern
    → Operational evidence
```

This allows a user to move beyond a host-only statement such as "CPU is high" and inspect which SAP workload was observed around the same period.

Correlation is evidence of timing/context. Correlation alone does not prove causality.

## 6. Evaluate Jobs and Programs

The **Jobs & Programs to Review** feature supports:

- periods: 1 Day, 7 Days, 30 Days
- filters: All, Programs, Jobs
- review reason
- average CPU
- peak CPU
- memory
- data-quality/coverage warning
- quick analysis
- full Job / Program performance analysis

The evaluation plane is deterministic and based on retained workload observations.

## 7. Investigate

The current analysis workspace exposes progressive drill-down instead of putting every detail on the main screen.

Available investigation views include:

- Job / Program Performance
- Observation History
- Infrastructure Analysis
- Correlated Events
- SAP Availability
- SAP Issues
- System Data
- Application Server Analysis
- Quick Analysis / Review Result

The selected Job/Program context can carry key metrics such as CPU, memory, process count, and Critical WP evidence into the deeper analysis views.

## 8. Historical analysis

History mode provides the Workload Explorer and historical Job/Program analysis.

It supports review of retained workload patterns and recurring behavior rather than relying only on a single live snapshot.

Historical evidence remains context. A historical similarity or recurring pattern must not be presented as proof of the current incident's root cause.

## 9. Availability

The availability plane keeps explicit category semantics for:

- SAP Application availability
- HANA System DB availability
- HANA replication availability
- SSH reachability
- Web Dispatcher availability

Missing observations are not inferred as DOWN.

Observed availability percentages describe retained checks; they are not automatically an SLA calculation.

## 10. Operational evidence

SPHERE includes evidence-oriented investigation capabilities such as:

- operational event timeline
- performance incident context
- correlated event evidence
- observation history
- retained collection identity
- source/data-quality states

This evidence is designed to support SAP Basis, ABAP, Application Support, Infrastructure, and reporting workflows using the same retained facts.

## 11. System and collector health

SPHERE monitors its own collection/runtime health separately from SAP performance state.

Relevant controls include:

- collector freshness
- collector watchdog
- auto-healing/recovery state
- platform health
- PostgreSQL/runtime health
- retention status
- Prometheus-compatible metrics
- alert rules
- release readiness gates

"Collector running", "collector health", "system health", and "data aligned/partial" are separate concepts and must not be collapsed into one status.

## 12. Reporting

The current application supports PDF performance reporting/export.

Reports are evidence summaries for operational communication. They do not convert a correlation signal into a final root-cause verdict.

## 13. ST03N Analysis workspace

SPHERE keeps a separate **ST03N Analysis** workspace for SAP workload and response-time analysis.

The main navigation currently exposes only:

- ST03N Analysis
- Performance Analysis

Old Comparator/RCA navigation must not be documented as an active primary workspace.

## 14. LOG analysis compatibility

The current LOG engine still supports detailed resource/workload analysis and historical enhanced telemetry markers where required for backward compatibility.

Active analysis includes host/resource status, workload consumers, CPU/memory, I/O Wait, Critical WP, process-level context, error/short-dump signals, and drill-down.

Historical `RCA-EXT` markers may still be parsed as a protocol compatibility requirement. Their names are not current SPHERE product terminology.

See `docs/LEGACY-TELEMETRY-COMPATIBILITY.md`.

## 15. SM37 trust boundary

SPHERE distinguishes two evidence planes:

1. **Sampled Work Process / workload observations**
2. **Authoritative SAP job execution records**

A sampled Work Process observation may show that a Job or Program was observed on an Application Server. It must never be promoted to an authoritative SM37 execution match by inference.

The current live overview intentionally reports the authoritative SM37 source as not connected until an approved execution feed is configured.

See `docs/BASIS-JOB-INTELLIGENCE.md`.

## Presentation-safe feature list

For presentations, use these implemented headline capabilities:

1. Automated SAP performance data collection
2. Live SAP performance monitoring
3. Application Server and infrastructure health
4. Current workload detection
5. Resource-to-workload correlation
6. Job and Program performance review
7. Quick analysis and investigation workspace
8. Historical trend and Workload Explorer
9. Operational evidence, availability, and SAP issues
10. PDF reporting and retained evidence

Supporting capabilities:

- ST03N Analysis
- LOG analysis
- Observation History
- System Health
- watchdog/auto-healing
- Prometheus-compatible observability
- manual Upload Logs fallback

## Claims that must not be made without measured evidence

Do not present these as established facts unless a formal measurement is available:

- a fixed percentage reduction in investigation time
- a guaranteed root-cause detection rate
- guaranteed incident prevention
- guaranteed performance improvement
- authoritative SM37 live monitoring when the approved execution source is not connected
- SLA availability derived from observed checks

Use actual measured incident data when quantitative benefit claims are required.

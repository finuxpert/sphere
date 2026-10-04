# SPHERE Current Flow and Features

This document is the source of truth for the implemented SPHERE operating flow on **v1.34.53**.

It describes current behavior only. Future roadmap ideas, presentation copy, and unmeasured benefit claims are intentionally excluded.

## Product position

**SPHERE — SAP Performance Health Evaluation & Reporting**

Operational position:

**SAP Performance Monitoring, Evaluation & Investigation Platform**

SPHERE helps SAP Basis/Infrastructure teams move from a broad symptom such as “SAP is slow” toward a narrower, evidence-backed investigation scope.

SPHERE does not replace ST03N, SM50/SM66, SM37, STAD, ST05, SAT, SQL analysis, enqueue/lock analysis, dumps, or traces.

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

Short form:

```text
Collect → Monitor → Detect → Correlate → Evaluate → Investigate → Report
```

## 1. Collect and ingest

Rundeck is the SAP-side automation layer.

SPHERE:

- discovers eligible completed executions;
- reads execution metadata/output through Rundeck REST API;
- validates expected hosts;
- stores collection manifests and retained raw evidence;
- projects normalized host/workload data into PostgreSQL;
- keeps READY / PARTIAL / FAILED semantics explicit.

SPHERE must not SSH/SCP directly to SAP Application Servers.

## 2. Live Monitoring layout

The active Live Monitoring hierarchy is:

```text
System / Collector / Data status

Infrastructure summary

SAP App Servers              Server Trend
Selected Job / Program
Correlated Events | SAP Availability | SAP Issues
Observation History | Infrastructure Analysis | System Data

Current Jobs & Programs      Selected Job / Program      Jobs & Programs to Review
```

The UI uses progressive disclosure. Deep evidence is opened in drawers/modals instead of expanding the live page indefinitely.

## 3. Infrastructure

### Current summary

Infrastructure summary distinguishes:

- **Filesystem Capacity**
- **Network**
- **Storage I/O Activity**

A full filesystem and normal storage I/O are not contradictory; they are different metrics.

### Infrastructure Analysis

Infrastructure Analysis provides current state plus retained history.

History ranges use explicit WIB date/time labels and retained-history coverage. Time before the first retained sample is not presented as zero.

Storage `util_pct` values above 100 are kept visible as source-quality evidence and marked for verification rather than silently clamped.

## 4. SAP Application Servers

APP1–APP5 provide current retained host context.

APP Critical WP is an APP-server observation. It is not a workload execution result.

Selecting an APP opens Application Server Analysis. Cross-focus may highlight the related APP but must not auto-expand unrelated drill-downs.

## 5. Server Trend

Server Trend supports selectable ranges, metrics, Average/Peak modes, collection gaps, date-aware WIB axes, and point selection.

### Historical bucket semantics

Server Trend is bucketed for longer ranges.

Peak mode keeps these separate:

- **Bucket** — aggregation interval shown on the chart;
- **Peak At** — exact retained sample timestamp producing the bucket peak;
- **Peak Value** — exact selected metric value;
- **Peak Collection** — exact saved collection used for workload detail.

Trend Details must preserve all four. The mini-history marker is anchored to the clicked bucket, while the displayed peak timestamp remains the exact sample time.

Average mode represents the bucket average and must not be presented as a raw sample.

## 6. Current Jobs & Programs

Current workloads are grouped Job/Program observations from the latest aligned READY collection.

Displayed workload evidence includes:

- grouped CPU;
- PSS Memory;
- process count;
- APP Critical WP context;
- Program/Job identity when captured.

Grouped workload CPU may exceed 100% because multiple processes/CPU cores can be aggregated.

## 7. Selected Job / Program

Selected workload context exposes:

- CPU / Avg CPU depending on source;
- PSS Memory / Avg PSS;
- Processes / Avg Processes;
- APP Critical WP or APP Critical WP overlap;
- Analyze Performance action.

APP Critical WP is scoped carefully in the selected-workload surface:

- `0` means the selected observation retained an APP Critical WP value of zero;
- `Not observed for selected workload` means the value was not retained for that selection;
- neither state is an SM37 job result.

A selection originating from Performance Review uses review-period metrics rather than pretending to be a current live snapshot.

## 8. Performance Analysis

Performance Analysis is one shared investigation surface for current, review, historical, and trend-snapshot launches.

### Selected Period

Episode summary includes:

- First Seen / First Loaded when history is truly truncated at the selected episode boundary;
- Last Seen;
- Observation Span / Loaded Span;
- Observations;
- Avg CPU;
- Peak CPU;
- Avg PSS;
- Avg Processes.

History truncation is episode-aware. A globally truncated response does not automatically make every selected episode “First Loaded”.

### Ranges

- Current
- 3H
- 6H
- 24H
- 7D
- 30D

`Current` means the selected workload episode.

Low-sample episodes are labelled explicitly.

### Chart lanes

Current observation analysis can expose:

- CPU
- PSS Memory
- I/O
- WP Count
- APP Critical WP

When Current contains only one saved observation, SPHERE shows a **Selected Observation** summary instead of drawing a trend line from one point.

Historical ranges use aggregate data and must not be presented as raw observations.

### Point drill-down

Clicking a raw/current chart point opens **Observation Details**.

Clicking a historical bucket opens **Historical Bucket Details**.

The two are intentionally different evidence types.

## 9. SAP WP / Trace Signals

When retained by the collector, Performance Analysis exposes process/WP-level evidence including:

- PID;
- WP type / WP number;
- Program;
- CPU Signal;
- Error at Snapshot;
- Latest Trace Error;
- Error Recency;
- RABAX;
- RXMSG;
- SXPG;
- JobStart counter;
- Log Path;
- observed timestamp.

Rows are drillable into **SAP WP Signal Details**.

Important rules:

- `Error at Snapshot` is populated only when collector `error_recency=AT_SNAPSHOT`.
- `Latest Trace Error` may be historical.
- WP trace counters are retained observation evidence, not authoritative job execution status.
- SM37 remains the authority for SAP background-job execution status.

Older retained observations may legitimately show that WP/Trace signals were not retained.

## 10. Correlated Events

Correlation timing uses retained timestamps.

Possible states include aligned/same-window, limited evidence, insufficient timing data, and no overlap.

For live/review investigation, exact selected episode boundaries are used where available.

Historical selected-time analysis is anchored to the selected observation and is not automatically reclassified against the current incident.

Correlation is supporting evidence only. Root cause remains unconfirmed until validated with SAP and infrastructure evidence.

## 11. SAP Availability

Availability categories remain explicit:

- SAP Application availability
- HANA System DB availability
- HANA replication availability
- SSH reachability
- Web Dispatcher availability

Missing observations are not inferred as DOWN.

Observed availability percentages describe retained checks; they are not automatically an SLA calculation.

## 12. Jobs & Programs to Review

Performance Review supports:

- 1 Day
- 7 Days
- 30 Days
- All / Programs / Jobs

Evaluation uses retained workload observations and includes average/peak CPU, Avg PSS, occurrence/coverage context, and APP Critical WP overlap.

The review queue is presented as **items sorted by review priority**. It supports operator investigation and does not present the ordering as an automatic root-cause or optimization verdict.

Review Result defaults to further investigation rather than an automatic program-optimization verdict.

No automatic ABAP/Application owner is assigned without explicit evidence.

Evaluation results are cached per committed collection so repeated reads do not recompute the same window unnecessarily.

## 13. History and Workload Explorer

History mode supports retained workload investigation without implying that old evidence caused the current incident.

Historical selections remain visually and semantically distinct from live/current state.

Trend-snapshot launches reuse the same Performance Analysis surface and carry the exact saved workload snapshot when available.

## 14. System and collector health

SPHERE keeps separate concepts for:

- System Health
- Collector Health
- Performance READY cycle
- Collector RUNNING cycle
- Availability READY cycle
- Data freshness/alignment
- watchdog and auto-healing state

These must not be collapsed into one status.

## 15. SM37 trust boundary

SPHERE distinguishes:

1. sampled Work Process / workload observations;
2. authoritative SAP job execution evidence.

A sampled WP observation must never be promoted to an SM37 execution match by inference.

Until an approved authoritative feed is connected, the UI reports SM37 as not connected/not configured.

See `docs/BASIS-JOB-INTELLIGENCE.md`.

## 16. Reporting

PDF export/reporting is a one-page quick report intended for fast Basis/Infrastructure handoff, including chat/mobile sharing.

Current report sections are:

- **SUMMARY**
- Availability
- SAP APP Server Status
- Server CPU Trend
- Selected Workload
- Jobs / Programs to Review
- **CHECK SUMMARY**
- **NOTES**

Report semantics:

- selected workload keeps `0` distinct from `Not observed` for APP Critical WP;
- report data alignment is derived from the Performance and Availability timestamps used for the report;
- both source times are printed in the report;
- `ALIGNED` and `PARTIAL` remain explicit;
- correlation is described as time-based context only;
- job execution status must be checked in SAP/SM37 while the authoritative feed is not connected;
- PDF operational state follows the same System Health semantics as the UI: service/resource criticality can be CRITICAL, APP Critical WP alone is ATTENTION, and stale performance/availability data is WARNING.

A report must not convert correlation into a final root-cause verdict.

## Presentation-safe feature list

1. Automated SAP performance data collection
2. Live SAP performance monitoring
3. Application Server and infrastructure health
4. Current Job/Program workload detection
5. Resource-to-workload correlation
6. Job/Program performance review
7. Historical trend and Workload Explorer
8. Observation/Bucket/WP signal drill-down
9. Availability, SAP Issues, and operational evidence
10. PDF reporting and retained evidence

## Claims that must not be made without measured evidence

Do not claim:

- fixed percentage reduction in investigation time;
- guaranteed root-cause detection;
- guaranteed incident prevention;
- guaranteed performance improvement;
- authoritative live SM37 monitoring while no approved feed is connected;
- SLA availability from retained observation percentages.


### v1.34.56 layout refinements

- Current Jobs and Jobs & Programs to Review use equal-height internal scroll areas; the Live page remains the outer one-screen cockpit.
- Selected Job stays fixed between the two workload lists with six analysis launchers in two rows.
- Infrastructure Analysis is history-first: the retained trend is shown above the Current Snapshot; Filesystem / Network / Storage I/O use a 45 / 20 / 35 snapshot layout.
- Correlated Events shows an explicit timing strip, issue-relative event labels, and keeps the RCA boundary visible with `Cause not confirmed`.


### v1.34.56 live flow

1. SAP App Servers + Infrastructure overview.
2. Server Trend (60%) + Technical Trend (40%) with shared range controls.
3. Current Jobs & Programs (50%) + Jobs & Programs to Review (50%).
4. Current or Review row click opens the shared Performance Analysis drawer directly.
5. Historical search lives inside Jobs & Programs to Review; there is no separate History tab.
6. Performance Analysis exposes Correlated Events, SAP Availability, SAP Issues, Observation History, Infrastructure Analysis, and System Data.

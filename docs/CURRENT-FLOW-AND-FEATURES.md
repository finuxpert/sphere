# SPHERE — Current Flow and Features

**Scope:** `rundeck-sphere-dev` source as reviewed on 30 October 2026, beginning with the four-trend/Bootstrap Monitoring changes through `96abb706`. This describes repository behavior, **not** a verified deployment to the DEV host. Application version comes from `src/app/version.js`, not this file.

## Product workflow

```text
Collect → Monitor → Detect → Correlate → Evaluate → Investigate → Report
```

Rundeck is the SAP-side collection/orchestration boundary. Python ingestion persists available raw/normalized evidence to PostgreSQL. FastAPI exposes read-only operational and historical views to a React dashboard. SPHERE helps Basis, Infrastructure, Functional and management teams investigate SAP performance; it does not prove cause or replace authoritative SAP tools.

## Navigation

- Global: **ST03N Analysis**, **Performance Analysis**.
- Primary Performance sidebar: **Monitoring**, **Jobs & Programs**, **Data Collection**, **Reports**.
- Legacy/deep links for Related Events, SAP Checks, Infrastructure and system data are still recognized and are reachable through detail flows. Do not reintroduce duplicate primary navigation.
- Detailed analysis uses existing drawers/dialogs, with preserved Back, Close, keyboard, focus and source context.

## Monitoring overview

### 1. SAP APP Landscape

Five APP cards (APP1–APP5) show available CPU, host RAM and APP Critical WP evidence. A selected APP highlights its corresponding trace and supports APP-specific investigation. Host state is derived from its own verified measurements, not from a different host's latest sample or from Infrastructure filesystem status. Stale/unverified source data must remain explicit.

### 2. Performance Trends

There are **four configurable charts**. Their default selections are CPU Usage, Memory Usage, Network and Critical WP. The panels use ECharts; Bootstrap 5 Grid is currently used for the four-chart row, while many other UI styles remain custom.

Shared controls:

- Time Range: 1D (rolling 24h), 7D, 30D, Last Month, 3M, 6M, shorter preset and Custom.
- Interval with backend-supported bucket options and Auto; long-range constraints are enforced by the API.
- Aggregation **Avg** / **Peak**; independent APP highlight across available APP traces.
- Each panel retains its metric dropdown; Network has RX/TX and Typical/Full Y-axis display controls when applicable.
- Percentage focus changes chart display bounds, never actual SAP thresholds or stored values.

Always show the exact peak value, APP, and date/time in **WIB** when present. Historical peak is different from aggregate bucket timestamp. Network is retained Infrastructure traffic from a selected single interface per APP/sample, not the sum of bonded/virtual/physical interfaces and not SAP job network usage. Missing samples are evidence gaps, not zeros or outages.

On wide desktop, the four charts are one row. Medium/narrow layouts wrap to two/one columns. A compact layout may fit the overview in one screen at generous viewport dimensions, but this is a **visual acceptance target** rather than an unconditional guarantee. Preserve data access and natural scrolling when constrained.

### 3. Jobs & Programs overview

The lower Monitoring area displays four source-backed saved evaluation categories (Review, Attention, Data limited, Normal), a **two-item preview** of programs needing review and a **two-item preview** of current observed workloads. Those counts and previews have different populations/time windows: saved 1D evaluation versus latest collection. The full source-backed data remains available through **View Details**, **View All**, Jobs & Programs Current, Review and Search; preview truncation never limits backend results.

Grouping, CPU/PSS, execution identity, Critical WP observation and review status are not equal to a failed SM37 job. A job/program can be a performance review candidate without an execution failure.

### 4. System Health overview

System Health includes SAP Availability, SAP Issues, Server Health, Recent Events and Data Collection. Full detail retains source timestamps, freshness and independent source status. A successful performance collector does not prove SAP APP/HANA/Web availability now. Missing availability = UNKNOWN/PARTIAL, not DOWN.

## Jobs & Programs detail

The page has current workloads from the latest aligned retained collection and historical saved evaluation Review/Search workflows. Current observations may be fetched per verified host; pagination/partial coverage must be explicit. Review/Search use backend-filtered/validated pagination and do not infer results from a loaded subset. Selecting a workload opens the shared investigation surface with host, source and selected period carried through.

## Data Collection

Automatic collection uses Rundeck and protected service credentials. The Manual Upload workflow is separate and accepts appropriate WP-SCOUT/Daily Check logs. Collection History describes saved Rundeck runs, not SM37 job executions. API/collector status, source timestamp and readiness are distinct.

## Reports

Monthly Review uses saved SPHERE/Rundeck evidence for manual Basis evaluation, Jobs & Programs impact and management PDF output. Source-backed WP trace errors must be distinguished by **AT SNAPSHOT / HISTORICAL / unknown** recency. A sampled trace error does not prove an ABAP program or SM37 job failed. The report should use concise common English SAP/IT terms, readable threshold/time labels and clear data-source limitations without inventing results.

## Investigation evidence semantics

- Correlated events are temporal/context evidence, not a root-cause verdict.
- APP Critical WP is independent of a selected workload's observed Critical WP; a measured zero differs from an unobserved value.
- Grouped workload CPU can exceed 100% in multi-process/multi-core workloads.
- Use host RAM for server utilization and PSS Memory for retained workload memory; legacy RSS is not directly comparable to PSS.
- A single current observation must not be presented as a time-series trend.
- Historical buckets retain `bucket`, `peak_at`, `peak_value` and peak collection identity; clicking a bucket must not substitute a nearest sample.
- WP `Latest Trace Error` may be historical; `Error at Snapshot` requires matching snapshot-recency evidence.
- SM37 is authoritative for background-job execution, and source omissions never become NORMAL, UP, zero, or success.

## Main source modules

| Area | Primary source |
|---|---|
| Monitoring shell | `RundeckMonitoringHistory.jsx` and `RundeckMonitoringHistoryCore.jsx` |
| Four interactive trends | `RundeckServerTrend.jsx` and `RundeckBootstrapTrend.css` |
| Jobs & Programs | `RundeckJobsProgramsWorkspace.jsx`, `RundeckWorkloadHealth.jsx`, `RundeckCurrentWorkload.jsx` |
| Sidebar | `RundeckPerformanceNavigationState.js` |
| Collection | `RundeckDataCollection.jsx` |
| API | `backend/rundeck_api.py`, `backend/rundeck_api_core.py` |
| Historical trends | `backend/rundeck_trends.py`, `backend/rundeck_network_trends.py` |
| Database | `backend/db/` |

See [Enterprise UI Standard](SPHERE-ENTERPRISE-UI-STANDARD.md) and [Visual QA](VISUAL-QA.md) before editing layout. See [Rundeck Development](rundeck-development.md) for release/rollback. Do not claim deployment or performance gains based on source or CI alone.

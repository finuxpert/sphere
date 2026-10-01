# SPHERE Basis Job Intelligence

This document defines the trust boundary between sampled SAP workload/WP evidence and authoritative SAP background-job execution evidence.

## Core rule

`rundeck_workload_observations` contains sampled performance evidence.

It can show that a Job or ABAP Program was observed on an SAP Application Server and can support performance correlation. It is **not** an authoritative SM37 execution record.

`sap_job_executions` is the separate authoritative execution-evidence plane populated only from an approved SAP job-execution source.

A Work Process snapshot must never be promoted to an SM37 match by inference.

## Current workload evidence

SPHERE currently supports:

- Current Jobs & Programs;
- Performance Analysis;
- Observation Details;
- Historical Bucket Details;
- SAP WP / Trace Signal Details;
- Observation History;
- Jobs & Programs to Review;
- Workload Explorer / historical analysis;
- contextual SM37 verification when authoritative execution evidence exists.

## WP / Trace signal semantics

Current collector observations may retain per-process/WP fields such as:

- PID;
- WP;
- WP type;
- Program;
- CPU class/signal;
- RABAX;
- SXPG;
- JobStart;
- RXMSG;
- error code;
- error program;
- error recency;
- latest error timestamp/age;
- log path.

SPHERE exposes two different error concepts:

### Error at Snapshot

Shown only when collector `error_recency=AT_SNAPSHOT`.

This means the retained trace error was marked as current at the selected snapshot.

### Latest Trace Error

The most recent trace error retained by the collector.

It may be `HISTORICAL` and must not be interpreted as:

- current error;
- background job failure;
- SM37 job status;
- root cause.

## WP counters

RABAX/RXMSG/SXPG/JobStart values are collector-retained WP trace counters for the selected observation.

Do not sum them across observations unless the collector semantics explicitly define them as additive.

Do not present them as authoritative SAP job execution counts.

## Grouped workload semantics

A JobName can group multiple PIDs/WPs, potentially with different Programs and trace signals.

Therefore:

- WP evidence is displayed per retained process/WP row;
- grouped workload CPU can exceed 100%;
- Program may be `Not captured` if the source row does not contain a usable Program;
- APP Critical WP remains APP-level evidence, not workload causation.

## Approved execution feed

The repository includes:

`ops/rundeck/import-sm37.py`

Supported authoritative fields include:

- client
- job_name
- job_count
- step_no
- program
- variant
- status
- scheduled_by
- server
- started_at
- ended_at
- duration_seconds

Validate before apply:

```bash
cd /root/rundeck-sphere-dev
SPHERE_RELEASE_ROOT=/opt/sphere-rundeck-dev/current \
  /opt/sphere-rundeck-dev/venv/bin/python ops/rundeck/import-sm37.py /path/to/sm37-export.csv
```

Apply only after source/scope validation:

```bash
SPHERE_RELEASE_ROOT=/opt/sphere-rundeck-dev/current \
  /opt/sphere-rundeck-dev/venv/bin/python ops/rundeck/import-sm37.py /path/to/sm37-export.csv --apply
```

## Verification semantics

When authoritative execution evidence exists:

- **NOT VERIFIED** — no authoritative source configured for the requested context.
- **NOT FOUND** — authoritative evidence exists, but no execution matched.
- **PARTIAL MATCH** — identity matched while supporting context is incomplete.
- **MATCHED** — authoritative execution identity plus required supporting context reached the verification threshold.

`MATCHED` confirms execution context only. It is not a root-cause verdict.

## Operator workflow

### Live Monitoring

Use:

- SAP Application Servers;
- Server Trend;
- Current Jobs & Programs;
- selected Job / Program;
- Correlated Events;
- SAP Availability;
- SAP Issues;
- System Health.

### Performance Analysis

Use selected-period metrics, raw observation drill-down, historical bucket detail, and WP/Trace Signal detail.

### Performance Review

Use 1D/7D/30D review to prioritize investigation, not to declare failure or assign ownership automatically.

### History

Use Workload Explorer and historical Performance Analysis to inspect recurrence/patterns.

### SM37

Use SM37 verification only when an approved authoritative feed is present.

## Safety rules

- Never infer SM37 status from WP sampling.
- Never label a retained trace error as `Job Failed` without authoritative execution evidence.
- Never convert correlation into a final root-cause declaration.
- Keep source identity, timestamp, bucket, and collection visible.
- Keep historical evidence distinct from live/current evidence.
- Do not expose SAP/Rundeck credentials through UI or exports.

## Current platform state

A not-configured SM37 source is valid until an approved execution feed is intentionally connected.

Current production readiness accepts:

- `sm37_verification=NOT_CONFIGURED`
- `job_monitor=WAITING_FOR_SM37_FEED`

when all other required platform checks are ready.

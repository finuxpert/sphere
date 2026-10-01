# SPHERE Basis Job Intelligence

This document defines the trust boundary between sampled SAP workload observations and authoritative SAP background-job execution evidence.

## Core rule

`rundeck_workload_observations` contains sampled performance evidence.

It can show that a Job or ABAP Program was observed on an SAP Application Server and can support performance correlation. It is **not** an authoritative SM37 execution record.

`sap_job_executions` is the separate authoritative execution-evidence plane populated only from an approved SAP job-execution source.

A Work Process snapshot must never be promoted to an SM37 match by inference.

Correlation, baseline, and review signals narrow investigation. They do not prove root cause.

## Current UI state

SPHERE currently provides:

- Current Workloads
- Job / Program Performance analysis
- Observation History
- Jobs & Programs to Review
- Workload Explorer / historical analysis
- contextual SM37 verification capability when authoritative execution evidence exists

The Live Monitoring overview intentionally reports the authoritative SAP job source as **SM37 NOT CONNECTED** until an approved execution feed is configured.

Do not present sampled workload data as live authoritative SM37 monitoring.

## Approved execution feed

The repository includes an importer for approved SAP job execution exports:

`ops/rundeck/import-sm37.py`

Supported execution identity/context fields include:

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

Validate an export without writing:

```bash
cd /root/rundeck-sphere-dev
SPHERE_RELEASE_ROOT=/opt/sphere-rundeck-dev/current \
  /opt/sphere-rundeck-dev/venv/bin/python ops/rundeck/import-sm37.py /path/to/sm37-export.csv
```

Apply only after validating source, scope, and record count:

```bash
SPHERE_RELEASE_ROOT=/opt/sphere-rundeck-dev/current \
  /opt/sphere-rundeck-dev/venv/bin/python ops/rundeck/import-sm37.py /path/to/sm37-export.csv --apply
```

The local importer is preferred. If an HTTP import path is enabled for a controlled environment, it must use a dedicated credential and must never reuse Rundeck or SAP credentials.

## Verification semantics

When an authoritative execution feed is available, verification semantics are:

- **NOT VERIFIED** — no authoritative execution source is configured for the requested context.
- **NOT FOUND** — authoritative evidence exists, but no execution matched the requested context/window.
- **PARTIAL MATCH** — Job identity matched while supporting Program/server/time evidence is incomplete.
- **MATCHED** — authoritative execution identity plus required supporting context reached the configured verification threshold.

`MATCHED` confirms execution context only. It is not a root-cause verdict.

## Sampled workload analysis

Retained workload observations support:

- current consumer context
- 1 Day / 7 Days / 30 Days Performance Review
- average/peak CPU review signals
- memory review signals
- Application Server distribution
- Critical WP correlation
- historical workload patterns
- recurring workload review
- quick analysis and full Job / Program performance analysis

These remain sampled performance observations.

## Operator workflow

### Live Monitoring

Use:

- SAP Application Servers
- Server Trend
- Current Workloads
- selected Job / Program
- Operational Evidence
- SAP Availability
- SAP Issues
- System Health

to establish current/point-in-time context.

### Performance Review

Use **Jobs & Programs to Review** to identify workload that needs investigation across 1 Day, 7 Days, or 30 Days.

### History

Use Workload Explorer, Job / Program Performance, and Observation History to review retained patterns.

### SM37 verification

Use SM37 verification only when an approved authoritative execution source is present.

## Safety and evidence rules

- Never infer an SM37 match from Work Process sampling alone.
- Never convert correlation into a final root-cause declaration.
- Keep source identity and data-quality states visible.
- Keep historical evidence distinct from live/current evidence.
- Do not expose SAP/Rundeck credentials through the UI or exports.

## DEV smoke

```bash
bash ops/rundeck/smoke-job-intelligence-dev.sh
```

A not-configured authoritative SM37 source is a valid platform state until an approved feed is intentionally connected.

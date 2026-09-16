# SPHERE Basis Job Intelligence

SPHERE v1.29 adds a separate SAP background-job execution evidence plane alongside sampled Work Process performance observations.

## Trust boundary

`rundeck_workload_observations` is sampled performance evidence. It can show that a Job or Program was observed on an SAP Application Server, but it is not an authoritative SM37 execution record.

`sap_job_executions` stores approved SAP job execution exports. Only these rows can produce `MATCHED` or `PARTIAL MATCH` in SM37 Verification. A Work Process snapshot is never promoted to an SM37 match by inference alone.

Correlation and baseline signals narrow investigation. They do not prove root cause.

## DEV activation

After pulling the latest `rundeck-sphere-dev`:

```bash
cd /root/rundeck-sphere-dev
bash ops/rundeck/migrate-dev.sh /root/rundeck-sphere-dev
```

The migration creates `sap_job_executions`. Existing workload tables are preserved.

## Approved SM37 feed

Export execution data from an approved SAP extraction path as JSON or CSV. Supported fields include:

- `client`
- `job_name`
- `job_count`
- `step_no`
- `program`
- `variant`
- `status`
- `scheduled_by`
- `server`
- `started_at`
- `ended_at`
- `duration_seconds`

Validate without writing:

```bash
cd /root/rundeck-sphere-dev
SPHERE_RELEASE_ROOT=/opt/sphere-rundeck-dev/current \
  /opt/sphere-rundeck-dev/venv/bin/python ops/rundeck/import-sm37.py /path/to/sm37-export.csv
```

Apply only after checking source and record count:

```bash
SPHERE_RELEASE_ROOT=/opt/sphere-rundeck-dev/current \
  /opt/sphere-rundeck-dev/venv/bin/python ops/rundeck/import-sm37.py /path/to/sm37-export.csv --apply
```

The local importer is preferred. The HTTP import route is disabled by default. If explicitly enabled, use a dedicated `SPHERE_SM37_IMPORT_TOKEN`; never reuse Rundeck or SAP credentials.

## Operator workflow

### Live Monitoring

Use Current Workloads, SAP App Servers, Server Trend, Operational Events and Observation History for current and point-in-time performance evidence. Selected Workload shows SM37 Verification when an authoritative execution feed is available.

### Job & Program History

Use retained observations for 24H, 3D, 7D and 30D workload performance history. This remains observation history, not execution status history.

### SAP Job Monitor

The Job Monitor provides:

- execution count
- active execution count
- failed or canceled jobs
- long-running signals
- execution-linked peak CPU and Critical WP overlap
- execution success rate and duration analytics
- retained workload baseline comparison
- temporal correlation timeline
- Needs Review priority queue
- structured investigation evidence export

## Verification states

- `NOT VERIFIED`: no authoritative SM37 feed is configured.
- `NOT FOUND`: an authoritative feed exists but no execution matched the requested context/window.
- `PARTIAL MATCH`: Job Name matched but supporting Program/server/time evidence is incomplete.
- `MATCHED`: authoritative execution identity plus supporting context reached the verification threshold.

`MATCHED` confirms execution context only. It is not a root-cause verdict.

## DEV smoke

```bash
bash ops/rundeck/smoke-job-intelligence-dev.sh
```

The smoke verifies platform readiness, SM37 source status, Job Monitor API and Review Queue API. `NOT_CONFIGURED` SM37 source is valid before the first approved import.

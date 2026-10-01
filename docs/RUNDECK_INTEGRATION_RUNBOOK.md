# Rundeck Integration Runbook

## Scope

This runbook documents the automatic ingestion path for the active `rundeck-sphere-*` branch family.

- DEV: `rundeck-sphere-dev` → https://sphere.astraotoparts.co.id/dev/
- PROD: `rundeck-sphere-prod` → https://sphere.astraotoparts.co.id/

The manual `sphere-dev` / `sphere-prod` family remains a separate Upload Logs fallback line.

## Architecture boundary

```text
SAP Application Servers
    ↓
Rundeck
    ↓ REST API
SPHERE FastAPI
    ↓
PostgreSQL + retained raw evidence
    ↓
SPHERE React UI
```

SPHERE must not SSH/SCP directly to SAP Application Servers.

Rundeck remains the SAP-side collector/orchestrator.

## Collector identity

Current approved collection scope:

- project: `Linux`
- group: `SAP/AOP`
- target APP nodes: `AOPH1PAPPDC` through `AOPH5PAPPDC`
- cadence: approximately every 10 minutes

Stable project/group/job identity is the production lookup contract.

Do not hardcode a Rundeck Job UUID as the permanent source of truth because workflows may be recreated.

## Collection identity and readiness

SPHERE collection IDs use:

```text
rundeck-<execution_id>
```

Core states:

- PROCESSING
- READY
- PARTIAL
- FAILED

A collection becomes READY only when the execution is complete and expected-node evidence is complete.

The latest operational landscape must come from one aligned READY cycle.

## API access

Use server-side credentials only.

Reader access is intentionally read-only and limited to execution/output discovery required by SPHERE.

Runner credentials are separate and may be enabled only for explicitly approved mutating operations.

Never put tokens in:

- GitHub;
- frontend source;
- browser storage;
- screenshots;
- application logs.

Credential rotation dates belong in server-side operational/secret-management records, not in this repository document.

## Execution/output contract

Preferred flow:

```text
Rundeck job discovery
        ↓
eligible completed execution
        ↓
execution metadata
        ↓
execution output
        ↓
expected-node validation
        ↓
SPHERE collection manifest
        ↓
normalization / PostgreSQL projection
        ↓
retained raw evidence
```

Use Rundeck REST execution/output APIs rather than reading `.rdlog` directly from the Rundeck filesystem.

## Source-of-truth rules

- Use execution API status and node completion for collection readiness.
- Do not use historical `average-duration-exceeded` metadata as the sole success/failure decision.
- Retain execution/collection identity for investigation.
- Do not synthesize missing host evidence.
- Do not merge independent host timestamps into a fake “latest” cycle.

## Security guardrails

- No direct SAP-server connection from SPHERE.
- No Rundeck admin token in SPHERE.
- No credentials in Git.
- No raw SAP logs in Git.
- No mounted Rundeck internal data directory into SPHERE.
- Prefer REST API execution/output access.
- Keep Manual Upload Logs as operational fallback.

## Related documentation

- `docs/CURRENT-FLOW-AND-FEATURES.md`
- `docs/BASIS-JOB-INTELLIGENCE.md`
- `docs/rundeck-development.md`
- `ops/rundeck/OPERATIONS.md`

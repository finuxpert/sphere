# SPHERE Repository Instructions

These instructions apply to all coding assistants and maintainers.
Repository: finuxpert/sphere.

## Mandatory context before work

Read these maintained references before proposing changes:

- docs/DOCUMENTATION-INDEX.md
- docs/standards/ai-coding-workflow-style.md
- docs/operations/rundeck-development.md
- ops/rundeck/DEV_FIRST_MAINTENANCE_AND_PROD_PROMOTION.md
- docs/operations/REPOSITORY_HYGIENE_20261124.md

Read the relevant source and existing tests.
Verify current GitHub source and actual runtime independently.
Do not treat historical documentation as live runtime evidence.

## Environment boundaries

- Development: rundeck-sphere-dev.
- Production: rundeck-sphere-prod.
- Runtime host: JAHSVR-SPHERE.
- DEV API: 8091, public path /dev/.
- PROD API: 8092, public path /.
- Administrative GitHub audit host: mail.
- PROD promotion remains ON HOLD until explicit approval.
- Never automatically synchronize DEV into PROD.

## Standard coding workflow

1. Read canonical documentation and assess current source.
2. Identify requirement, affected files and existing implementation.
3. Assess dependencies, data contracts and migration impact.
4. Make isolated changes on one feature or fix branch.
5. Reuse existing components, services and deployment tooling.
6. Run relevant offline regression, lint, build and integrity tests.
7. Create one scoped PR and require GitHub CI success.
8. Squash merge after review and remove temporary merged branches.
9. Deploy only when explicitly authorized and classified.
10. Verify actual runtime and update canonical documentation.

Do not create duplicate workflows, APIs, CSS layers or runbooks
without a documented engineering requirement.

## Deployment contract

Classify the cumulative diff against the active release:

- Documentation and GitHub hygiene: no application deployment.
- Frontend-only: ops/rundeck/release-ui-dev.sh.
- Backend or mixed: ops/rundeck/release-dev-fast.sh.
- Migration: independent review and explicit migration approval.
- SPHERE Remote: separate isolated service release procedure.
- Production: separate approved PROD-specific procedure.

Read the maintained release runbook for exact command arguments.
Never invent replacement deployment scripts or bypass existing guards.
Never use UI-only deployment to claim backend changes are active.
Never bypass QA, migration review, PROD cross-smoke or rollback.

## Data integrity

Preserve SAP source provenance, APP identity and collection identity.
Missing evidence must not become zero or DOWN.
SM37 is authoritative for actual background job execution.
Do not invent performance improvements, workload counts or QA results.
Use measured before/after evidence.

## Operator interaction

Use concise, copy-paste-ready commands.
Prefer one guarded command block per execution stage.
Do not repeat completed assessment unless evidence is stale.
Distinguish read-only assessment from mutation.
Stop on failed safety checks and investigate before continuing.
Never request or expose credentials or tokens.

## Change checkpoint

Record source SHA, PR, CI, deployment mode, active runtime SHA,
QA, measured results, rollback, PROD impact and remaining work.

A GitHub merge or CI PASS is not a runtime deployment.

## Repository maintenance

Automatic weekly GitHub maintenance is audit-only.
Never automatically delete branches, runs or workflow definitions.
Use reviewed manifests for separately approved cleanup.
Preserve evidence, active PR dependencies and release history.

## Engineering excellence

Mandatory engineering standards:

- docs/standards/ENGINEERING-PRINCIPLES.md
- docs/standards/REPOSITORY-ARCHITECTURE.md
- docs/architecture/ENGINEERING-REFACTORING-ROADMAP.md

Treat SPHERE as one integrated engineering product.

Do not build patchwork features, arbitrary naming schemes,
redundant services or release-specific CSS override layers.

Preserve canonical product identity, module vocabulary,
naming conventions and deployment procedures across
all coding sessions.

Read the architecture roadmap and latest source before
starting refactoring.

Do not change canonical conventions without a documented
engineering decision and reviewed PR.

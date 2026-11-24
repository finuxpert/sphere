# SPHERE Engineering Principles

Status: Canonical engineering standard.
Scope: All maintainers and AI coding assistants.

## Product vision

SPHERE is an integrated SAP Performance Intelligence
Platform, not a collection of independently patched
features.

Engineer SPHERE like a precision aerospace system:
coherent architecture, purposeful components,
efficient operation, predictable behavior,
measurable reliability and maintainable design.

## Permanent product identity

- Product: SPHERE
- Description: SAP Performance Health & Reports
- Positioning: SAP Performance Intelligence Platform
- Environments: SPHERE DEV and SPHERE PROD
- Remote access: SPHERE Remote
- UI foundation: SPHERE Design System
- Development governance: SPHERE Engineering Standard
- Deployment: SPHERE Release Pipeline

Do not introduce arbitrary alternative product names,
release-specific module names or redundant branding.

## Engineering philosophy

1. Architecture before functionality.
2. Root-cause correction before symptom patches.
3. Reuse before creation.
4. Simplification before additional abstraction.
5. Measurement before optimization.
6. Validation before deployment.
7. Reliability before feature expansion.
8. Data integrity before presentation.
9. Explicit ownership before implementation.
10. Consistency before personal coding preferences.

## Anti-patchwork policy

Do not:

- Add new CSS override layers as routine bug fixes.
- Create replacement components without assessing existing ones.
- Duplicate business logic or database queries.
- Create redundant API routes for minor UI differences.
- Add dependencies without technical justification.
- Increase bundle budgets to hide regressions.
- Introduce new deployment methods for each task.
- Rename working contracts without compatibility assessment.
- Use speculative measurements or invented SAP evidence.
- Add architectural layers without demonstrated value.

Temporary workarounds require a documented reason,
owner, expiration or removal condition, and follow-up.

## Development priorities

During architecture stabilization, defer nonessential
feature expansion. Prioritize correctness, performance,
security, consistency and maintainability.

Do not perform a big-bang rewrite.

Use small reversible refactors with measurable parity.
Preserve application behavior unless a behavior change
is explicitly within the approved scope.

## Quality dimensions

- Architecture and dependency ownership
- Naming consistency
- Readability and maintainability
- Runtime performance
- Database efficiency
- Visual consistency
- Data provenance and accuracy
- Reliability and observability
- Security and environment isolation
- Automated regression coverage
- Deployment and rollback safety

Engineering success is not measured by LOC reduction
or file count alone.

## Governance

AGENTS.md is the repository entrypoint.

Canonical architecture and naming standards:
REPOSITORY-ARCHITECTURE.md.

Deployment follows the maintained release runbooks.

Changing a canonical convention requires an explicit
engineering decision and an update to the relevant
standard in the same reviewed PR.

PROD remains separately governed and ON HOLD.

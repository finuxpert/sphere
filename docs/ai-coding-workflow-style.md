# AI Coding Workflow Style

This document defines the preferred implementation workflow for the SPHERE repository.

## Current repository identity

```text
Repo       : finuxpert/sphere
DEV        : rundeck-sphere-dev
PROD       : rundeck-sphere-prod
DEV URL    : https://sphere.astraotoparts.co.id/dev/
PROD URL   : https://sphere.astraotoparts.co.id/
```

The manual Upload Logs branch family (`sphere-dev` / `sphere-prod`) is separate from the active Rundeck-integrated release line.

## Working pattern

```text
small change → validate DEV → smoke/readiness → review → PR → PROD
```

Keep rollback easy and leave a clear audit trail.

For each meaningful change, document:

- what changed
- why it changed
- files affected
- validation performed
- deploy state
- rollback path when relevant

## DEV first

Implement and validate on `rundeck-sphere-dev`.

Do not modify `rundeck-sphere-prod` directly for normal feature work.

Production promotion uses a normal PR:

```text
base:    rundeck-sphere-prod
compare: rundeck-sphere-dev
```

Do not force-reset PROD to DEV.

## Current active UI workspaces

The main navigation currently exposes only:

```text
#/tool/analyzer  → ST03N Analysis
#/tool/logs      → Performance Analysis
```

Do not document or reintroduce `#/tool/comparer` as an active primary workspace unless it is intentionally restored as a product decision.

## Current Performance Analysis structure

Top-level modes:

- Live Monitoring
- History

Primary Live Monitoring areas include:

- infrastructure overview
- SAP Application Servers
- Server Trend
- Current Workloads
- selected Job / Program context
- System Health
- Jobs & Programs to Review

Use progressive disclosure/drawers for deeper analysis rather than permanently expanding all secondary data.

## Implementation preference

Prefer the smallest change that solves the problem without weakening investigation semantics.

For UI work:

1. understand the current component/data flow first
2. prefer localized CSS/layout changes when behavior is already correct
3. change React/backend logic only when the required behavior cannot be achieved safely at presentation level
4. preserve explicit loading/error/empty/stale/partial states
5. preserve source identity and trust-boundary wording

Do not reintroduce runtime DOM patchers, MutationObserver-based UI injectors, or recursive DOM enhancers as a substitute for component-level implementation.

## Active style reality

The current Rundeck Performance Analysis workspace still imports multiple historical SPHERE/Rundeck CSS layers through `ToolLogWorkspace.jsx`.

Do not delete a stylesheet only because its filename contains an old version number. Remove or consolidate it only after confirming that it is not imported/referenced and after visual regression testing.

Long term, semantic filenames are preferred over version-number-only names.

## Trust boundaries that code must preserve

- SPHERE does not SSH/SCP directly to SAP Application Servers.
- Rundeck is the SAP-side collection/orchestration layer.
- Sampled workload evidence is not authoritative SM37 execution evidence.
- Historical correlation is not proof of root cause.
- Missing availability observations are not automatically DOWN.
- Current/live evidence must remain visually distinct from historical evidence.
- collector state, platform health, and data alignment are separate concepts.

## Required validation

For normal Rundeck DEV work:

```bash
/opt/sphere-rundeck-dev/venv/bin/python -m unittest backend.tests.test_rundeck
npm run qa
bash ops/rundeck/prod-readiness-check.sh
```

Use `docs/VISUAL-QA.md` when a UI change can affect layout, overflow, density, responsive behavior, or interaction.

## Commit style

Use concise semantic messages, for example:

```text
docs: align SPHERE flow with v1.34.29
ui: refine selected workload analysis
fix: preserve APP highlight-only focus
test: cover shared API path methods
```

Avoid vague messages such as `update`, `changes`, or `wip`.

## Documentation rule

Before describing a feature as current:

1. verify the active branch
2. verify the current component/backend path
3. distinguish implemented behavior from roadmap
4. distinguish measured outcomes from estimates
5. update `docs/CURRENT-FLOW-AND-FEATURES.md` when the product flow materially changes

Do not keep competition copy or one-off historical implementation notes as current product documentation.

## Handoff template

For a major implementation batch, summarize:

```text
Repo
Branch
Version/build
Changed files
Behavior changed
Validation
Deploy/readiness status
Known limitation
Rollback/next step
```

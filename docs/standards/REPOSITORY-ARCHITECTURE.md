# SPHERE Repository Architecture Standard

Status: Canonical.
Architecture strategy: Incremental modularization.
Product: SPHERE.

## Canonical vocabulary

Frontend domains:

- Application Shell
- Monitoring
- Jobs & Programs
- Reports
- Data Collection
- ST03N Analysis

Logical backend responsibilities:

- Workload Intelligence
- Performance Intelligence
- Report Engine
- Availability Engine
- Evidence Engine
- Snapshot Engine

Data and operations:

- Telemetry Pipeline
- Persistence Layer
- Release Pipeline
- Quality Gates
- Repository Maintenance

Logical names do not authorize new services or engines.
First map existing implementations to responsibilities.

## Naming conventions

| Item | Convention | Example |
| --- | --- | --- |
| React component | PascalCase | MonitoringDashboard.jsx |
| React hook | use + camelCase | useWorkloadHistory.js |
| JavaScript module | camelCase | reportFormatter.js |
| JavaScript function | camelCase | normalizeTelemetry |
| JavaScript variable | camelCase | workloadSamples |
| Python module | snake_case | workload_evaluation.py |
| Python function | snake_case | evaluate_workloads |
| Python class | PascalCase | WorkloadEvaluator |
| Constants | UPPER_SNAKE_CASE | DEFAULT_PAGE_SIZE |
| CSS file | kebab-case | monitoring-layout.css |
| CSS class | kebab-case | monitoring-toolbar |
| Shell script | kebab-case | release-dev-fast.sh |
| SQL identifier | snake_case | workload_observations |
| API path | stable kebab-case resource names | /workload-history |
| Test file | descriptive behavior or contract | report-periods.test.mjs |
| Git branch | type/scope-description | refactor/dev-report-structure |
| Commit | conventional commit style | refactor(reports): extract period logic |

Existing public API, database, deployment and integration
contracts are preserved unless explicitly migrated.

## Naming restrictions

Do not use arbitrary suffixes:

- new, latest, final, final2, copy, temp
- fix2, patch3, improved, better
- release numbers or calendar dates in application filenames

Version suffixes are allowed only for explicit protocol,
schema or compatibility contracts.

Historical tests, dated evidence and migrations retain
their meaningful provenance.

Use Git history, tags and release notes for versioning.

Do not mass-rename existing files.

Every rename requires reference and dependency review,
including imports, tests, CSS ordering, scripts, CI,
documentation and deployment contracts.

## Target repository ownership

The following is a target logical organization,
not authorization for immediate folder relocation.

src/
  app/          Application shell and routing
  components/   Shared presentation primitives
  features/     Domain-owned application functionality
  hooks/        Truly shared React hooks
  services/     API clients and integration boundaries
  utils/        Shared pure utilities
  styles/       Design tokens and shared styles
  vendor/       Explicit third-party integration

backend/
  routers/      HTTP interface and request validation
  services/     Application and domain logic
  repositories/ Persistence access
  db/           Database configuration and migrations
  tests/        Backend regression tests

ops/            Operations and release automation
scripts/        Build and QA tooling
docs/           Canonical documentation
.github/        CI and repository automation

Prefer domain-local components, hooks, tests and styles.
Only promote functionality to shared modules when
cross-domain reuse is demonstrated.

Do not introduce empty directories or abstraction layers
merely to imitate a generic architecture template.

## Dependency direction

Presentation -> Application -> Domain -> Persistence

- Keep domain logic independent of UI components.
- Keep SQL and persistence behavior outside presentation.
- Keep route handlers focused on transport concerns.
- Keep shared utilities independent of feature modules.
- Avoid circular dependencies.
- Avoid hidden global state and unnecessary coupling.

## Function and component design

Use precise action-oriented function names.

Functions should have a clear responsibility.
Prefer pure transformations when practical.
Extract coherent responsibilities, not arbitrary LOC chunks.

Use explicit data contracts and meaningful names.
Document non-obvious decisions, not obvious syntax.

Keep public behavior stable during refactoring.

Files above 1000 LOC require assessment.
Large files are review signals, not automatic failures.

## CSS architecture

Establish ownership for:

- Design tokens
- Base typography and spacing
- Application layout
- Shared components
- Domain-specific styles
- Responsive behavior
- Accessibility and theme behavior

Consolidate verified duplicate declarations.
Preserve selector specificity and import ordering.
Avoid uncontrolled global overrides and !important growth.

Preserve current visual output, accessibility,
lazy-loading boundaries and bundle budgets.

CSS modularization requires build and browser parity.
PR 117 is a historical regression example.

## Performance architecture

Measure before and after:

- API P50/P95 latency
- Response payload size
- Cold and warm evaluation paths
- Database query cost
- JavaScript and CSS bundle size
- Frontend loading and rendering behavior

Use bounded queries and progressive loading where justified.
Do not introduce caching without freshness and invalidation
rules.

Do not claim improvements without measured evidence.

## Quality gate

Every refactor requires:

1. Source and dependency assessment.
2. Explicit scope and ownership.
3. Contract and compatibility review.
4. Relevant automated regression tests.
5. Existing build and bundle-budget checks.
6. Visual parity when presentation changes.
7. Separate runtime verification when deployed.
8. Documented result and rollback path.

Use existing QA tooling before adding new frameworks.

See ENGINEERING-PRINCIPLES.md and AGENTS.md.

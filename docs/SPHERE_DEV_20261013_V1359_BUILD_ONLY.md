# SPHERE DEV v1.35.9 — UI audit follow-up

Scope: `rundeck-sphere-dev`; no SAP backend changes, database migrations, or PROD release.

- One shared Server Collection Gap band for CPU/RAM. The Technical Trend retains timestamped gaps/markArea in the chart but does not repeat the outer gap summary.
- Reduced crowding on 7D timeline x-axis (6 instead of 7 splits; suppress redundant last same-day tick). Last sample time still accessible through chart tooltip and Trend Details.
- Increased readability in Workload Health summary and page-jump without expanding the one-screen layout.
- Uses existing source-backed evaluation summary, per-APP gap semantics, and direct page jump.
- Bumped DEV app version to 1.35.9 to distinguish a new built artifact from the previously served 1.35.8 / f302cba.

## Build-only workflow (QA deliberately omitted at operator request)

On JAHSVR-SPHERE, from a clean `rundeck-sphere-dev` working tree:

```bash
cd /root/rundeck-sphere-dev && test "$(git branch --show-current)" = "rundeck-sphere-dev" && test -z "$(git status --porcelain)" && git fetch origin rundeck-sphere-dev && git merge --ff-only origin/rundeck-sphere-dev && npm run build:dev
```

Build produces local `dist/`. **It does not publish /dev/**, move Nginx roots, or touch PROD.
Visual QA/data validation intentionally not executed; do not record them PASS.

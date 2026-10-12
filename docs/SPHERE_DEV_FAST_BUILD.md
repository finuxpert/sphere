# SPHERE DEV — Build-only workflow (2026-10-12)

Scope: `finuxpert/sphere`, branch `rundeck-sphere-dev`. Do not change `sphere-dev`, `sphere-prod`, `rundeck-sphere-prod`, database migrations or SAP jobs.

## Fast developer loop

1. Edit and commit source through GitHub on `rundeck-sphere-dev`.
2. On JAHSVR-SPHERE, update source with `git pull --ff-only origin rundeck-sphere-dev`.
3. Run `npm run build:dev`. This checks the branch and clean worktree, builds with Vite, and verifies `dist/index.html`. It does not run Playwright, Vitest, lint or browser QA.
4. Deploy the verified DEV artifact through the **existing guarded DEV-only deployment procedure**. Keep source/artifact SHA, database-migration decision, backup and rollback checks intact. This script itself **does not deploy**.
5. Operator reviews `https://sphere.astraotoparts.co.id/dev/` and sends screenshots; repair UI issues from those screenshots.

Do not add browser QA or desktop snapshot gates to routine UI changes. Retain existing test files and `qa:*` npm scripts for exceptional backend/API ingestion incidents, integration regressions and release investigations. Build failure itself must always stop deployment.

## Code cleanup rules

Remove files/exports/selectors only after their import/reference graph is checked. Do not bulk-delete versioned CSS: historical modules may remain imported, and cascade order matters. Consolidate a confirmed duplicate in the same scoped change, keep a focused diff, and never suppress build errors by skipping compilation.

## Commands

```bash
cd /root/rundeck-sphere-dev
git pull --ff-only origin rundeck-sphere-dev
npm run build:dev
```

Report `BUILD_DEV=PASS` only after the command succeeds; do not report deployment or screenshot acceptance as complete based on a build.

## Compact cockpit visual batch (2026-10-12)

Commit bcd943d adds a **CSS-only**, desktop-first refinement in `RundeckMockupParity.css`: narrower header actions, responsive status/popover width, denser APP cards and analysis launchers, readable chart minimum height, larger table text, expanded Jobs table capacity for taller screens, consistent modal padding/width, and reduced-motion support. Existing component hierarchy, API calls, SAP semantics, backend and DB were not changed.

This is an initial v1.35 design batch; the deployed app version remains `1.34.91` until a separately coordinated version/release update. Do not assume all proposed improvements are implemented. It is deliberately not accompanied by Playwright or snapshot QA; operator validates on the DEV site after a verified build and frontend-only release.

**Build only:** `npm run build:dev`. Deploy separately using a guarded frontend-only release process. PROD remains untouched.

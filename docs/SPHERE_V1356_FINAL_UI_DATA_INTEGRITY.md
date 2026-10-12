# SPHERE v1.35.6 DEV — UI & Data Integrity

Date: 2026-10-12 (WIB). Repo: `finuxpert/sphere`. Source branch: `rundeck-sphere-dev`.
Baseline: `d8442471dc0496457e86e324c435830960652a8c` (v1.35.5).
Scope: frontend, UI status helpers, automated tests, documentation only.
NO PROD deployment, backend/collector/Rundeck/DB/migration/credential changes.

## Implemented in GitHub DEV source

1. Single status threshold contract: CPU 75/90, host RAM 80/90, I/O Wait 10/20, filesystem 75/90, APP Critical WP attention 1–2 / critical 3+. A missing host resource metric cannot yield a NORMAL host resource result, and grouped process CPU is not used for host CPU limits.
2. SAP Issues: partial Promise.allSettled responses retain independent source errors as UNKNOWN; no silent optimistic check success. Missing numeric values are UNKNOWN, not 0. Sample collection identity and timestamps are checked. Old or unverified APP readings and Availability status are shown as previous evidence, not fresh NORMAL. The 20-minute default matches the current API/Availability UI baseline; confirm effective Rundeck env override on the server.
3. System Health: SAP Availability alone cannot mark an unobserved host as healthy.
4. Run History: selected-episode performance observation rows, distinct Rundeck collection identities, and unverified SM37 job executions are named separately. No SM37 execution counts inferred from saved performance rows.
5. Related Events: the summary compares `incident.signal_active_since` to `selected_workload.correlation_observed_at`, explicitly labels the API sample anchor, preserves first/last observed context and removes the unsupported label "Same period". Source-global max skew remains in technical details, independent of the issue/workload pair. Proximity is never job start or causation.
6. Infrastructure: file-system observations require exact APP host and collection identity, and the operator can inspect mount, sample time and collection provenance. Five matching 89% percentages remain distinct APP observations; shared filesystem versus duplication is **not** established without read-only live evidence.
7. Paired history table: smaller minimum width and readable body/header text, without shrinking data fonts further. Existing popup/Overview architecture retained; no additional CSS override file.

## Tests added and execution evidence

- New `scripts/tests/rundeck-integrity-v1356.test.mjs`, wired into `npm run qa` as `qa:integrity`. Covers threshold edges, invalid data, partial API failure, APP/Availability freshness, time pairing/anchor, observation-vs-collection identity, five APP filesystem mapping, and Availability not proving host health.
- Isolated V8 smoke evaluation against current GitHub source: 7/7 focused logic/static integration checks PASS. This is **not** npm test, eslint, Vite build, Playwright, or server verification.
- `npm run qa:integrity`: NOT RUN on server; `npm run qa`: NOT RUN; DEV build: NOT RUN; screenshots and Windows theme/Android responsive tests: NOT VERIFIED.
- Filesystem source verification: `bash ops/rundeck/audit-infra-fs-dev.sh` exists and is read-only; **not run** against DEV API by this session. Record each APP host, mount point, collection ID, FS timestamp, snapshot timestamp and percentage before concluding root cause.

## Release guard and remaining work

- GitHub source is ready for guarded server validation, not verified as deployed. **Do not use `sphere deploy dev` or `ops/rundeck/deploy-dev.sh`** for this frontend-only scope: full deployment installs/manages service units/timers and may touch credentials. Only the `ops/rundeck/release-ui-dev.sh <EXACT_40_CHAR_HEAD_SHA>` static-web flow is in scope, and only after branch, clean worktree, source SHA, read-only DB revision, QA/build, screenshot gate, backup/rollback preflight and operator approval on DEV.
- `ops/rundeck/release-ui-dev.sh` was updated to reject versions other than `1.35.6`, pin the exact source SHA, run the existing desktop geometry tests plus Android overflow smoke, and print its true `DEV_UI=$APP_VERSION`. It retains atomic DEV-only static symlink cutover, prior symlink rollback, and PROD index hash checks. **Not executed here**. The legacy test names still say `v1.34.91` but test existing geometry invariants; all results require real logs.
- Before announcing DEV PASS: run `npm run qa` (includes `qa:integrity`), run the read-only FS audit, use the guarded UI-only SHA-pinned release script after independent backup/rollback preflight, inspect runtime build SHA, capture 1366/1536 desktop, Android, light/dark/system theme screenshots. Review popup sizing, pager visibility, no page-level scrollbar, no horizontal overflow, false UNKNOWN/NORMAL, system data, Jobs/Programs analysis and stored evidence timestamps.
- Live API could not be reached from this session; no live FS/shared mount, collector status or current source freshness conclusion is made.
- PROD promotion remains **HOLD** until explicit approval. No migration.

## Source cleanup boundaries

No indiscriminate CSS deletion. Existing Infrastructure CSS contains several historical selectors and overriding heights; these need screenshot-verified computed-style review before removal. The existing popup styles remain in place; large-scale refactor, backend logic changes and unrelated branch changes are deliberately excluded.

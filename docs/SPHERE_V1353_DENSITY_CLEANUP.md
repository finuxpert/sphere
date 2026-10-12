# SPHERE v1.35.3-dev — Overview density and safe CSS cleanup

Date: 2026-10-12
Repository: `finuxpert/sphere`
Branch: `rundeck-sphere-dev`
Scope: UI presentation, page sizing and loaded-workload pagination only.

## Why

Operator's v1.35.2 desktop screenshot confirms the five APP cards, three trends, and six Operational Analysis shortcuts are visually coherent. The remaining issue was the second (browser-level) vertical scrollbar when the Jobs & Programs list displayed too many tall rows. Some legacy CSS explicitly forced `max-height:none` and `overflow:visible`, overriding the bounded scrolling table from the active workspace.

## Changes

- `RundeckMockupParity.css`: removed the obsolete `JobsProgramsWorkspace` / `CurrentWorkloadTableWrap` unbounded height/overflow declarations, and the competing older table-height rule. The full-width vertical Overview section order is unchanged.
- `RundeckCurrentWorkload.css`: deleted obsolete selector blocks targeting the retired `.rundeckBottomBandV13456` 50%-width job pane and an unused workload-selection shim. Active `.rundeckJobsProgramsWorkspace` table widths remain.
- `RundeckCockpitPolish.css`: replaced the invalid `//` CSS comment with the proper block-comment syntax; this addresses the prior Vite CSS warning without changing styling.
- `RundeckOperatorDesignSystemV135.css`: **one authoritative, final Overview layout budget** for desktop Jobs & Programs. Live table uses internal scrolling and a viewport-responsive max-height; Review table is also bounded; page itself is never clipped. On genuinely short desktop viewports, APP cards and trend charts shrink moderately, keeping real data legible. Minor font/readability improvements for job identity and operational microcopy.
- `RundeckCurrentWorkload.jsx`: page size is now 3/4/5/7 real loaded observations according to browser innerHeight, rather than up to 9 potentially overflowing rows. Search and observed-vs-loaded distinctions are unchanged; the response still requests at most 50 real rows and no synthetic data.
- `src/app/version.js`: explicitly set `APP_VERSION=1.35.3`, `APP_PREVIOUS_VERSION=1.35.2`, and matching UI revision/engine identifiers.

## Invariants and guards

No API routes, collector/Rundeck execution, SAP classification, timing correlation, PSS/host RAM units, job identity, SM37 status authority, DB migrations, or backend sources are changed. All details remain modal popups rather than new pages. `rundeck-sphere-prod` is not modified.

**Promoting DEV to PROD remains HOLD** pending explicit operator approval of v1.35.3 screenshots and updating the pinned promotion guard. Do not run `sphere promote dev-to-prod` now.

## Deploy / acceptance

From root on JAHSVR-SPHERE, use the existing documented command:

```bash
sphere deploy dev
```

This builds and releases DEV frontend with manual browser QA (no Playwright). Only after `FINAL=PASS`, hard-refresh `https://sphere.astraotoparts.co.id/dev/` and confirm build label `v1.35.3-dev` plus source SHA.

Manual inspection: Overview at 1366/1536 desktop width, 768/850 browser innerHeight; no page-level scrollbar at supported common desktop heights, Live table has its own bounded overflow when needed, pager and search remain reachable, Review/Search are usable, APP status and Critical WP preserved, all six shortcuts and detail popups remain functional. If a very short viewport still needs page scroll to keep controls accessible, prefer that to clipping data.

**Verification status:** Source-level checks only in this task. No on-server build, HTTPS deploy, runtime geometry, animation or API proof was executed by the assistant.

# SPHERE Visual QA

SPHERE includes an optional Playwright visual-regression harness for the Rundeck dashboard. It is intentionally separate from the default `npm run qa` release gate so ordinary server deploys do not require browser binaries or external package installation.

## Coverage

The visual suite checks both 1920×1080 desktop and 1366×768 laptop viewports. It validates:

- SAP Performance Summary hierarchy and horizontal overflow;
- Host Resource / SAP Workload readability;
- minimum table text readability and major section spacing;
- Performance Evaluation controls for 1 Day / 7 Days / 30 Days;
- evaluation table rendering and responsive containment;
- SAP Issues columns for SAP Signal, Current Severity and Peak Severity;
- resolved issue semantics (`CLEARED`);
- screenshots for overview, evaluation, and SAP Issues.

## One-time local setup

After the normal locked install (`npm ci`), install Playwright without changing `package.json` or `package-lock.json`:

```bash
npm install --no-save @playwright/test
npx playwright install chromium
```

## Run against deployed DEV

```bash
SPHERE_VISUAL_BASE_URL='https://sphere.astraotoparts.co.id/dev/#/tool/logs' npm run qa:visual
```

The suite saves screenshots/traces under `test-results/visual` and an HTML report under `playwright-report`.

## Establish / update screenshot baselines

Use this only after the DEV UI has been reviewed and accepted:

```bash
SPHERE_VISUAL_BASE_URL='https://sphere.astraotoparts.co.id/dev/#/tool/logs' \
SPHERE_VISUAL_COMPARE=1 \
npx playwright test -c playwright.config.mjs --update-snapshots
```

After approved baseline PNGs are committed, future runs can compare the dashboard with:

```bash
SPHERE_VISUAL_BASE_URL='https://sphere.astraotoparts.co.id/dev/#/tool/logs' \
SPHERE_VISUAL_COMPARE=1 \
npm run qa:visual
```

Do not update snapshots merely to make a failing test pass. Review layout, status semantics, clipping, overflow, and density changes first.


## Live Monitoring regression checklist

For the current operator console, visual review must also cover:

- 1920×1080, 1600×900 and 1366×768 desktop/laptop layouts;
- Windows/browser scaling around 125% where available;
- APP server manual expand/collapse with Critical WP detail;
- selected workload cross-highlight without automatic APP drilldown expansion;
- Server Trend retaining its position and width while an APP drilldown is open;
- no large blank area beneath Server Trend caused by the left APP pane;
- Workload Performance collapsed by default and expandable without page-width shift;
- Observation History capped to a contained scroll area;
- SAP Issues using natural height when active rows fit without scrolling;
- Infrastructure details collapsed by default;
- Infrastructure Trend collapsed by default and limited to top-risk series;
- Supporting Data collapsed by default;
- action cluster and state cluster visually separated in the SAP Performance header;
- `Collection running`, `Collector Health`, `System Health` and `Data ALIGNED/PARTIAL` remaining semantically distinct;
- Live versus historical snapshot context remaining unambiguous;
- no horizontal page overflow when any secondary disclosure is open.

A failure where expanding APP1–APP5 increases the entire two-column Server Trend band height is a layout regression, even if no element technically overflows.

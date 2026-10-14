# SPHERE DEV v1.35.17 — Visual Balance and Workload Health Density

Date: 2026-10-14
Branch: `rundeck-sphere-dev` (PROD unchanged).

## Changes

1. Desktop honeycomb APP1–APP5 remains stable 3+2 in numeric APP order. APP cluster width increases on wider viewports (max 380px), with a tighter short-height variant and the same compact single row on mobile. Active APP still uses cyan selection outline; SAP NORMAL/ATTENTION/CRITICAL colors and actual WP counts are unchanged.
2. The Selected APP detail panel retains its metrics, freshness, NFS mount and Process/Infra modal link, with balanced spacing and a subtle outline. No new data is inferred.
3. The Current Jobs & Programs split stretches the adjacent Workload Health panel to the height of existing current-job content on desktop where space permits, capped to 340px so it never creates an unbounded box. Short desktop views cap at 230px; mobile keeps existing compact behavior.
4. Evaluated-workload hexagons can now grow up to 13px (previously 10px) when the measured grid fits every single saved evaluation. The existing fail-closed Review fallback is preserved if any dot would be clipped. The API's validated Review, Watch, Unknown and Normal population is not aggregated or inferred.
5. Trend percent axes default to 0–100%, preserving the actual Warning/Critical threshold lines. A reversible **Y Axis · Focus** button optionally rescales only percentage charts based on stored observations, with a visible reminder of backend thresholds even when the guide lines lie outside the zoomed range. No source readings, thresholds, correlation logic or technical scale are modified.
6. Operational shortcut labels, contrast and focus outlines are slightly more readable without adding any cards or a second analysis row.

## Implementation

- `src/tools/components/RundeckCockpitHexV13512.css`
- `src/tools/components/rundeckWorkloadGrid.js`
- `src/tools/components/RundeckServerTrend.jsx`
- `src/tools/components/rundeckTrendAxis.js`
- `src/app/version.js`
- Test additions in `scripts/tests/rundeck-hex-dashboard-v13512.test.mjs`, `scripts/tests/rundeck-trend-axis.test.mjs`, `tests/visual/rundeck-v1356.visual.spec.mjs`, and `package.json`.

## QA before accepting DEV

On JAHSVR-SPHERE, while on `rundeck-sphere-dev`:

```bash
cd /root/rundeck-sphere-dev
npm run qa:unified-cockpit
npm run qa:trend-focus
npm run lint
npm run build:dev
```

Run Playwright checks using the documented visual QA command. Check 1920×1080, 1536×864, 1366×768 and Android. Verify no horizontal/vertical overflow, clipped dot, overlapping APP selection, missing chart threshold context, or broken modal interaction.

Use guarded deployment:

```bash
sphere deploy dev
```

**Not yet runtime-verified:** A GitHub commit, static review or test source is not a CI PASS or server deployment. Record HEAD, QA, BUILD, visual geometry, artifact hash, smoke checks and rollback before considering PROD. PROD and backend contract remain unchanged.

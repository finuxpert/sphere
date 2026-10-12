# SPHERE DEV v1.35.2 — Operator UI consistency

## Scope and release status

- GitHub repository: `finuxpert/sphere`
- Source branch: `rundeck-sphere-dev`
- UI version: `v1.35.2-dev` (manual semantic version; actual build header also embeds the short commit SHA).
- Scope: frontend-only; **popup-first** workflow, no new analysis pages, no synthetic SAP measurements, no backend/API/DB/SM37/Rundeck/PROD changes.
- Verification: GitHub source updated; Vite build, DEV public HTTPS and operator screenshot acceptance **not yet verified**. Follow the quick workflow below.

## Implementation

1. `src/tools/components/RundeckOperatorDesignSystemV135.css` is the final imported operator style contract. It provides semantic colors (active cyan; normal green; attention amber; critical red; informational neutral), consistent compact shortcut cards, modal titles/buttons/body/footers, badge chips, table density, accessible focus, and quiet hover/enter transitions. Light theme uses its own surface/border palette. Reduced-motion and print disable the new effects.
2. `SphereOperatorTabs.jsx` is a reusable, button-based segmented view controller with `aria-pressed`, group label and disabled option. It replaces duplicate switch markup for Correlated Events/Observation History, SAP Availability/SAP Issues and SAP indicator Review/All; preserves the same handlers and selected states.
3. `RundeckOperationalEvidence.jsx` renders the same history icon for Correlated Events regardless of whether an active correlation exists.
4. Existing `RundeckWorkspaceDrawer` continues to manage modal focus, Escape/Back/Close, scroll and footer. The new CSS does not change any API calls, event correlation, freshness logic or health thresholds.
5. Keep existing APP/Trend/Job/Infrastructure component-specific charts and layout. A shared visual contract **does not force equal content height**: short SAP Checks dialogs shrink naturally; complex APP and Infrastructure analysis can use more screen space.

## Operator manual acceptance (no Playwright)

On root `JAHSVR-SPHERE`, run:

```bash
sphere deploy dev
```

Only after `BUILD_DEV=PASS` and `FINAL=PASS MODE=dev`, hard refresh `https://sphere.astraotoparts.co.id/dev/`. The build label should show **v1.35.2-dev** with the active short source SHA. Check:

- Five APP cards and six Operational Analysis shortcut cards have consistent sizing, title hierarchy and hover/focus states.
- Correlated Events / Observation History navigation uses the same control as SAP Availability / SAP Issues.
- All popup Back/Close controls, table rows, badges, summary text and content padding look coherent.
- Opening APP Analysis, Job Performance, Infrastructure, SAP Checks and Trend Detail retains context and data. Use real sampled metrics, not screenshot fixture numbers.
- Light/dark appearance and a narrower viewport remain usable; no page-level horizontal overflow or invisible controls.
- Keyboard focus is visible, Escape closes as before, and reduced-motion preferences suppress animation.

If any condition fails, send the screenshot and current commit SHA for a targeted CSS/React correction.

## Production guard

`ops/rundeck/promote-ui-prod-from-dev.sh` remains **HOLD**. The old v1.35.0 approval pin must not be reused for v1.35.2. Do not run `sphere promote dev-to-prod`, perform PROD cutover, or modify `rundeck-sphere-prod` until new screenshots are accepted and release guard is explicitly updated.

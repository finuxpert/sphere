# SPHERE v1.35 DEV — Popup-first analysis

**Status:** GitHub DEV updated, server build/deploy and operator screenshot check pending.
Repository: `finuxpert/sphere`, branch `rundeck-sphere-dev`.

## UX decision (2026-10-12)

All analyses **remain popup dialogs layered over the Overview**, not new pages and not full-screen routes. The prior fullscreen workspace experiment was reverted on user request, and the unused `SphereAnalysisWorkspace.jsx` and `.css` files were deleted.

The existing `RundeckWorkspaceDrawer.jsx` continues to own accessible popup Back, Close, Escape, focus trapping and scroll behavior. Existing related-analysis tabs remain only where appropriate (Issues/Availability, Evidence/History). The dashboard remains visible behind its dimmed backdrop. APP Analysis, Job / Program Performance, SAP Checks, Correlated Events, Observation History, Infrastructure, System Data and Review retain their existing popup flows and APIs.

## Retained improvements

- Live Jobs & Programs can display 3–9 **real loaded rows** depending on viewport height; pagination and observed-vs-loaded semantics remain.
- Job History, Correlated Events, Observation History and Review Quick Analysis are lazy-loaded only on use, with loading fallback. No changes to SAP API payloads.
- APP cards, compact six-button Operational Analysis grid, per-APP selection, timestamp and source provenance remain from the current DEV cockpit.
- Version label stays `v1.35.0-dev` for this DEV iteration, not PROD.

## Data correctness

Grouped multicore CPU can be above 100%; PSS workload is not RAM host; Critical WP is a count; SM37 execution status remains authoritative and **must not be inferred** from workload observations. Infrastructure freshness and SAP source freshness must remain separate. Correlation does not establish causality. No reference screenshot sample numbers are imported.

## Release instructions

Run as root on JAHSVR-SPHERE:

```bash
sphere deploy dev
```

This fetches the DEV branch, performs a Vite build, releases frontend-only, verifies HTTPS and retains prior release for rollback. It does not run Playwright or UI screenshot QA, backend deployments, DB migration, or modify PROD. If the build fails, do not deploy.

After `FINAL=PASS`, visually review the Overview and at least Job Performance, SAP Checks, Infrastructure and Correlated Events **as popups**; send screenshots for follow-up correction.

## PROD Overview placement parity (2026-10-12)

The approved layout reference is the operator-provided PROD screenshot (not a source of SAP measurements). Desktop DEV Overview should use **one full-width vertical scan**: APP1–APP5 in one horizontal row, three trend charts across the available width, six operational analysis shortcuts in one horizontal rail, and full-width Live / Review / Search Jobs & Programs below. Individual investigations **stay popup dialogs** over the dashboard. Desktop tables retain all underlying job fields and only display observed API rows.

In `RundeckMockupParity.css`, the obsolete v1.34.91 two-column arrangement (`apps/actions` side by side and `trends/workloads` side by side), its narrow-column 3×2 action override, the duplicate tall-screen chart height lock, and the old fixed cockpit height were removed. The existing full-width layout was restored and its four section areas made explicit. No PROD commit, API, backend, DB migration, or stored data is modified.

**Verification still required:** operator run `sphere deploy dev`, confirm `FINAL=PASS`, and send a screenshot for comparison at 1366/1536 px if possible. Do not assume visual equivalence merely from CSS inspection.

## Popup consistency follow-up (2026-10-12)

The operator supplied two popup screenshots (APP1 Analysis and CPU Trend Detail) and explicitly requested a consistent **PROD-style popup format before production promotion**. No full-screen route, new navigation page, or sample data is permitted.

`RundeckPopupConsistencyV135.css` is imported last from `RundeckMonitoringHistory.jsx` to normalize existing dialog presentation without altering API code:
- All `RundeckWorkspaceDrawer` dialogs use a centered opaque shell, restrained backdrop, consistent header/Back/Close, stable modal bounds and one scroll-owning body.
- APP Analysis retains its existing two-column SAP Performance + Infrastructure layout, using most desktop height while keeping the dashboard dimly visible.
- CPU/RAM/Technical Trend Details is a separate body-level portal. It now has the same centered modal shell, an always-visible header and independently scrollable content; action buttons remain in the modal, not over the background dashboard.
- Smaller screens use bounded widths and internal scroll. Reduced-motion preferences are retained.

**Not yet verified:** build/deployment of the new CSS and operator visual acceptance for APP Analysis, Trend Detail, Job Performance, SAP Issues, Infrastructure and related evidence popups.

**Promotion hold:** previous DEV-to-PROD promotion stopped before cutover because PROD does not serve the redundant `/api/readiness` URL (HTTP 404). It already passed the supported `/api/platform/readiness` endpoint and other critical checks. The redundant URL was removed from the promotion preflight, but the promotion itself remains **HOLD** until the user approves the new popup screenshot. The pin must be explicitly refreshed to the newly reviewed DEV SHA at that time; do not promote older `2bf89c7` by accident.

Use `sphere deploy dev` only after reviewing the changes. The operator sends manual screenshots instead of running Playwright.

## Operational Analysis popup consistency — implementation (2026-10-12)

This revision continues the **popup-only** UX approved by the operator. It is a presentation release, not a new route or API feature.

- Shared `RundeckWorkspaceDrawer.jsx` accepts an optional `footer` slot while preserving `actions` in the header. Modal size, title, subtitle, Back/Close, keyboard focus and Escape behavior stay unified.
- Job / Program Performance moves the six existing Related Analysis links from the scrollable job evidence body to the actual modal footer. They retain their existing handlers/return context. Summary and timing evidence stay above a two-column chart/WP analysis, with WP table internal scrolling and without grow-to-fill whitespace.
- Infrastructure Analysis stays a centered popup and keeps the APP selector, provenance and freshness. The existing history chart is placed before the existing Filesystem, Network and Storage I/O snapshot grid, scaled to available width; no collected values or filesystem threshold changes.
- SAP Availability retains its APP/HANA/Web/Technical source-based counts. The four values are larger, while landscape checks and SSH sections share spacing, hairline separators and readable section titles.
- The shared `RundeckPopupConsistencyV135.css` is the last cockpit dialog style import. Dialogs with little content shrink to their content; long content scrolls inside the modal. APP Analysis remains a high-density two-column popup. Responsive fallback and reduced motion remain.

**Acceptance status:** Source changes committed on GitHub DEV, not server-build-verified in this chat. No Playwright or visual QA is run automatically. Operator should use `sphere deploy dev` and send screenshots of Job Performance, Infrastructure, SAP Availability and APP CPU/RAM Detail before promoting to PROD.

**Production hold remains** in `ops/rundeck/promote-ui-prod-from-dev.sh`; the last attempted promotion did not cut over and its unsupported duplicate readiness endpoint is removed. Do not unlock promotion before explicit acceptance of popup screenshots.

## Operational Analysis modal alignment — screenshot audit 20:59–21:01 WIB (2026-10-12)

Operator supplied DEV screenshots of **Infrastructure Analysis**, **Correlated Events**, and **SAP Issues**. Approved direction remains same-page popup, not full-screen navigation.

**Visual defects addressed:**
- Infrastructure chart was visibly letterboxed in the middle of the modal: SVG's 920×380 coordinates did not match the compact 200–225px CSS render height. Chart viewBox coordinates now use 920×250 and render with their natural aspect ratio. Existing retained samples, scales, thresholds, series and time labels remain data-derived.
- All three modal types use an explicit shared desktop width (bounded at 1120px), header height, body padding and scroll ownership. The dialog height follows real content rather than forcing a blank lower half.
- Correlated Events context, alignment summary, event timeline and expandable timing detail have consistent section borders, readable timestamps and optional internal event scrolling. Correlation is evidence only, not a causal diagnosis.
- SAP Issues keeps the six existing backend-derived summary metrics in a readable 3×2 grid with consistent filter, SM37 notice and indicator table spacing. Unknown/unconnected SM37 is never reported as verified job execution.
- Infrastructure shows source freshness separately from SAP status and keeps the existing APP selector, historical chart, and three existing filesystem/network/storage snapshot tables. On narrower screens, snapshot tables stack instead of overflowing.

**Release:** source-only update to `rundeck-sphere-dev`, no CI visual QA, backend or PROD changes. Run `sphere deploy dev` and manually check these three popups at 1536px and mobile width. Do not unlock PROD promotion before screenshot approval.

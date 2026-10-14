# SPHERE DEV v1.35.15 — APP Scope, Infrastructure Mapping and Source Freshness

Date: 2026-10-14
Target branch: `rundeck-sphere-dev` only. PROD and `rundeck-sphere-prod` are unchanged.

## Operator changes
- APP1–APP5 hexagons remain. Clicking an APP opens the shared SAP Process / Infrastructure modal.
- Selected APP summary names **Host CPU**, **Host RAM**, **Critical WP**, **Highest FS**. APP status comes from SAP host/WP thresholds; filesystem capacity remains independent.
- Host numbers are hidden when Performance source validity cannot be established.
- Highest FS shows the current percentage only when the Infrastructure host snapshot and samples are FRESH. When not fresh, the current reading is “—” with an explicit last retained percentage and freshness state; mount, Infrastructure host, collection ID and observation time remain accessible.
- The Infrastructure shortcut follows the selected SAP APP. It maps the APP host only against the fresh source-provided Infrastructure host list, never a stored user preference. No unique verified match = UNVERIFIED, without silently showing another host.
- Related Events identifies incident versus selected job scope. Correlation alone is not an execution status or causal verdict. SM37 remains authoritative for job execution status.
- System Data summary states the bounded query: most recent 80 collector runs in a 90-day window, including observed failures/partials. Fetch failures render unverified instead of successful history.
- SAP Checks is system-level Availability/Issues; it is not filtered automatically by hexagon.

## Data contract / fail closed
- `infrastructureTelemetryFreshness` requires the Infrastructure host collection ID and matching telemetry row IDs. Missing/mismatched identities cannot return FRESH.
- APP and Infrastructure collection identities and source timestamps are **independent**; they must not be presented as one collection.
- No zero-filling, causal inferences, manufactured host matches, or silent fallback.

## DEV validation
On JAHSVR-SPHERE:

```bash
cd /root/rundeck-sphere-dev
git branch --show-current
npm run qa:infra-freshness
npm run qa:unified-host
npm run qa:unified-cockpit
npm run qa:integrity
npm run qa:basis-investigation
npm run lint
npm run build:dev
```

Full deployment via documented guarded CLI:

```bash
sphere deploy dev
```

Browser QA:
- Select APP1…APP5 and verify each opens its own modal. Verify Process/Infra identity, distinct timestamps and missing-data behavior.
- Select APP2 then open the **Infrastructure** shortcut; evidence must show APP2 Infrastructure source or “No verified Infrastructure host mapping for SAP APP2”. It must never default to APP1 or another stored host.
- Verify when Infrastructure is STALE or UNVERIFIED, 89% is never presented as a current value.
- Verify all four Operational Analysis shortcuts are actionable and the event scope is explicit.
- Run Playwright browser checks at 1536×864, 1366×768 and Android viewport and confirm bounded dialogs and no horizontal page overflow.

## Release policy
No direct PROD changes. Do not promote if lint, QA, build or visual geometry checks fail. The GitHub commit alone is not runtime QA evidence. Record SOURCE_SHA, ARTIFACT_SHA, QA/BUILD results, browser QA and rollback evidence before any PROD promotion.

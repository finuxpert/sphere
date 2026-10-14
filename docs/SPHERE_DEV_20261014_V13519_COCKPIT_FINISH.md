# SPHERE DEV v1.35.19 — Final cockpit spacing, source labels & accessibility

Date: 14 October 2026
Branch: `rundeck-sphere-dev` (DEV only). PROD remains unchanged.

## Scope delivered
1. APP 3+2 honeycomb, existing selected APP identity, metrics and Process/Infra modal remain unchanged. The right-hand context now calls out **SAP APP sample** in the heading and **Infra FS** / **Infra sampled** (or Last Infra sample) in the selected server summary. Infrastructure freshness is independently verified and missing data is not shown as current.
2. Workload Health uses a scoped four-row desktop layout: (a) title/time, (b) backend-verified category shortcuts, (c) measured and individually clickable saved-evaluation honeycomb, (d) evidence/Unknown/SM37 footer. No saved evaluations are synthesized or removed. The existing fallback to Review is retained whenever every hexagon cannot safely fit.
3. Desktop readability improved for source timestamp, filesystem mount/freshness, Operational Analysis action text, status footer, and accessible Review-category focus.
4. Short desktop heights use a narrower grid and smaller type without growing the panel past the one-screen budget. Android layout remains compact and uses the existing Review list rather than trying to show hundreds of tiny dots.
5. Removed one superseded legend column-gap override from the active CSS layer. Broad cross-version CSS removal deferred until visual regression confirms no selector dependency.

## Preserved contracts
- APP status and WP/CPU/RAM/Filesystem threshold logic unchanged.
- SAP Performance and Infrastructure collection/time provenance kept separate.
- Full vs Typical Technical Load and the saved peak value/timestamp unchanged; 1.35.18 unit & visual regressions retained.
- Workload Review/Watch/Unknown/Normal categories still use the existing backend FULL_EVALUATED_POPULATION query and exact 1D scope.
- Saved Workload Health 1 hexagon = 1 verified evaluation; SM37 is the authoritative execution status.
- No API, database, source-collector or PROD modifications.

## QA / deployment
Run on JAHSVR-SPHERE under `rundeck-sphere-dev`:

```bash
cd /root/rundeck-sphere-dev
npm run qa:unified-cockpit
npm run qa:trend-focus
npm run qa:basis-investigation
npm run lint
npm run build:dev
```

Use the guarded deployment command `sphere deploy dev` only after branch and source identity are checked. Run Playwright visual QA for 1920×1080, 1536×864, 1366×768 and Android. Confirm:
- APP1…APP5 one-click modal and unchanged server selection.
- Workload Health's four visible regions are ordered without overlap and inside viewport; every rendered evaluation has an independent source identity and Click/Review fallback is available when none fit.
- Category shortcuts open the proper Review filter; full evaluated totals agree with backend.
- Technical Load Full/Typical remains reversible with peak and timestamp evidence.
- SAP APP sample vs Infra FS sample labels remain visible without mixing timestamps.
- Jobs pager and dashboard fit desktop viewport without scroll/overflow. Mobile does not hide key status.

A GitHub commit does **not** indicate successful lint/build/runtime/Playwright checks. Record QA=PASS, SOURCE_SHA/ARTIFACT_SHA and rollback evidence before promotion. PROD must not be changed without explicit approval.

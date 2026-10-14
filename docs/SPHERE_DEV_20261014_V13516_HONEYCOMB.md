# SPHERE DEV v1.35.16 — Compact Honeycomb Cockpit

Date: 14 October 2026
Scope: `rundeck-sphere-dev` only. No production writes.

## Operator layout

- Five SAP APP hexagons now form a stable, fixed **3 above + 2 below** honeycomb on desktop (>=900px). Their position is not ordered by status, so an APP never moves when a threshold changes.
- Selected APP still has a cyan selection outline while NORMAL/ATTENTION/CRITICAL colors remain source-derived.
- Selected APP summary remains beside the cluster. Operational Analysis already occupies the independent row below (Related Events, SAP Checks, Infrastructure, System Data); no duplicate cards or links.
- On mobile (<900px) five APP hexagons revert to the original compact single row to avoid stealing the viewport from Trend and Current Jobs.
- Laptop-short heights compact the cluster and use less chart height without removing graph labels or controls.

## Workload Health

- Keep one verified saved evaluation per clickable hexagon. No cosmetic filler, aggregation, hidden evaluation, new inference, or SM37 verdict.
- Evaluation population is still fetched from every paged API result and verified before rendering.
- Rows are staggered by half a pitch (honeycomb). `workloadDotLayout()` now reserves stagger space, computes the number of columns, and checks real panel width/height before rendering.
- If the full set does not fit, display a clear Review fallback instead of silently cropping dots. The counts/Unknown breakdown and Review link remain visible.
- Clicking an individual hexagon still opens its existing saved evaluation context.

## DEV QA acceptance

1. On desktop >=900px, APP1–3 appear above APP4–5; APP1…APP5 labels and selection positions stay stable.
2. Clicking each APP invokes the same per-server SAP Process / Infrastructure modal and does not swap another host's data.
3. All Workload Health dots correspond 1:1 with verified backend records, their number matches the saved evaluation population, and no visible dot lies beyond the container. Review is an explicit fallback if the panel cannot fit the population.
4. `pageOverflowX <= 2`, `pageOverflowY <= 2` and Jobs pager remains visible at desktop 1536×864 / 1366×768 (where supported); Android must not clip critical indicators.
5. Thresholds, source identity, timestamps, data freshness, labels, endpoint contracts, and PROD are unchanged.

Use `sphere deploy dev` from JAHSVR-SPHERE. A GitHub commit alone does not indicate runtime QA or completed deployment. In the release evidence, record `SOURCE_SHA`, `ARTIFACT_SHA`, lint/unit QA, build, browser geometry checks and rollback point. Do not deploy to PROD when tests fail.

Related existing checks: `npm run qa:unified-cockpit`, `npm run qa:visual`, `npm run qa`.

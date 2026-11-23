# SPHERE DEV Reports semantic and readability remediation — 23 November 2026

Scope: DEV-only React/PDF UI, CSS and regression tests. No data model, SQL, migrations, PRODUCTION/Nginx or SAP collector changes.

## Source evidence and audit decision

- Operator screenshots of saved **16–22 November 2026 (WIB)** report confirm APP1–5, five CPU/PSS ranked workloads, five evaluation candidates, and 4/4 APP1 filesystems.
- A source-code audit found one measurable logic defect: `Number(row.peak_pss_gb)` coerces `null` to zero in the web ranking bar. All synthetic-missing conversions to 0 violate the report provenance policy; use the shared null-safe metric helper instead.
- Web and PDF refer to APP CPU/RAM utilization. Workload CPU is **WP CPU core-equivalent** (100% = one logical core), and PSS is work-process proportional-set-size RAM, not APP host RAM.
- `Observations` means saved workload rows, not executed SM37 job counts. APP `Warning Checks` represent source-backed APP host checks above configured warning thresholds, not confirmed outages. `Suggested Review` is derived from evaluation flags, not Basis-approved tuning.
- Per-APP trend points are maxima within their *reported time buckets*. Weekly uses 60-minute buckets in the inspected backend. Monthly uses six-hour buckets when the interval is 169–744 hours. Preserve actual backend label dynamically and retain precise timestamps in tooltips.
- Filesystem completeness now names the single observed host when appropriate (APP1 · 4/4) and does not claim the five-APP landscape is fully monitored by four APP1 mounts.
- PDF metadata separates **Prepared** (render instant) from **Saved snapshot** (only when `snapshot.generated_at` exists); missing metadata is labeled as retained period evidence without inventing a freshness state.
- Highest ranking bars are neutral blue; red is reserved for actual peak markers. Warning lines are explicitly warnings, not enforced system limits.

## Regression / verification

```bash
node --test scripts/tests/rundeck-monthly-presentation-semantics.test.mjs
node --test scripts/tests/rundeck-monthly-enterprise-export.test.mjs
node scripts/qa-monthly-pdf.mjs
npm run qa
```

Before deploying, confirm PR QA: monitoring browser boot, layout, monthly/weekly PDF geometry, and backend regression are all PASS. Post-deploy from an approved DEV shell, inspect Reports for Weekly 16–22 November, export 16:9 PDF/A3, check 1,078 workload scope, 4/4 mapped APP1 mounts, and verify DEV health/SHA. Do not touch PROD. Runtime SQL latency optimization remains Issue #111.

## Deliberately unchanged

- Saved CPU peak 55.5% APP2 and RAM peak 63.6% APP1, original source timestamps, workload ranks, and available storage bytes.
- One-page landscape print contract and APP1–5 ordering.
- Workload assessment logic, thresholds, SAP source collection, and SQL aggregations.
- DEV `release-dev-fast.sh` guardrails and PROD separation.

Potential follow-up: WCAG semantics and full responsive visual validation of denser candidate table; consider on a separate PR if the QA preview reveals overflow.

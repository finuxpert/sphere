# SPHERE DEV Reports — UI/UX, naming, and PDF audit
Date: 23 November 2026 (WIB)
Source evidence: operator-supplied **DEV browser screenshot** and newly generated `SPHERE-Weekly-SAP-Performance-Report-2026-11-16-16x9.pdf` for 16–22 Nov 2026. PDF properties: one page, 960×540 pt (16:9), jsPDF 4.2.1.

## Confirmed findings and resolution in this patch

| Priority | Finding | Evidence | Change |
|---|---|---|---|
| P1 | Weekly chart x-axis labels overlap (`16 Nov, 00:00`, `17 Nov, 00:00`, etc.) on DEV browser | 23 Nov DEV screenshot, both CPU and memory charts | Render compact WIB date-only ticks for reporting windows >48 hours; retain timestamps in per-sample tooltip |
| P1 | Browser header visually concatenates `SAP Performance ReportPeriod:` | 23 Nov DEV screenshot | Stack report title and reporting period with explicit spacing |
| P2 | UI and PDF title `Peak WP Memory` is ambiguous: peak ranking is based on `peak_pss_gb` | Source model `sortedPss` | Use `Peak WP Memory (PSS)`, units remain GB |
| P2 | `CPU cores` can be read as host CPU while values are work-process core-equivalents | UI formats `wpCoreEq(row.peak_cpu_pct)`; PDF `wpCpuCoreEquivalent` | Use `WP CPU` with core-equivalent explanation/tooltip; values unchanged |
| P2 | Long ABAP program identities wrap multiple lines and obscure table scanability | 23 Nov DEV screenshot | Clamp candidate name visually to two lines, preserve unabridged value as HTML title and in Detailed Evidence |
| P2 | `Export PDF` then `Download PDF` are misleading two-step controls | Original toolbar labels | Label first action **Generate** and second **Download**, include chosen format |
| P2 | Weekly export filename omits the end date and timezone | Existing export stem only included `week_start` | Include Monday–Sunday range and `WIB` in filename |
| P3 | `Highest use: /INTF · APP1 86%` colored amber via implicit >=85% check, despite no approved alert threshold | PDF source presentation | Use neutral text color; retain factual usage value and storage rows |

Expected new export: `SPHERE-Weekly-SAP-Performance-Report-2026-11-16-to-2026-11-22-WIB-16x9.pdf` (same for PNG; A3 suffix remains `-A3.pdf`). For cross-month weeks, export end remains 6 days after the week start in WIB.

## Verified unchanged from uploaded PDF

- CPU peak 55.5% at APP2, 16 Nov 2026 04:09 WIB
- RAM peak 63.6% at APP1, 19 Nov 2026 15:48 WIB
- Five ranked WP CPU workloads, five PSS memory workloads and five tuning candidates
- Five APP host rows and four collected storage categories
- Highest saved storage utilization: `/INTF · APP1` 86%, with 125.5 GB available (df)
- Source-backed ranking and SAP classifications; no inferred root causes

## Open follow-ups (not silently considered fixed)

1. **Live browser and PDF export visual QA** after DEV deployment: verify 1536px desktop, narrow/mobile and A3, and long ABAP name tooltip access. CI visual tests are necessary but not sufficient for live API/browser coverage.
2. **Single-click export UX** can be considered separately. This patch keeps the existing two-stage preview/download flow and makes labels truthful, to avoid unreviewed browser download behavior changes.
3. **Small-view report navigation:** storage may sit below the fold. Maintain normal scrolling and full source data; do not crop tables to force one-screen fit.
4. **Cold SQL latency:** prior slow evaluation and historical baseline queries are tracked in [Issue #111](https://github.com/finuxpert/sphere/issues/111); the patch changes presentation only.

## Validation

- `node --test scripts/tests/rundeck-monthly-enterprise-finish.test.mjs scripts/tests/rundeck-monthly-enterprise-export.test.mjs`
- `node scripts/qa-monthly-pdf.mjs`
- `npm run qa` plus browser/enterprise PDF visual gates
- Compare live DEV weekly summary, PDF 16:9, PNG 16:9 and PDF A3 after deployment; no source evidence differences
- Confirm DEV active commit and unchanged PROD runtime paths and services

This PR must not run database migrations, change Nginx routes, restart PROD, or reinterpret PSS as host memory.

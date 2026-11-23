# SPHERE DEV — Reports CSS maintenance (phase 3)

**Date:** 23 November 2026 (WIB) · **Scope:** DEV frontend only. PROD deployment is not authorized.

## Decision

Complete technical refactoring first, with automated regression on each PR, then run **one combined live functional, performance and visual QA cycle** on the final DEV candidate. This avoids repeatedly asking operators to download PDF/screenshot after each safe source reorganization, without relaxing CI or release guards.

## Source-preserving CSS split

The previous two Reports stylesheets contained independent V2 foundation, evidence and management styles in order-sensitive single files. This refactor **moves every original byte without modifying any selector, declaration, media query, comment, or rule order**:

| Original stylesheet | Original characters | New ordered files |
|---|---:|---|
| `RundeckMonthlyReview.css` | 27,019 | `RundeckMonthlyCore.css` + `RundeckMonthlyReview.css` |
| `RundeckMonthlyFinal20261030.css` | 21,485 | `RundeckMonthlyFinal20261030.css` + `RundeckMonthlyManagement.css` |

CSS imports are explicitly kept in the order `Core → Review → Final → Management` at the existing Reports JSX entry. Existing `RundeckUnifiedExperience20261030.css` import remains last. The CSS in PNG export remains unchanged.

`scripts/tests/rundeck-monthly-css-boundary.test.mjs` enforces the byte-exact original concatenation via lengths/FNV32 hashes and checks the import order. Include this in normal `npm run qa:integrity`.

## Non-changes

- No CSS property changes, selector deduplication, `!important` removal, theme overrides, breakpoint modifications, PDF geometry, or font size changes.
- No report API, SAP source, backend/database, query, snapshot worker, migration or production changes.
- Do not conflate a source-preserving split with a visually approved redesign. The combined DEV QA remains an explicit final gate.

## Combined final QA (deferred to the end of all approved DEV refactor phases)

Use a single final candidate SHA and verify Reports Monthly/Weekly/Custom, APP1–5 and source scope, evidence drawer, dark/light/mobile, chart/tooltip, weekly 16:9, PNG 16:9, A3, technical PDF, and data freshness; separately baseline performance and Issue #111 before any PROD review. Keep unchanged backend and PROD runtime path evidence throughout.

See [DEV-first maintenance and PROD promotion gates](DEV_FIRST_MAINTENANCE_AND_PROD_PROMOTION.md) for acceptance and rollback controls.

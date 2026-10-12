# SPHERE v1.35.4 DEV — Minimal SAP Basis / Infrastructure Operator UI

Date: 2026-10-12. Source branch: `rundeck-sphere-dev`. Environment: `/dev/`. **PROD is unchanged and promotion remains HOLD.**

## Operator request and agreed direction

Remove repeated information, excess cards/lines, unnecessary paired-content tabs and vague dashboard wording. Preserve the popup interaction model. Present closely related SAP evidence side by side for Basis/Infrastructure operators. Keep API data, source timestamps, thresholds, CPU/PSS/WP semantics, SM37 connection and stale data handling unchanged.

## Implementation

1. **One Related Events & Run History popup.** The old Correlated Events and Observation History tab-based modal variants are replaced with one two-column popup. Left: timestamped related events, time alignment and expandable source evidence. Right: actual saved run history, observation period and the six original evidence table columns; run row inspection still opens selected Job/Program and returns to the combined popup. If a job has not been selected, the Run History side explicitly prompts selection rather than synthesizing records.
2. **One SAP Checks popup.** Original SAP Availability and SAP Issues routes render together (desktop left/right). Availability retains its source timestamp, stale/partial notices, APP/HANA/Web/technical counts, HANA/SSH checks. Issues retains current indicators, search, APP filtering, attention thresholds, active incidents, source status and unconnected-SM37 message. Indicator Review/All remains a *table filter*, not a tab hiding Availability.
3. **Four unique Overview shortcuts.** Related Events & Runs; SAP Checks; Infrastructure; System Data. Duplicate Observation History / SAP Availability shortcut links to the same combined popups are removed, along with their obsolete callback props and compact status fetches. Job Performance footer similarly avoids separate links to the same combined panel.
4. **Flat visual hierarchy.** New `RundeckOperatorFlatV1354.css` is imported *last*. APPs and Infrastructure host selection use a restrained selected state; Operational Analysis becomes four lightweight text-first actions; modal subpanels, redundant nested borders, decorative card shadows and line-heavy tables are reduced. Backend states continue to own semantic green/amber/red.
5. **Operational wording.** Shorter labels: Related Events, Run History, SAP Checks, Current Issues, Needs review, Active issues, Time check, Issue time, Root cause not confirmed. Dashboard heading is `SAP Performance`. Infrastructure labels use `Current readings` and `Saved history` instead of generic prose.
6. **Safe cleanup.** Deleted the obsolete six/three-column shortcut grid selectors in the previous design-system stylesheet; removed unused React view-switch/navigation imports and duplicated overview link components. `SphereOperatorTabs` stays for the live Issues filter. No speculative removal of historical SAP data/logic or large unrelated CSS files.
7. Version changed to `v1.35.4-dev`. No schema migration or runtime/API modifications.

## Manual verification and constraints

No Playwright visual QA is required. However Vite build success and the operator screenshot check are **not yet established** in this task. On root JAHSVR-SPHERE, execute:

```bash
sphere deploy dev
```

Only after `BUILD_DEV=PASS` and `FINAL=PASS MODE=dev`, hard-refresh `https://sphere.astraotoparts.co.id/dev/` and verify the header build SHA and `v1.35.4-dev`.

Acceptance: four clear Overview destinations; two paired popups without separate content tabs; both panels usable at desktop widths; responsive stacking only for narrow widths; no duplicated titles/status summaries; actual selected run transitions work and Back/Close behave; stale availability and SM37 NOT CONNECTED not masked; APP, Infrastructure, Job and Trend detail popups still open; keyboard focus and reduced-motion support preserved.

**Do not promote to PROD** before build, manual screenshot review and explicit release approval. The pinned v1.35.0 promotion script is not valid for this release.

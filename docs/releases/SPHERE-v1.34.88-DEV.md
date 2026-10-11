# SPHERE v1.34.88 — Desktop-first DEV UI consolidation

Status: **source candidate / NOT DEPLOYED BY GITHUB**. DEV web requires guarded server release verification. PROD remains v1.34.86.

## Changes in this release
- Job / Program Performance Analysis uses exactly one Related Analysis navigation instead of duplicated grouped launchers plus a secondary row.
- Functional buttons preserve Correlated Events, Observation History, Infrastructure, SAP Issues, SAP Availability and System Data (when accessible); the buttons keep the Job navigation return stack.
- APP trace focus and selected Job host are separately labeled when they differ. No SAP data, threshold, collection timing, or Infrastructure classification is changed.
- Current Job metrics annotate CPU total (multicore), PSS (GB), I/O (MiB/s), WP (count). Saved observation samples are untouched.
- Invalid question-mark program display shows "SAP name unresolved", retaining raw program information in the underlying observation and the displayed source attribute.
- Job drawer WP table follows the outer modal desktop scroll; Infrastructure host picker and history chart are more compact while retaining all samples and direct source selectors.
- Desktop visual proof: actual browser Playwright for 1536 and 1366 widths, opening a real loaded Job row, verifying six buttons, Job → History → Back → Infrastructure → Back, bounding boxes, and saved screenshots.
- Android and 1920 viewport are intentionally **not passed** by this desktop-first release gate. Run complete responsive regression before promoting to PROD.

## Guarded DEV release
Run the SHA-pinned script on JAHSVR-SPHERE from a clean checkout of `rundeck-sphere-dev`:

`bash ops/rundeck/release-ui-dev.sh <exact-sha>`

Read-only DB revision guard `20260929_0007`; one fresh QA/build; read-only Infrastructure audit; isolated Vite preview; desktop Playwright; atomic static symlink cutover with rollback. No Nginx edits, backend restart, SAP or Rundeck job edits, migration, or change to PROD.

Source changes on GitHub are not evidence of QA/build or DEV HTTPS PASS; keep those statuses pending until the server output confirms them.

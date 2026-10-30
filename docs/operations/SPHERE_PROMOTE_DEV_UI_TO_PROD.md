# SPHERE UI promotion: DEV to PROD

> **Specialized procedure — not the default release path.** This page describes operator-approved **frontend-only** promotion. For any backend, collector, or database change, follow the maintained [Rundeck Development](rundeck-development.md) and [Operations](../../ops/rundeck/OPERATIONS.md) runbooks. Do not run this command as routine documentation cleanup.

Run `sphere promote dev-to-prod` as root on JAHSVR-SPHERE after reviewing the live DEV UI and modals.

This command targets the **currently deployed DEV frontend SHA** from `/var/www/sphere-dev/current`, *not* latest remote DEV HEAD, nor the separate production branch. It verifies the source commit, active DEV release and public HTTPS HTML; checks existing PROD API endpoints and Nginx syntax; requires an interactive `PROMOTE DEV <SHA7> TO PROD` confirmation.

An isolated copy of the exact DEV source is rebuilt with Vite production BASE `/`, deployed atomically to `/var/www/sphere.astraotoparts.co.id/releases/ui-<SHA>`, and checked against public HTML and JS. On failure after cutover, the previous PROD web symlink is restored.

Scope: frontend-only. Neither PROD API, DB, Nginx, systemd, Rundeck scheduler nor production Git branch is changed. The historical v1.35.0 one-off `promote-ui-prod-from-dev.sh` remains unchanged.

If the installed `sphere` CLI does not point at the latest repo script, run the new helper directly once after syncing DEV repository: `bash /root/rundeck-sphere-dev/ops/rundeck/promote-ui-prod-current-dev.sh`. Full QA/visual tests are **not** automatically run; approval assumes the operator has inspected the exact live DEV UI.

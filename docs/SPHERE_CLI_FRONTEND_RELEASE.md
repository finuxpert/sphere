# SPHERE CLI — frontend-only operations
Install after review (run as root on JAHSVR-SPHERE):
```bash
cd /root/rundeck-sphere-dev
git pull --ff-only origin rundeck-sphere-dev
install -m 0755 ops/rundeck/sphere-cli.sh /usr/local/bin/sphere
```
Then:
```bash
sphere deploy dev
sphere deploy prod
```
Both commands fetch/fast-forward their own branch and perform a Vite build without automated visual QA. They stage and atomically switch only the respective static web release directory, with previous-release rollback if public HTTPS does not match the new index. They do not restart services, run database migrations or edit nginx. `prod` additionally requires interactive exact `DEPLOY PROD` confirmation; it does not copy DEV files into PROD. This is not a backend deploy.

Required existing paths:
- DEV: `/root/rundeck-sphere-dev` (`rundeck-sphere-dev`) -> `/var/www/sphere-dev/current`.
- PROD: `/root/rundeck-sphere-prod` (`rundeck-sphere-prod`) -> `/var/www/sphere.astraotoparts.co.id/current`.

Important: PROD path/checkout assumptions require manual verification before its first use. Do not use `sphere deploy prod` before verifying the production checkout, nginx root, release ownership and rollback rehearsal. The command refuses if these prerequisites are not met. This workflow is for frontend-only changes; API and DB changes require the guarded full release procedure.

## Screenshot review notes (2026-10-12)
- Large unused dark area remains beneath the main cockpit. Investigate shell and content height allocation without stretching tables artificially.
- Top status/action strip is dense with truncation; regroup current health, collector health, SAP data and actions while keeping provenance and freshness.
- Jobs/Programs column labels and trend controls remain small on wide desktop; improve typography selectively, without losing operational density.
- Partial SAP data is explicitly visible; don't replace with a normal/healthy inference.
- Do not change SAP metrics, threshold semantics or SM37 authoritative execution status during UI cleanup.

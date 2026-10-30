# SPHERE v1.35.0 — operator-approved DEV → PROD frontend promotion

> **Historical release record (12 October 2026).** The pinned commit and one-off operator command below are not an instruction to promote today's DEV build. Use the [maintained runbook](rundeck-development.md) for current release decisions and separate PROD authorization.

## Scope
- Screenshot-approved DEV commit: `2bf89c756fb66b985875492c31d7c78057e37302` (2026-10-12), not the later tooling/documentation commits.
- Frontend-only promotion to `https://sphere.astraotoparts.co.id/`.
- Rebuild from that **exact commit** with Vite `base=/` and `GITHUB_SHA` set to the approved DEV SHA; copying `/dev/` assets verbatim would break production paths.
- Do not merge DEV branch into PROD branch, run migrations, deploy API/backend, run Rundeck jobs, modify Nginx or restart any service.
- The `sphere deploy prod` command is different: it uses the independent PROD checkout and is **not** the DEV→PROD promotion workflow.

## Single operator command

From root on JAHSVR-SPHERE:

```bash
cd /root/rundeck-sphere-dev && git pull --ff-only origin rundeck-sphere-dev && bash -n ops/rundeck/promote-ui-prod-from-dev.sh && install -m 0755 ops/rundeck/sphere-cli.sh /usr/local/bin/sphere && sphere promote dev-to-prod
```

The command is **not** run automatically via GitHub. After read-only preflight, operator must type `DEPLOY PROD 2bf89c7` in the terminal. It builds once for PROD and switches only the PROD web `current` symlink. If the check blocks, leave PROD unchanged and review the reason. Do not bypass the guard.

## Preflight / verification
1. Verify exact approved 40-char source SHA belongs to origin DEV and is still the live DEV release.
2. Check live DEV HTML matches its release index; read-only verification of the PROD routing config and key PROD API endpoints.
3. Require valid managed PROD release symlink, preserve the previous target, lock concurrent UI promotions and confirm intent interactively.
4. Build in an isolated temporary checkout from the reviewed SHA with production base path; verify version, SHA and root-referenced assets.
5. Stage a unique named release with a manifest, then atomically switch the PROD web symlink.
6. Compare served PROD HTML and JS bytes, verify the DEV site and API endpoints continue to work, verify DEV/PROD/legacy API symlinks and Nginx hash unchanged.
7. On error after cutover, restore previous PROD web symlink and discard the failed staged release. Keep the previous release for manual rollback if a human later notices a UI issue.

Automated browser QA is not included, per the operator's preference. This does not certify every UI/API path: backend differences between the DEV and PROD Git branches remain, and missing API routes must block production cutover. Production acceptance from web screenshots is still required.

## Rollback
On any scripted failure after cutover the previous web symlink is restored automatically. For a post-release manual rollback, identify the `ROLLBACK_WEB` path printed by the successful promotion and use the existing guarded operator rollback procedure. Do not delete PROD release directories or change PROD API symlinks.

## Expected successful output
```text
RELEASE_EVIDENCE=VERIFIED ...
API_COLLECTIONS=PASS
API_EVALUATION=PASS
API_INFRA=PASS
API_JOB_SOURCE=PASS
PROD_BUILD=PASS BASE=/ SOURCE_SHA=2bf89c756fb66b985875492c31d7c78057e37302
PUBLIC_PROD_HTML=PASS PUBLIC_JS=PASS DEV_UNCHANGED=PASS
FINAL=PASS PROD_UI=1.35.0 SOURCE_SHA=2bf89c756fb66b985875492c31d7c78057e37302 PROD_BACKEND=UNCHANGED NGINX=UNCHANGED DB_MIGRATION=SKIPPED
```

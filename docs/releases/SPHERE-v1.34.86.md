# SPHERE v1.34.86 — Final DEV review and frontend-only PROD promotion

**Review date:** 2026-10-11 (WIB)  
**Repository:** `finuxpert/sphere`  
**Host:** `JAHSVR-SPHERE`  
**Immutable QA-approved DEV source:** `5e2aed9cac67330da63044edfbe343d9b4e8f202`  
**Earlier frontend currently reported active in PROD:** `77c4022c28e8222b71d7e83ff64109b625ada982`  
**GitHub PROD branch HEAD observed 2026-10-11:** `26622547b2a9f9c2c98f5b9f985222104c218369` (branch not synchronized with finishing DEV source)

## Evidence and status (do not confuse source, DEV runtime and PROD runtime)

| Item | Status / source |
| --- | --- |
| GitHub `rundeck-sphere-dev` HEAD | Exact `5e2aed9…` confirmed via GitHub branch and commit on 2026-10-11 |
| User-provided DEV server output | `SOURCE=VERIFIED`, `DB_REV=20260929_0007`, `QA_BUILD=PASS`, `VISUAL_GEOMETRY=PASS`, `FINAL=PASS DEV_UI=1.34.86`; `SOURCE_SHA` and `ARTIFACT_SHA` both equal `5e2aed9…` |
| Prior PROD server output (user-provided) | `FINAL=PASS PROD_UI=1.34.86`, `PUBLIC_PROD_HTML=PASS`, `PUBLIC_JS=PASS`, backend and Nginx unchanged. Its frontend source was `77c4022…`, **not** the finishing SHA |
| Actual browser/manual screenshot | Not independently captured in this documentation review; server Playwright visual-geometry PASS is not a claim of pixel-perfect manual verification |
| Fresh server checks after finishing promotion | **PENDING**; do not mark PROD public HTTPS, API and rollback PASS until the production promotion script prints its evidence |

The DEV finishing source is **two commits ahead** of `77c4022…`. GitHub diff covers only `RundeckMonitoringHistory.jsx`, `RundeckServerTrend.jsx`, `RundeckUnifiedModalPolish.css`, and `scripts/qa-basis-investigation.mjs`. The final commit changes navigation/back labels only. The previous finishing commit removes the unused Analysis Menu; avoids repeating the chart metric as a Y-axis title beside the APP trace selector; reduces repeated modal headings; and adjusts QA contract expectations. No backend/schema/routing change is present in this two-commit diff.

The six direct analysis cards, related modal navigation, SAP Issues `Needs review` / `All indicators`, separate SM37 evidence, source freshness and evidence semantics remain intact. No new UI change was justified by source review. Do not infer that a correlation establishes root cause, or that missing availability observation means DOWN.

## Diverged GitHub branches

On 2026-10-11, comparing `rundeck-sphere-prod...5e2aed9…` returned `diverged` with **221 commits ahead** and **64 behind** from the PROD base. Do not reset PROD to DEV, force-merge, cherry-pick all commits, or rewrite PROD-only deployment/routing/service files. This release uses an **immutable frontend-only artifact** built from DEV source; it does **not** synchronize Git history. The `rundeck-sphere-prod` branch remains unsynchronized intentionally.

The documentation updates are staged on `docs/sphere-v13486-final-release-20261011` and must not be merged into DEV **before** promotion, because the promotion script requires that `/root/rundeck-sphere-dev` HEAD exactly equals the QA-approved `5e2aed9…`. A docs-only merge can occur after successful PROD verification without claiming new runtime source parity.

## Go/no-go and single server command

**Decision: READY to run guarded server-side promotion, conditioned on the promotion script's live preflight checks.** QA and visual-geometry PASS are taken from the supplied server release output, not independently repeated here. The script stops safely when evidence is missing or the active DEV SHA, log contents, symlinks, credentials/environment or PROD API baseline is unsuitable.

Run **only on JAHSVR-SPHERE as root**, with the DEV checkout still clean and at exact HEAD:

```bash
cd /root/rundeck-sphere-dev && bash ops/rundeck/promote-ui-prod-from-dev.sh 5e2aed9cac67330da63044edfbe343d9b4e8f202
```

This existing helper:

1. Locks promotion; requires exact clean DEV HEAD and v1.34.86 source.
2. Reuses SHA-tied, on-server DEV QA and Playwright evidence without running full QA again; checks active DEV `/dev/` release.
3. Verifies production API read-only health and Nginx syntax without modifying Nginx.
4. Builds a separate archived source tree under `/tmp/` with PROD Vite `base=/`.
5. Retains the **previous** PROD web release and prints `BACKUP=RETAINED_PREVIOUS_PROD_WEB PATH=...`.
6. Atomically switches only `/var/www/sphere.astraotoparts.co.id/current`.
7. Verifies public PROD HTML and hashed JS against release bytes; checks DEV HTML parity and key PROD APIs.
8. Automatically restores the prior PROD web symlink if post-switch verification fails.

No DB migration, backend/service restart, SAP job, Rundeck credential/token update, PROD Git checkout edit, or Nginx reload is authorized.

## Rollback

- PROD web symlink: `/var/www/sphere.astraotoparts.co.id/current`
- Retained release directory: `/var/www/sphere.astraotoparts.co.id/releases/`
- Exact previous release: **obtain from live promotion output** `BACKUP=RETAINED_PREVIOUS_PROD_WEB PATH=...` / `ROLLBACK_WEB=...`. Do not guess its timestamp or directory name.
- The script restores that symlink on failure *after* cutover. On manual incident review, use the actual captured previous path and approved operational procedure; do not delete backups prematurely.
- DEV web path: `/var/www/sphere-dev/current`, must remain unchanged.

## Release-completion log template — fill only from real server output

```ini
DEV_FINAL=PASS              # from prior user-supplied source/QA evidence
PROD_UI=1.34.86             # previously deployed; new finishing source pending
PROD_SOURCE_SHA=PENDING     # expected 5e2aed9cac67330da63044edfbe343d9b4e8f202
PUBLIC_HTTPS=PENDING
ROLLBACK=AVAILABLE          # script retention policy; actual previous path pending
API=UNCHANGED              # must verify before/after on server
DATABASE=UNCHANGED         # migration never invoked; server revision last supplied 20260929_0007
NGINX=UNCHANGED            # verify Nginx hash after promotion
DOCUMENTATION=STAGED       # docs branch; merge intentionally deferred
```

The script's real final line is authoritative, e.g. `FINAL=PASS PROD_UI=1.34.86 SOURCE_SHA=<exact-sha> PROD_BACKEND=UNCHANGED NGINX=UNCHANGED DB_MIGRATION=SKIPPED ROLLBACK_WEB=<path>`. Do not fill PASS for unobserved post-cutover checks.

## Supporting operational documents

- `ops/rundeck/OPERATIONS.md`: platform operations, release guards, Rundeck auth and data-quality runbooks.
- `docs/rundeck-development.md`: runtime topology and investigation semantics.
- `docs/VISUAL-QA.md`: manual and Playwright viewport checks. Prior version-specific sections are retained as historical regression notes, **not current deploy status**.
- `docs/CURRENT-FLOW-AND-FEATURES.md`: current operator flow. Past candidate sections are historical records.

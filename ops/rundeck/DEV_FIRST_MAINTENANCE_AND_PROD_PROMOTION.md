# SPHERE — DEV-first maintenance and PROD promotion gates

**Decision date:** 23 November 2026 (WIB)  
**Current phase:** **DEV MAINTENANCE / VALIDATION**  
**PROD promotion:** **NOT APPROVED**. This document is planning and operational guidance, not permission to update PROD.

## 1. Environment and change boundary

| Field | DEV | PROD |
|---|---|---|
| Branch | `rundeck-sphere-dev` | `rundeck-sphere-prod` |
| Site | `https://sphere.astraotoparts.co.id/dev/` | `https://sphere.astraotoparts.co.id/` |
| API | `127.0.0.1:8091` | `127.0.0.1:8092` |
| API release | `/opt/sphere-rundeck-dev/current` | `/opt/sphere-rundeck-prod/current` |
| Web release | `/var/www/sphere-dev/current` | `/var/www/sphere.astraotoparts.co.id/current` |

Only DEV code, docs, tests, and **approved DEV-only** runtime configuration may be maintained during this phase. PROD code, branch, processes, Nginx routes, credentials, timers, database migration state and public root-path assets must remain unchanged. Do not use DEV artifacts directly in PROD.

## 2. Last operator-evidenced state — 23 Nov 2026

**Source/CI and active runtime are different states** and must be measured separately.

- **GitHub `rundeck-sphere-dev` HEAD:** `599c21a121e06de2118d6371df74c98743919852` (PR #113: report semantics and PDF provenance). GitHub workflow completed successfully and prepared the artifact.
- **Last *verified* active DEV API and web:** both `81c85e62b04fd2c8d34c2b370d07d8dfbe87dc6b` following the failed full-stack attempt. DEV `sphere-rundeck-api.service` remained `active` and `/health` returned HTTP 200 in ~0.85 s.
- **Full-stack DEV release attempt at HEAD:** `SOURCE=PASS`, `QA=PASS BUILD=PASS`, `BACKEND_TESTS=PASS`, but `FINAL=FAIL STAGE=DEPLOY EXIT=28`. Release script rolled DEV API/web back to `81c85e62`.
- **The specific blocker:** `PROD_COLLECTIONS` cross-environment read-only smoke timed out twice (`curl: (28)`, 15 s each, HTTP 000). Other observed steps passed: DEV 1d cold evaluation HTTP 200 in ~20.74 s, DEV web, collections, metrics, watchdog, network and custom-window smoke.
- **Subsequent *single* read-only PROD retest:** `127.0.0.1:8092/collections/latest` HTTP 200 in ~7.16 s; Nginx `/api/collections/latest` HTTP 200 in ~1.14 s. This is **not proof that intermittent PROD latency is fixed**.
- A **DEV UI-only release** was proposed for the front-end-only commit, but **no successful UI-only deployment output has yet been provided**. Do not declare `599c21a1` live until the web release symlink, page asset SHA and actual `/dev/` UI are verified.

The cross-environment smoke is a safety guard. **Do not disable it, hard-code success, increase timeout to disguise latency, change PROD, or force a symlink to make DEV release pass.** A failing PROD probe warrants investigation, not a bypass.

## 3. DEV maintenance workstreams

| Workstream | Acceptance evidence |
|---|---|
| Functional Reports | Weekly/Monthly/Custom periods load via `/dev/`; scope matches saved evidence; no empty loading states or false status |
| Data semantics | Missing WP PSS stays missing (not `0 GB`), host CPU/RAM distinguished from WP CPU core-equivalent and WP PSS; `Observations` does not imply SM37 executions |
| UI/UX | Chart axis and actual interval understandable; ABBP program names accessible; warning counts and review reasons have explanations; desktop/mobile dark/light views readable |
| PDF/PNG | Weekly 16:9 PDF (960×540 pt), PNG, A3 and custom periods export correctly, without clipped columns/labels, invented values or changed rankings |
| Data freshness | Snapshot `FRESH` only if backed by actual snapshot metadata; stale/missing evidence clearly disclosed; date and timezone WIB consistent |
| Storage | Filesystem scope names actual hosts (currently 4/4 mapped mounts on APP1 in sample); `df` available capacity is source-reported; no 5-host coverage claim |
| Performance/reliability | Compare sequential DEV-only p50/p95 with recorded baseline, monitor cold 1d evaluation SQL, snapshot timer, proxy errors and any 504; track slow SQL under [Issue #111](https://github.com/finuxpert/sphere/issues/111) |
| Safety | Release is rollback-capable, no migration without separate approval, PROD pointers and health unchanged; failing PROD cross-smoke is an explicit blocker |

**Historical validation fixture:** weekly **16–22 November 2026 WIB**, 1,078 workloads and 4/4 APP1 filesystem categories at the observed source anchor. These values are **not permanent global expectations**; when new READY collections arrive, compare to the corresponding source anchor and selected report scope rather than asserting a frozen count.

## 4. Deployment decision tree (DEV only)

1. **Before any deploy:** check PR QA, exact source SHA, deployment diff and migration paths. Confirm server access and isolate DEV changes.
2. **Frontend/PDF/CSS-only change:** prefer the maintained UI-only script, which **still checks PROD route health** but does not restart DEV backend, pollers or run DB migrations. Run *only* when exact source and unmodified worktree are verified and PROD cross-smoke is healthy:
   ```bash
   cd /root/rundeck-sphere-dev
   test -z "$(git status --porcelain)"
   git rev-parse HEAD
   bash ops/rundeck/release-ui-dev.sh "$(git rev-parse HEAD)"
   ```
3. **Backend, API, or mixed change:** use the guarded `release-dev-fast.sh` flow only after migration diff review; do not use `SPHERE_DEV_MIGRATION_DECISION=skip` for a migration that requires execution.
4. **If any deploy step fails:** inspect `/tmp/sphere-dev-release-last.log` (full stack) or UI-only QA output, confirm rollback and both DEV services, investigate the exact `SMOKE_FAIL label`. Do not loop release attempts or bypass QA/timeouts.
5. **After an actual successful deploy:** validate DEV API/web paths, `/dev/` browser (hard refresh), matching SHA in `dist/assets`, web/PDF exports, and unchanged PROD paths. CI or a GitHub merge alone is never the active runtime.

Read-only checkpoint commands:
```bash
echo "SOURCE_SHA=$(git -C /root/rundeck-sphere-dev rev-parse HEAD)"
echo "DEV_API=$(readlink -f /opt/sphere-rundeck-dev/current)"
echo "DEV_WEB=$(readlink -f /var/www/sphere-dev/current)"
systemctl is-active sphere-rundeck-api.service
curl --noproxy '*' -sS --max-time 10 -o /dev/null \
  -w 'DEV_HEALTH_HTTP=%{http_code} TIME=%{time_total}s\n' \
  http://127.0.0.1:8091/health
```

## 5. PROD promotion eligibility — ALL gates must pass

- [ ] **DEV release proven active:** exact SHA verified for web and (if changed) API, with release guard `FINAL=PASS`.
- [ ] **End-to-end functional QA:** SAP Monitoring, Reports, Jobs & Programs, Data Collection, navigation, auth and source errors work in the active DEV runtime.
- [ ] **Report accuracy:** Weekly, Monthly and Custom browser values match source-backed PDF/PNG/A3; 1,078-workload/4-of-4 historical fixture reconciles with its recorded anchor; missing/stale/zero classifications are correct.
- [ ] **Visual QA:** reviewed captures for 1536×864 desktop, narrow/mobile, light/dark; no unacceptable overflow, collisions, or inaccessible ABAP identifiers; 16:9 and A3 report labels readable.
- [ ] **Performance QA:** sequential DEV p50/p95 recorded and compared with approved budget, relevant cold path measured, no recurring unexplained 504; Issue #111 risk assessed and accepted or resolved with evidence.
- [ ] **Reliability/stability:** repeated DEV checks at separate times show consistent healthy service, refresh timer/snapshot, and no unresolved P1/P2 release-blocking defects. Record the observation window and results rather than claiming uptime from one successful probe.
- [ ] **Security/operations:** code diff, credential safety, dependency and migration impact, backup/rollback, logging, access control and Nginx isolation assessed; independent PROD cross-smoke works within the approved release contract.
- [ ] **Sign-off and change approval:** SAP Basis owner, relevant functional/report stakeholders and PROD change approver explicitly approve promotion with a maintenance window, rollback owner and success criteria.
- [ ] **Separate PROD PR/release:** update `rundeck-sphere-prod` through approved review; resolve PROD-only paths, Vite base, configuration, dependencies and migration differences. Execute the **guarded PROD-specific** deployment only during the approved change. **Never automatically sync DEV to PROD or run a DEV command against PROD.**

**If any box is unchecked, the status remains `DEV MAINTENANCE`; there is no implied PROD release date.** Approval to maintain DEV is not approval to modify PROD.

## 6. Decision log

| Date (WIB) | Event | Decision |
|---|---|---|
| 23 Nov 2026 | PR #113 source/QA PASS, DEV full deploy failed on intermittent read-only `PROD_COLLECTIONS` smoke | Keep DEV rollback; diagnose without altering PROD |
| 23 Nov 2026 | PROD one-off retest HTTP 200; persistence not confirmed | Avoid full-stack retry until smoke reliability is understood; UI-only DEV release may be considered with existing guards |
| 23 Nov 2026 | Operator chooses DEV maintenance first; PROD only after validated readiness | **PROD promotion on hold; use this gate checklist** |

See [DEV development runbook](../../docs/operations/rundeck-development.md), [report UI/UX audit](REPORT_UI_UX_BUG_AUDIT_20261123.md), [report semantic audit](REPORT_SEMANTICS_AUDIT_20261123.md), and [performance issue #111](https://github.com/finuxpert/sphere/issues/111).

## 7. DEV cleanup batch checkpoint — 23 Nov 2026 (WIB)

**Operator decision:** Finish approved DEV code/structure maintenance first, and perform **one consolidated manual/live functional + visual QA** after the technical cleanup batch is genuinely ready. GitHub PR **automated** QA/build/parity remains mandatory on every change and is **not deferred**.

| Workstream | GitHub code state | Runtime / next action |
|---|---|---|
| Reports presentation, PR #115 | Merged `6fdaf4f1`; PR CI PASS | DEV UI-only deployed and operator confirmed |
| Reports evidence/header/exports, PR #116 | Merged `5978b757`; PR CI + release PASS | DEV UI-only deployed: `FINAL=PASS MODE=DEV_UI_ONLY`; backend unchanged |
| Pure WIB reporting dates, PR #118 | Merged `9d36862c`; 3 PR workflows PASS | **Not deployed** on DEV backend; future guarded full-stack release only |
| Pure evaluation pagination/review helpers, PR #119 | Merged `56c473ae`; 3 PR workflows PASS | **Not deployed** on DEV backend; future guarded full-stack release only |
| Reports CSS source split, PR #117 | **Closed, never merged** | Bundle regression (27,984 then 43,416 bytes vs 20,000 budget). Retain previously approved CSS; do not inflate budget |
| Cold SQL workload / performance, Issue #111 | Open engineering work | Profile DEV read-only; optimize with measured plans and parity; no guessed indexes or timeouts |

**Latest operator-proven DEV web SHA:** `5978b757`, deployed UI-only. **Latest GitHub DEV source after backend extraction:** `56c473ae`. These differ legitimately. A GitHub merge never proves runtime activation. The DEV backend and PROD remain unchanged by the operator's last UI-only release.

### One final operator QA gate (only after all approved code maintenance)

1. Review and fix remaining release-blocking issues, including CSS bundle regression or explicitly defer CSS scope without claiming it is finished.
2. Inspect the cumulative DEV backend/frontend diff and migrations. Use the maintained **guarded full-stack DEV** release for the source that includes backend refactors; **never** use UI-only for a Python backend change.
3. Record exact active DEV API and web SHA, runtime health and unaffected PROD release identity; keep mandatory PROD cross-environment smoke and automatic rollback.
4. Once the final DEV candidate is active, run a single coordinated manual QA cycle: Monthly/Weekly/Custom, 16–22 Nov saved reference, APP1–5, ABAP/PSS/CPU semantics, source freshness, Detailed Evidence, PDF 16:9/PNG/A3, dark/light/mobile, frontend console/network and report performance/stability.
5. Remain in `DEV MAINTENANCE` until open P1/P2, performance risks, and release guard evidence are assessed. **PROD promotion requires separate approval, PR, rollback owner and maintenance window.**

This policy changes only the **cadence of operator QA**; it does **not** waive CI, rollback, source provenance or performance budgets.

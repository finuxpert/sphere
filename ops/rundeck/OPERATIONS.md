# SPHERE Rundeck Operations

This runbook covers the active Rundeck-integrated DEV and PROD runtimes.

## Release flow

```text
rundeck-sphere-dev
    ↓ npm QA + DEV readiness
    ↓ approved promotion
rundeck-sphere-prod
    ↓ production build
    ↓ transactional deploy
https://sphere.astraotoparts.co.id
```

Never force-reset PROD to DEV.

When branches diverge, preserve PROD-only deployment/routing/service files.

## Runtime topology: DEV and PROD share one host

Both active Rundeck environments run on `JAHSVR-SPHERE`:

| Environment | Checkout | Branch | URL | API |
|---|---|---|---|---|
| DEV | `/root/rundeck-sphere-dev` | `rundeck-sphere-dev` | `/dev/` | `8091` |
| PROD | `/root/rundeck-sphere-prod` | `rundeck-sphere-prod` | `/` | `8092` |

They are isolated by separate checkout, release directories, current symlinks, API service/port, and managed Nginx routing blocks. Deployment is performed locally on this same host.

The deployment host does **not** promote branches. Promotion is completed first; deployment then fetches and resets the matching checkout to its approved remote branch.

## DEV validation and deployment

Canonical DEV command:

```bash
cd /root/rundeck-sphere-dev && \
git fetch origin && \
git reset --hard origin/rundeck-sphere-dev && \
bash ops/rundeck/qa-build-dev.sh && \
bash ops/rundeck/prod-readiness-check.sh && \
bash ops/rundeck/deploy-dev.sh
```

The sequence intentionally keeps the checkout on `rundeck-sphere-dev`. `qa-build-dev.sh` runs lint/Basis contract QA/build, readiness validates backend/watchdog/platform health, and `deploy-dev.sh` transactionally activates only the DEV runtime while verifying PROD remains unchanged.

Expected readiness marker:

```text
SPHERE PROD READINESS PASS
```

`deploy-dev.sh` performs transactional activation and rolls back on failed smoke checks.

## Production build/deploy

After approved promotion:

```bash
cd /root/rundeck-sphere-prod
git fetch origin
git reset --hard origin/rundeck-sphere-prod
npm run build
bash ops/rundeck/deploy-prod.sh
```

Expected final marker:

```text
PRODUCTION DEPLOY SUCCESS
REVISION <prod-sha>
```

## Vite base-path guard

Frontend base is branch-aware:

- DEV → `/dev/`
- PROD → `/`

Before production activation, `deploy-prod.sh` requires `dist/index.html` to reference `/assets/` and blocks if `/dev/assets/` is still present.

This guard is intentional and must not be removed.

## Transactional PROD checks

Production deployment validates:

- clean PROD checkout;
- local HEAD equals `origin/rundeck-sphere-prod`;
- root asset path;
- Nginx syntax;
- local Rundeck API health;
- legacy `/api/health`;
- legacy `/sap-api/health`;
- Rundeck collections;
- evaluation endpoint;
- infrastructure hosts;
- Prometheus metrics;
- watchdog events;
- SAP job source;
- platform readiness;
- production web bundle;
- DEV web isolation;
- legacy API unchanged;
- DEV API unchanged;
- DEV web unchanged.

Failure after activation triggers rollback to previous web/API symlinks and Nginx configuration.

## Production runtime paths

- API releases: `/opt/sphere-rundeck-prod/releases`
- current API: `/opt/sphere-rundeck-prod/current`
- web releases: `/var/www/sphere.astraotoparts.co.id/releases`
- current web: `/var/www/sphere.astraotoparts.co.id/current`
- service: `sphere-rundeck-prod-api.service`
- API port: `8092`

DEV:

- current API: `/opt/sphere-rundeck-dev/current`
- current web: `/var/www/sphere-dev/current`
- API port: `8091`

## Platform readiness

Current valid readiness includes:

- workload history: READY;
- baseline/correlation features: READY;
- SM37: READY or NOT_CONFIGURED;
- job monitor: READY or WAITING_FOR_SM37_FEED.

SM37 not configured is not a release failure while the authoritative feed is intentionally absent.

## QA output triage

For a concise DEV contract result while preserving the full log:

```bash
cd /root/rundeck-sphere-dev
git fetch origin
git reset --hard origin/rundeck-sphere-dev
npm run qa 2>&1 | tee /tmp/sphere-qa.log
grep -n '^FAIL ' /tmp/sphere-qa.log || echo 'No FAIL checks found'
```

Do not treat the absence of a `FAIL` line as a successful run if npm/build exited non-zero for another reason; review the command exit status and the tail of the QA log.

## Evaluation performance

Performance Review is cached per committed collection anchor.

Repeated requests for the same period/filter/limit and the same committed collection reuse the cached evaluation result.

A new committed collection invalidates the effective cache key and triggers recomputation.

## Collector/watchdog

Collector, watchdog, and data freshness are separate operational states.

Prometheus-compatible metrics include collection age and watchdog state.

Do not interpret collector RUNNING as Performance READY.

## Infrastructure history

Infrastructure trend API exposes retained coverage boundaries.

If source storage `util_pct` exceeds 100, retain the raw source value and flag it for verification. Do not silently clamp it.

Filesystem Capacity and Storage I/O Activity are separate evidence planes.

## Historical trend contract

Long-range Server Trend is bucketed.

For Peak mode, preserve:

- bucket;
- peak timestamp;
- peak value;
- peak collection ID.

Trend Details must load workloads from the exact peak collection.

## WP/Trace evidence

Per-process/WP evidence may include CPU signal, Error at Snapshot, Latest Trace Error, error recency, counters, and log path.

`Latest Trace Error` may be historical. The operator UI labels retained values as AT SNAPSHOT or HISTORICAL.

Selected-workload APP Critical WP keeps observed zero separate from missing/not-retained evidence.

SM37 remains the authoritative execution-status source.

## PDF quick report

The one-page report is intended for fast operational handoff.

It must preserve:

- selected collection/run identity;
- selected workload identity;
- observed-zero versus Not observed semantics;
- explicit Performance and Availability source times;
- report-level ALIGNED/PARTIAL timing state;
- plain wording that does not turn time correlation into a root-cause verdict.

## Release troubleshooting

Useful checks:

```bash
git status
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

PROD route validation:

```bash
bash ops/rundeck/smoke-prod-routes.sh https://sphere.astraotoparts.co.id
```

DEV health examples:

```bash
curl -fsS https://sphere.astraotoparts.co.id/dev/api/health
curl -fsS https://sphere.astraotoparts.co.id/dev/api/platform/health
curl -fsS 'https://sphere.astraotoparts.co.id/dev/api/evaluation/workloads?period=1d&type=ALL&limit=5'
```

A Vite chunk-size warning is informational unless the build exits non-zero.

Treat failed QA, readiness, Nginx validation, API smoke tests, route isolation, or transactional deploy checks as release blockers.

## Credentials

Never place Rundeck tokens, SAP credentials, passwords, private keys, or raw SAP logs in Git.

Reader and runner credentials remain server-side only.

Keep `RUNDECK_COLLECT_NOW_ENABLED=false` unless authenticated user identity and explicit authorization are enforced for the mutating route.

## Retention

Raw evidence and PostgreSQL monitoring history follow configured retention settings.

Do not delete retained raw evidence as a database-repair shortcut.

The deploy/runtime release cleanup retains a bounded rollback window.


## Infrastructure freshness / filesystem mismatch (v1.34.75 DEV)

The AOP PROD infrastructure source is read-only to SAP. The SPHERE DEV UI refreshes its Infrastructure host, filesystem, network and storage requests every 60 seconds; it never runs an SAP command directly. Snapshot age exceeds 15 minutes: show `STALE`; timestamp missing/invalid or more than 60 seconds in the future: show `UNKNOWN`. In both cases preserve original values as last-observed evidence, and suppress current capacity/network/I/O severity classifications. The modal and main cockpit must agree.

A mismatch like SPHERE's 7-hour-old `/INTF 92%` versus a manually executed `df -h /INTF` reporting `88%` cannot be resolved by changing CSS/percentage math. Compare host identity, the collector `snapshot_ts`, execution ID, poller status and the time of the SAP command. Do not overwrite saved evidence or substitute the manual 88% as an automated sample.

Read-only diagnosis on `JAHSVR-SPHERE`:

```bash
systemctl list-timers --all 'sphere-rundeck-infra*' --no-pager
systemctl show sphere-rundeck-infra-aop-prod-test.service -p ActiveState -p Result -p ExecMainStatus
journalctl -u sphere-rundeck-infra-aop-prod-test.service -n 40 --no-pager
cat /var/lib/sphere/infra-ingestion/poller-aop-prod.json
curl --noproxy '*' -fsS http://127.0.0.1:8091/infra/latest?source=aop-prod
curl --noproxy '*' -fsS http://127.0.0.1:8091/infra/filesystems?host=AOPH1PAPPDC
```

Infrastructure collection and ingestion are independent: timer `sphere-rundeck-infra-aop-prod-test.timer` is configured every five minutes; the Rundeck job itself must execute successfully and produce a new timestamp for each expected host. A successful UI build does not restart or repair that external collection pipeline.

DEV source validation now includes `node --test scripts/tests/infrastructure-freshness.test.mjs` via `npm run qa`. Standard transactional DEV build/deploy:

```bash
cd /root/rundeck-sphere-dev
git fetch origin rundeck-sphere-dev
git switch rundeck-sphere-dev
git reset --hard origin/rundeck-sphere-dev
bash ops/rundeck/qa-build-dev.sh && bash ops/rundeck/prod-readiness-check.sh && bash ops/rundeck/deploy-dev.sh
```

Perform the reset only if this checkout has no unpublished local work; otherwise reconcile that work first. No changes to `rundeck-sphere-prod`, `sphere-prod` or the SAP host are part of this update.

Infrastructure freshness also verifies per-sample `collected_at` and `collection_id` against the selected host's latest READY collection. Mixed or missing identities become `UNKNOWN` instead of combining unrelated snapshots. A stale sample remains `STALE` even when a newer host record exists.

## DEV v1.34.76 filesystem QA and motion

If the older DEV checkout prints `FAIL Infrastructure filesystem NORMAL state is explicit`, fetch `rundeck-sphere-dev` again and verify `src/app/version.js` is `1.34.76`. The contract asserts `observedStatus(statusFs(row.used_pct))` and rejects the old hidden-NORMAL placeholder. This is a QA-contract fix, **not** permission to label stale disk readings as current NORMAL. `npm run qa` also validates that the scoped motion CSS supports `prefers-reduced-motion`, avoids perpetual animations and leaves telemetry collection untouched.

Motion CSS affects the client's first-render and hover transitions only. ECharts CPU/RAM and technical graphs animate on mount with a short duration and disable their animation when the user prefers reduced motion. Neither this change nor browser refreshes repair a stalled collector. Continue with the standard guarded DEV-only QA, readiness and transactional deploy sequence above. No PROD deployment is part of this update.

## Watchdog ERROR during DEV readiness (read-only diagnosis)

A successful `npm run qa`/Vite build does **not** imply the currently deployed DEV watchdog is healthy. `ops/rundeck/prod-readiness-check.sh` intentionally blocks on the existing DEV API's `watchdog_status=ERROR` and does not activate the new release. The warning about oversized Rollup chunks is not the blocker.

The watchdog is a periodic oneshot service (normally every 120 seconds). Its `watchdog.json` records a status, timestamp and exception class; the service journal carries the underlying trace. A stale `ERROR` can reflect Rundeck connectivity, authentication, execution API errors, permission problems or timeouts. Do not assume which one without server evidence, and **do not** disable the guard or change auto-abort settings to force a deploy.

After fetching the latest `rundeck-sphere-dev` source, run this nonmutating diagnostic on `JAHSVR-SPHERE`:

```bash
cd /root/rundeck-sphere-dev
for script in ops/rundeck/diagnose-watchdog-dev.sh ops/rundeck/smoke-watchdog-dev.sh ops/rundeck/prod-readiness-check.sh; do bash -n "$script" || exit 1; done
bash ops/rundeck/diagnose-watchdog-dev.sh
```

It prints only allowlisted watchdog/poller state, service/timer summaries and exception **class names**, not raw environment files, tokens or complete journal text. The readiness script now automatically runs the same diagnostics when the watchdog smoke fails, then exits nonzero. It does not start/stop a systemd service, abort executions, modify SAP/Rundeck or claim a recovery. Detailed runtime investigation is required if `ERROR` persists.

Once the watchdog's underlying issue is fixed and the current DEV API reports `NORMAL` or `RECOVERED` with fresh collection and auto-healing enabled, rerun the usual guarded readiness check and DEV deployment. Keep PROD untouched.

## Rundeck reader API returns HTTP 403 (DEV)

If both `sphere-rundeck-watchdog.service` and `sphere-rundeck-poller.service` show `HTTPError`, and the watchdog journal records `HTTP Error 403`, do **not** bypass readiness or rotate credentials blindly. Both services use the same `rundeck-reader` systemd credential loaded from `/etc/sphere/rundeck-readonly.token`, but query different read-only API endpoints on `http://10.14.55.205:4440` (Rundeck API v44). A 403 may mean token expiry/revocation, permissions on the project/executions, or an endpoint-specific policy. It does not by itself confirm which.

Run the repository probe **on JAHSVR-SPHERE as root** to read the existing credential without printing it. This is separate from the deployed service, so no backend release or restart is needed:

```bash
cd /root/rundeck-sphere-dev
git fetch origin rundeck-sphere-dev
git merge --ff-only origin/rundeck-sphere-dev
python3 -m unittest backend.tests.test_rundeck_auth_diagnostic
PYTHONDONTWRITEBYTECODE=1 python3 ops/rundeck/diagnose-rundeck-auth-dev.py
```

The probe only calls three GET endpoints, with redirects prohibited: `system/info`, the same filtered `project/.../executions` list the poller uses, and the filtered `project/.../executions/running` endpoint used by the watchdog. It emits only HTTP statuses, credential-present state and whether config is present; never copy actual tokens or the Rundeck environment file into chat, tickets or GitHub.

Interpretation: HTTP 200 for the system endpoint but 403 for both execution endpoints strongly suggests project/execution authorization; HTTP 403 for all endpoints could indicate a revoked/expired token **or** broader access restrictions. If only `executions/running` fails, inspect the scope for listing running executions. Confirm the intended Rundeck service-account identity, token validity and minimum project/job/execution *read* ACL with the Rundeck administrator; do not grant runner/abort/execute privileges to the read-only token. Only after that is corrected and collector data becomes fresh should DEV readiness/deployment be retried.

The `backend.tests.test_rundeck_auth_diagnostic` tests are offline and run as part of DEV readiness. Never run PROD deployment to solve this DEV-only problem.


## SPHERE monitoring token ownership and 30-day rotation

**Operator decision (2026-10-10):** Keep the Rundeck monitoring API token short-lived (30 days), separate read-only access from administrative maintenance, and restrict the maintenance role to the designated system owner. This is an access-control requirement, **not** a claim that existing Rundeck users/ACL are already compliant.

### Generate the monitoring reader token

In Rundeck **User API Tokens → + Generate New Token**, use:

| Field | Value |
| --- | --- |
| Name | `SPHERE Read Only - Monitoring` |
| User | `sphere_api` (the existing dedicated service account) |
| Roles | `sphere_reader` only |
| Expiration in | `0` |
| Unit | `Minutes` |

The Rundeck form observed on 2026-10-10 explicitly says **"Set to zero for maximum allowed duration. (30d)"**. Thus `0` here means **the server's configured 30-day maximum**, NOT unlimited. Verify the resulting expiry date after creation. If User remains `admin`, is not editable, or the issued token grants inherited admin roles, **stop**; obtain an appropriately scoped token for `sphere_api` instead. Never generate this reader token with blank roles under an `admin` account.

The monitoring reader must have only the minimum project/job/execution read rights needed by `backend/rundeck_poller.py` and `backend/rundeck_watchdog.py`. It must not be allowed to run jobs, abort executions, administer Rundeck, modify ACL, or change project settings. API-token `Roles` do not grant permissions independently of Rundeck's actual ACL policies; confirm effective `sphere_reader` permissions with a read-only API smoke test.

### Maintenance ownership and separation of privileges

The **designated SPHERE maintainer** is the only person authorized to rotate credentials, administer Rundeck access for SPHERE, change related configuration or run manual recovery/deploy operations. Enforce this with individual named accounts, restricted admin/ACL roles, server sudo/file permissions and auditing; writing a policy here does **not** technically revoke privileges from other administrators. Review actual Rundeck groups/ACLs and server access before asserting exclusivity. Do not expose or share the maintainer's privileged API token.

Keep the existing `SPHERE DEV Runner` credential **separate** from `sphere_reader`. Its screenshot showed admin-level roles; audit whether they exceed the minimum needed for the approved job operations and remove excessive rights via a planned, separately tested change. Watchdog auto-abort may use the runner for a controlled recovery; do not remove or replace that credential blindly. Reader token rotation must not modify the runner credential, watchdog auto-abort setting, PROD services, SAP hosts or job definitions.

### Reader rotation checklist (every 30 days)

1. **D-7**: owner checks the expiring token and prepares a replacement; **D-3**: owner confirms maintenance window and access. Keep an expiry-date reminder; do not rely on a perpetual token.
2. Issue `sphere_api` / `sphere_reader` token with the fields above. Verify issued account, effective roles and expiry date. Keep the secret in an approved credential vault only; never in GitHub, chat, shell history, command output, CI logs or documentation.
3. On `JAHSVR-SPHERE`, confirm which services reference `/etc/sphere/rundeck-readonly.token` before updating it. At the 2026-10-10 inspection, `sphere-rundeck-poller.service`, `sphere-rundeck-watchdog.service`, `sphere-rundeck-infra-poller.service` and `sphere-rundeck-infra-aop-prod-test.service` referenced that file; verify live server configuration each time. Do not assume anything named `aop-prod-test` is the SPHERE PROD runtime.
4. Test the new reader token against the required **GET-only** Rundeck endpoints **before** replacing the old credential. Securely back up the existing credential (mode `0600`), rotate the file atomically (mode `0600`, owner `root:root`), and do not paste the token in a command line. Remember that systemd `LoadCredential` takes a per-service snapshot when a oneshot starts.
5. Wait for normal systemd timer invocations; verify both poller and watchdog return to healthy state and SPHERE's latest READY collection becomes fresh. **Do not manually start the watchdog while auto-abort is enabled**, unless the designated maintainer has inspected the running execution and explicitly approved it.
6. Revoke the replaced token after the new credential is verified. Record only the nonsecret token label, expiry date, owner role, verification date and outcome. Rerun guarded DEV readiness and deploy only after all checks pass.

**Incident record (2026-10-10):** Existing token `SPHERE Read Only`, account `sphere_api`, role `sphere_reader`, expired **2026-10-10 14:50:34 WIB**. The SPHERE DEV watchdog and poller logged `HTTPError`, with watchdog HTTP 403; a GET-only probe returned HTTP 403 for system info, poller executions and watchdog running executions. This is strong corroboration of expired-reader impact, not proof against an additional ACL issue. No new token value, credential update, service recovery or successful deployment is documented at this stage. The screenshot also showed `SPHERE DEV Runner` due **2026-10-13 20:52:16 WIB**; its separate rotation and least-privilege review remain pending.

## DEV v1.34.77 — data reliability during and after an outage

**Observed recovery on 2026-10-10:** The SPHERE Rundeck reader credential was rotated on `JAHSVR-SPHERE` without restarting services. GET-only probes returned HTTP 200 for poller executions and watchdog running executions. Subsequent systemd checks confirmed the poller, watchdog and two infrastructure poller services ended successfully, with poller `OK`, watchdog `NORMAL`, `collector_stale=false`, latest collection age **122 seconds**, `auto_healing_enabled=true` and platform `NORMAL`. This supports successful collection recovery **at that check**, not continuous availability over the preceding outage. PROD deployment was not performed. This recovery update supersedes the earlier incident note's pending-rotation status.

The cockpit data trust contract is separate from SAP health:
- `FRESH`: recent READY performance evidence, collector source verified and fresh availability.
- `STALE`: READY data older than the freshness budget; never display as a current measurement.
- `DEGRADED`: recent READY data exists but poller/watchdog is unhealthy or unverified.
- `PARTIAL`: performance remains fresh but Service Availability evidence is missing or older.
- `UNKNOWN`: source metadata cannot be verified or its refresh failed.

A historical gap means **there is no retained complete READY performance observation between two known READY timestamps**. It is not a claim that SAP was down, nor a reconstructed outage start time. The main cockpit shows bounded historical gaps for up to 24h after the next observed READY collection. The Server Trend retains its historical Collection Gap context for selected ranges. A successful new collection restores current freshness but does **not** fabricate missing samples. If the retained history endpoint cannot be fetched, show **History coverage unverified**, not a false claim of zero gaps. System Health and PDF exclude stale/untrusted host-resource rows from current operational severity, while keeping their historical values available for investigation.

Alerts already versioned under `ops/observability/sphere-prometheus-rules.yml` include `SphereCollectionStale` (after 5 minutes) and `SphereIngestionFailure`; ensure Prometheus/Alertmanager routing is operational separately rather than treating a rule file as proof of a delivered notification. The user-visible data status must be prominent even if notifications have not been connected.

DEV build command after GitHub checkout is validated:

```bash
bash ops/rundeck/qa-build-dev.sh && bash ops/rundeck/prod-readiness-check.sh && bash ops/rundeck/deploy-dev.sh
```

Continue to enforce readiness and check both performance and Infrastructure freshness. The frontend can mark old `/INTF` samples stale but cannot recover missing Rundeck executions itself. No PROD promotion is authorized by this change.


## SPHERE DEV Runner: separate 30-day rotation

**Owner decision (2026-10-10):** Rotate `SPHERE DEV Runner` before its displayed expiry **2026-10-13 20:52:16 WIB**, with a 30-day token. Unlike the monitoring reader credential, the runner can be used for authenticated job-execution and a watchdog-approved execution abort. Its server-side path is `/etc/sphere/rundeck-runner.token` and must not be confused with `/etc/sphere/rundeck-readonly.token`. The desired maintainer is a single designated operator, while actual exclusivity depends on server sudo permissions, users and Rundeck ACL—not token naming.

### Generate in Rundeck

Preferred future-state identity: a dedicated `sphere_runner` **user** and `sphere_runner` role, with matching ACL policies scoped to exactly the SPHERE performance/work-process and Service Availability jobs plus appropriate project read and execution inspection. These identities and policies **must be confirmed to exist before generating** such a token; writing their names in the UI does not provision them. Minimum job permissions are the required read/view, `run` and `kill` operations, plus the required project read permissions and job node execute permissions according to Rundeck ACL semantics; exclude application administration, job deletion, project configuration and unrelated jobs.

Suggested generator fields once identity/ACL are confirmed:

| Field | Value |
| --- | --- |
| Name | `SPHERE DEV Runner v2` |
| User | `sphere_runner` (only if provisioned and authorized) |
| Roles | `sphere_runner` (only if provisioned and authorized) |
| Expiration in | `0` |
| Unit | `Minutes` |

The observed server UI interprets `0` as the **maximum 30 days**, not unlimited. Verify the new expiry date and effective role. Do not leave Roles blank on an admin account: that normally inherits all user roles. The **existing** Runner token was minted under `admin` with `build,architect,admin,user,deploy` and represents elevated permissions. If no restricted runner identity/ACL exists, **stop and agree on a controlled transition** before generating another admin-level credential: do not assign a fictional `sphere_runner` role and assume it grants rights.

### Safe server rotation sequence

1. Confirm the exact active consumers and any PROD references to `/etc/sphere/rundeck-runner.token` using filtered `systemctl cat`/file-reference checks, without printing secrets. The DEV deployment installs separate `rundeck-runner` systemd credentials via drop-ins on `sphere-rundeck-api.service` and `sphere-rundeck-watchdog.service`; check actual server configuration. `RUNDECK_COLLECT_NOW_ENABLED=false` is the documented default; check runtime values rather than assuming default.
2. Create the replacement token using the approved restricted identity and 30-day expiry. Handle the one-time value through a secure password manager and a hidden terminal prompt; never save it in a GitHub repository, shell history or chat.
3. Test the new token with **GET-only** Rundeck API calls against the two exact whitelisted job identities and the execution read endpoints before replacing the token file. HTTP 200 validates token recognition and read access, **not** `POST /job/.../run` or `POST /execution/.../abort` authorization. Validate those additional rights through the Rundeck ACL administrator, without starting/aborting an SAP job as a token test.

   On JAHSVR-SPHERE (after clean fast-forward of `rundeck-sphere-dev`), run `PYTHONDONTWRITEBYTECODE=1 python3 ops/rundeck/diagnose-rundeck-runner-dev.py`. The tool prompts for the **new** token without echoing it, tests system/user/job/execution **GET** endpoints only, and prints only HTTP statuses and a summary. It does not replace `/etc/sphere/rundeck-runner.token`. It gets the two whitelisted UUIDs from the effective DEV unit text and environment file and stops if they are missing. Never paste the token in output.

   **Security review required:** Current repository `ops/rundeck/sphere-rundeck-api.service` enables `RUNDECK_COLLECT_NOW_ENABLED=true`, and `backend/rundeck_api_core.py` checks only a caller-supplied `X-SPHERE-Action` header before triggering `/collect-now`. That is not authenticated per-user maintenance authorization. Before relying on 'only the maintainer can run jobs', audit live deployment, reverse proxy restrictions and server-side authentication/authorization; do not claim role isolation from Rundeck token roles alone.
4. Back up the previous file with root-only mode `0600`; write the new value atomically with the expected runtime file ownership/permissions (DEV deploy sets `root:sphere 0640`). Never display or log the token. Preserve the old token during validation for rollback and revoke it promptly after the new credential is accepted.
5. systemd `LoadCredential` is copied at service start. A watchdog oneshot gets the new value at its next normal timer run. A long-lived `sphere-rundeck-api.service` keeps its prior credential snapshot until restarted; **do not restart just for a credential rotation** without a separate verified change window and rollback plan. Keep existing watchdog auto-abort settings; do not invoke the watchdog manually merely to test the runner.
6. Inspect service results and read-only platform health. With `Collect Now` disabled, no run/abort operation can be safely exercised for a complete end-to-end runner permission proof without an approved action; explicitly record that limitation. Validate no unexpected service, source, or PROD changes. Revoke the old Runner token after all identified consumers are reloaded/verified, not while a service still depends on the old snapshot.
7. Record the new expiration in the private rotation register. Alert the maintainer at D-7, D-3 and D-1. Do not store token values in the register.

**Important:** The existing Reader token was successfully rotated and poller/watchdog recovered; Runner rotation is independent. Do not conflate them, and do not claim Runner rotation succeeded until credential replacement plus suitable service verification is observed.

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

   **Security review required (historical state):** The 2026-10-10 source enabled `RUNDECK_COLLECT_NOW_ENABLED=true` and accepted only a caller-supplied `X-SPHERE-Action` header. This was not maintainer authentication. The 2026-10-11 source hard-locks both the POST route and its status gate, and sets the DEV unit default to false; see the latest security gate section below. Before relying on 'only the maintainer can run jobs', audit live deployment, reverse proxy restrictions and server-side authentication/authorization; do not claim role isolation from Rundeck token roles alone.
4. Back up the previous file with root-only mode `0600`; write the new value atomically with the expected runtime file ownership/permissions (DEV deploy sets `root:sphere 0640`). Never display or log the token. Preserve the old token during validation for rollback and revoke it promptly after the new credential is accepted.
5. systemd `LoadCredential` is copied at service start. A watchdog oneshot gets the new value at its next normal timer run. A long-lived `sphere-rundeck-api.service` keeps its prior credential snapshot until restarted; **do not restart just for a credential rotation** without a separate verified change window and rollback plan. Keep existing watchdog auto-abort settings; do not invoke the watchdog manually merely to test the runner.
6. Inspect service results and read-only platform health. With `Collect Now` disabled, no run/abort operation can be safely exercised for a complete end-to-end runner permission proof without an approved action; explicitly record that limitation. Validate no unexpected service, source, or PROD changes. Revoke the old Runner token after all identified consumers are reloaded/verified, not while a service still depends on the old snapshot.
7. Record the new expiration in the private rotation register. Alert the maintainer at D-7, D-3 and D-1. Do not store token values in the register.

**Important:** The existing Reader token was successfully rotated and poller/watchdog recovered; Runner rotation is independent. Do not conflate them, and do not claim Runner rotation succeeded until credential replacement plus suitable service verification is observed.


## DEV Runner 403 incident: staged ACL review and web token management (2026-10-10)

**State:** Reader rotation and fresh collector verification are complete. The newly minted `sphere_runner` Runner candidate passes authentication endpoints but returns HTTP 403 for both approved job reads and both job execution lists. It has **not** replaced `/etc/sphere/rundeck-runner.token`; therefore RUNNER_READ_SCOPE=FAIL, run/kill=UNVERIFIED, credential rotation=HOLD and DEV deployment=HOLD. Do not equate API system/info HTTP 200 with project/job authorization.

### Read-only inventory on Rundeck server tbssvr-ssl

Use `ops/rundeck/diagnose-rundeck-acl-server.py` from the DEV branch on the Rundeck host (transfer the audited script over an existing approved administrative channel; do not add an arbitrary public download dependency). It inventories local ACL filenames, checks only the **presence** of the service principal in local UNIX / realm databases, and optionally reports nonsecret matching policy summaries when PyYAML is already installed. No token, realm secret, policy contents, raw journal, or environment values are printed. It requires no token and does not call the job API, restart Rundeck or change ACL.

Local policy candidates: `/etc/rundeck/*.aclpolicy`, `/home/rundeck/etc/*.aclpolicy`, `/var/lib/rundeck/etc/*.aclpolicy`. For launcher/custom installations also inspect the authorized `RDECK_BASE/etc` location as appropriate. **Stored ACL policies** (system and project) may live in the Rundeck database and are not enumerated by this filesystem inventory. The Rundeck administrator must inspect System → Access Control and Project Settings → Access Control. Directory/LDAP identity and effective role mapping require a separate inspection. A local UNIX account or realm entry is not required for every valid Rundeck principal.

The checked-in `ops/rundeck/examples/sphere-runner-dev.aclpolicy.example` is **not an installed policy**. Replace `__APPROVED_PROJECT__` only after verifying the actual project for **both** UUIDs and explicit maintainer approval. Its application-context rule allows only project read; project-context rules permit job `read/view/view_history/run/kill` for the two exact UUIDs, plus minimum event/node read and node run. Inspect whether job node execution needs the latter. No broad job regex, wildcard permissions, `runAs`, `killAs`, administration or unrelated jobs. Verify there are no inherited broad grants or explicit denies in other effective policies. Validate via the Rundeck ACL test interface/administrator; do **not** send POST run/abort requests for testing.

After the approved administrator applies a scoped policy, rerun `PYTHONDONTWRITEBYTECODE=1 python3 ops/rundeck/diagnose-rundeck-runner-dev.py` **on JAHSVR-SPHERE**, entering the candidate token through the hidden prompt. Proceed only if both job GET and execution-list GET are HTTP 200 (RUNNER_READ_SCOPE=PASS). That test does not prove run/kill. Audit `systemctl cat` / `LoadCredential` consumers and any references outside DEV before file replacement. No automatic restart, activation, old-token revocation or DEV deployment follows an ACL inventory alone.

### Token expiry and renewal through the SPHERE DEV web UI (planned, not yet enabled)

Add a compact **System Data → Token Management** panel with separate Reader and Runner cards. Display token label (nonsecret), service owner, role, last verified date, expiration in WIB, days remaining, consumer readiness, and `ACTIVE / DUE SOON / EXPIRED / UNKNOWN / BLOCKED / PENDING RELOAD`. Always distinguish **known** expiry from inferred 30-day policy; UNKNOWN is mandatory where no verified expiry metadata exists. Alert at D-7, D-3, D-1 and expiry; show warnings without replacing the collector freshness signal. Never export token values to client status JSON, PDF, Prometheus labels, alerts or logs.

`Renew Now` must initially be **disabled/locked** until a verified browser maintenance authentication boundary exists. The existing `POST /collect-now` action checks only a caller-supplied `X-SPHERE-Action` header and `ops/rundeck/nginx-dev.conf` has no explicit maintainer authentication for that route. `X-Forwarded-User` and headers supplied by clients are not authorization. Audit the actual reverse proxy, upstream trusted identity, SSO/MFA, CSRF protections, origin checks and permission policy before allowing any mutating maintenance endpoint. Do not retrofit credential upload into the public `/dev/api/` GET-only proxy. Existing read-only monitoring must remain accessible.

Desired authorized flow: (1) named maintainer signs into a trusted HTTPS maintenance gateway with MFA and explicit SPHERE DEV credential-rotation role; (2) `Renew Now` opens a nonpersistent password input for a freshly generated Rundeck token (Rundeck itself remains the issuer); (3) privileged server-side, no-log GET-only preflight checks user, approved role, two job reads, executions and expiry metadata; (4) independent ACL review confirms run/kill rights without actions; (5) a root-confined service behind a restricted UNIX socket creates a root-only rollback backup and atomically replaces the **DEV-approved** credential path, never receiving arbitrary paths; (6) a separate approved maintenance window reloads long-running `LoadCredential` consumers and observes periodic oneshots without manually triggering watchdog; (7) health and secret-free audit confirm active consumers, then maintainer explicitly revokes the old token; otherwise rollback and retain old token. Fail closed for ACL 403, unverifiable identity/expiry, unhealthy watchdog, conflicting consumer, incomplete maintainer authorization or missing rollback evidence. No command-line token paste should be needed **after** this complete server-side workflow is delivered and approved.

Security caveat: the normal DEV deployment script deliberately restarts `sphere-rundeck-api.service` and starts the watchdog; it is **not** a harmless dry-run and must not be used to force a credential refresh. Reader credentials are already healthy and must remain untouched. PROD and SAP PROD remain off-limits.


### Implemented source-only UI phase (2026-10-10; not deployed)

- `backend/rundeck_token_lifecycle.py` exposes a strictly allowlisted, **secret-free** Reader/Runner expiry summary inside the existing `GET /platform/health` response. As a bootstrap, reported expiry observations are 2026-11-09 23:23:13 WIB (Reader) and 2026-10-13 20:52:16 WIB (existing privileged Runner), both last reported 2026-10-10. They are **not live Rundeck token validity checks**; revocation, permissions, and credential replacement are deliberately not inferred. An optional local `/var/lib/sphere/ingestion/credential-lifecycle.json` with `reader` / `runner` expiry metadata may supersede observations, but it is still marked `operator-register` and cannot authorize renewal. Unknown/incomplete or malformed metadata is not treated as verified active.
- `src/tools/components/RundeckSystemData.jsx` and `RundeckSystemData.css` now contain a compact third tab, **Token Management**, showing last reported expiration (WIB), days remaining, identity, state and D-7 / D-3 / D-1 urgency. Both `Renew Now` controls are visibly **locked**. There is **no POST credential-renewal endpoint**, token upload form or credential write in this phase.
- `backend/tests/test_rundeck_token_lifecycle.py` adds offline assertions for reported/expired statuses, secret redaction and fail-closed behavior. These tests, main QA/build, and deployment have **not yet run on JAHSVR-SPHERE**; do not mark PASS or start deployment before the ACL gate and runtime readiness are confirmed.

### Current authorization issue to resolve before interactive renewal

`ops/rundeck/nginx-dev.conf` retains an explicit POST proxy location for `/dev/api/collect-now`, without an `auth_request`/SSO grant. **As of the 2026-10-11 DEV source change, the FastAPI handler always refuses POST with HTTP 403, even if the client supplies X-SPHERE-Action or a forged forwarded identity.** This is a source finding; inspect the complete live Nginx configuration before concluding it is publicly reachable without authentication. Meanwhile `backend/rundeck_api_core.py` requires only caller-defined `X-SPHERE-Action: collect-now` and reads identity from an unverified forwarded header. The renewal API must NOT reuse that model. A maintenance-only backend or gateway requires independently enforced, verifiable identity/authorization plus CSRF defenses, no-store/audit policies and controlled root-confined credential replacement; until then, keep `Renew Now` locked.


### Rundeck host read-only ACL findings (reported 2026-10-11)

Operator confirmed that Rundeck is active on `tbssvr-ssl`; the filesystem has exactly four observed policy files: `admin.aclpolicy`, `apitoken.aclpolicy`, `sphere-reader.aclpolicy`, `user.aclpolicy` under `/etc/rundeck`. Simple literal scanning found no `sphere_runner` or either approved UUID in those files; this does **not** establish effective denied permissions because regex/group policies and DB-stored System/Project ACLs must still be reviewed. The local realm/UNIX account probes did not find `sphere_runner`; that is not proof an API token identity is invalid. Two filesystem project directories `sample` and `Linux-Testing` were observed, but the actual projects hosting both jobs remain unverified; never assume a `Linux` project from source defaults alone. A controlled **read-only** job metadata/ACL review is required before changing any policy or credential.

The ACL example requires replacement of the exact approved project **and** approved node identity; its node rule was narrowed to explicit `nodename`, rather than unscoped `node: allow [read,run]`. If the two jobs span different projects or several nodes, prepare separate vetted rules. The template is a review artifact, not an authorization decision and has not been deployed. Keep DEV deployment, Runner token swap, and interactive renewal blocked.


### Approved SPHERE job inventory from Rundeck UI (operator screenshot, 2026-10-11)

The operator identified precisely three operational jobs in Rundeck's **SAP / AOP** folder:
1. `SPHERE Infrastructure Collector - PROD APP1` (AOP PROD infrastructure telemetry).
2. `[CRITICAL]-[Daily Check] Service Availability Report – SAP App & HANA DB 06.03.2026` (service availability).
3. `[Critical]-[Daily Check] SPHERE SAP Work Process Check` (performance).

**Important permission separation:** The DEV `sphere-rundeck-infra-aop-prod-test.service` config sets project `Linux`, group `SAP/AOP`, job name `SPHERE Infrastructure Collector - PROD APP1`, and loads only `rundeck-reader`; `backend/rundeck_infra_poller.py` polls prior executions and output via GET. It must **not** be added to Runner `run`/`kill` grants merely because it appears in the UI. Keep the existing healthy Reader credential unchanged pending its own separately approved audit.

The interactive Collect Now runner in `backend/rundeck_runner.py` addresses only the configured **performance** and **availability** job specs, with candidate configured UUIDs `4f129041-956c-4e80-916f-fcde8948db09` and `34821afe-9261-4122-88db-cf6e8fc65545`. The watchdog can abort a matched performance execution only under its existing guard. Before installing any ACL, confirm the job UUID-to-name mapping and project(s) using read-only metadata from the actual Rundeck server, check effective token role and stored ACLs. The folder hierarchy in the UI is NOT proof of the Rundeck project name.

Observed file ACL review: `admin.aclpolicy` and `apitoken.aclpolicy` are broadly privileged; `sphere-reader.aclpolicy` grants reader job read/view/history in project `Linux` with no job UUID restriction; `user.aclpolicy` has other scope. No explicit `sphere_runner` rule was observed in these four local ACL files. This strongly suggests a missing dedicated runner policy but does NOT rule out DB-stored ACLs, token role differences or inherited policy. Do not enroll Runner in `admin` or `api_token_group`; do not grant Run/Kill on the infrastructure collector. Do not edit the Reader ACL during this incident; its broader read scope is a separate planned least-privilege review.

Until identity/UUIDs/project/role are verified and a maintainer approves the exact policy, Runner rotation, interactive Renew Now credential submission, and DEV deploy stay **HOLD**. Neither Rundeck jobs nor SAP PROD should be modified.


### Three SPHERE job identity read-only probe (2026-10-11)

User executed Reader GET-only list for Rundeck project `Linux`, group `SAP/AOP`. Confirmed one `SPHERE Infrastructure Collector - PROD APP1` (`66ffa675-1d77-4fe5-9aec-95ef5e330726`) and one Service Availability report (`34821afe-9261-4122-88db-cf6e8fc65545`); **Performance name-filtered result was zero**. This does not prove the Performance job is absent, because its name/group, UUID mapping, or list filtering may differ. The configured candidate UUID remains `4f129041-956c-4e80-916f-fcde8948db09` and requires direct metadata verification before an ACL can be applied.

Run `PYTHONDONTWRITEBYTECODE=1 python3 ops/rundeck/diagnose-performance-job-identity-dev.py` on `JAHSVR-SPHERE` as an authorized root operator after clean DEV checkout fast-forward. It GETs the configured UUID directly, then lists project `Linux` jobs and prints only matching nonsecret SPHERE work-process metadata. It reads the healthy Reader credential but never echoes it, never calls Runner, and performs no POST or service action. Do not replace credentials, loosen job filtering or grant Runner ACL until project/group/name/UUID are reconciled. Infrastructure remains Reader-only, and the short-lived Runner rotation stays on HOLD.


### Performance identity fully verified (reader GET only, 2026-10-11)

The operator ran `diagnose-performance-job-identity-dev.py` on `JAHSVR-SPHERE` with Reader, receiving HTTP 200 for both the direct performance UUID lookup and `Linux` job list. Configuration and live metadata agree:
- Project `Linux`; group `SAP/AOP`.
- Performance UUID `4f129041-956c-4e80-916f-fcde8948db09`.
- Exact job name `[Critical]-[Daily Check] SPHERE SAP Work Proccess Check` (**Proccess** spelling is authoritative here).
- Service Availability UUID `34821afe-9261-4122-88db-cf6e8fc65545`, already verified in `Linux` / `SAP/AOP`.
- Infrastructure Collector PROD APP1 UUID `66ffa675-1d77-4fe5-9aec-95ef5e330726`, already verified in `Linux` / `SAP/AOP`, Reader-only.

Previous Performance name-filter MISS was due to spelling mismatch; do not rename the Rundeck job solely for the probe. **Do not repeat this verified identity diagnostic.**

Draft ACL under `ops/rundeck/examples/sphere-runner-dev.aclpolicy.example` now targets `Linux` and exact performance + availability UUIDs, with `kill` only for the performance watchdog use-case. Infrastructure remains out of Runner ACL. Before installation, confirm (1) token authorization roles include `sphere_runner` and exclude `admin` / `api_token_group`, (2) which node(s) both job definitions dispatch to, replacing `__APPROVED_NODE_NAME__` with a complete reviewed selector, and (3) no broader stored System/Project ACL grants for the effective token principal. Rundeck `rd acl validate` / `rd acl test` may validate a completed proposal offline; it does not by itself prove the entire live effective permission set or the short-lived token's active role mapping. There is no approval yet to install policies, replace credentials, revoke previous tokens, restart services, deploy DEV or enable browser renewal.


### Runner node authorization discovery, read-only (2026-10-11)

`ops/rundeck/diagnose-rundeck-job-node-filters-dev.py` inspects only the two verified Runner job definitions by GET through the existing Reader, and emits only the exact identifiers, bounded node-filter selectors and presence of dispatch settings. No job steps, options, secrets or full definitions are printed. Run on the DEV host after clean fast-forward. If the node filter is unset, dynamic, complex or unavailable, use the Rundeck job's Nodes configuration in the authorized UI for human review; never infer node permissions from the job label. The example ACL is intentionally noninstallable with a node placeholder pending this check. After node mapping and token role are verified, use Rundeck's read-only ACL validator/test CLI or UI to validate the proposed policy. A successful local ACL test does not establish the effective union of stored ACLs and role assignments. Continue HOLD on Runner credential replacement and DEV deploy until all gates are proven.


### Historical high-frequency executions / stuck Rundeck workflows — safe runbook (2026-10-11)

The owner reported a past Rundeck SPHERE-related workflow that appeared hung after being launched thousands of times. **There is no retained incident evidence here proving whether those were distinct execution IDs, a single execution with repeated step/output entries, queued retries, or external repeated triggers.** Do not claim the root cause or create a replacement job as a substitute for incident diagnosis. New jobs receive new IDs, while SPHERE reader/poller, watchdog and Collect Now use exact job identity/configuration; cloning jobs and changing a UUID without controlled migration could interrupt monitoring or remove the watchdog's protection.

The initial `diagnose-rundeck-job-node-filters-dev.py` returned HTTP 200 for two job exports but `IDENTITY=NOT_VERIFIED`. That is an **export-format/metadata probe limitation**, not evidence of invalid jobs: the authoritative `/job/{UUID}/info` identity was already proven for Performance, and the Reader-verified group/project metadata exists. The upgraded script calls `/info` to verify IDs and then safely parses the API-v44 JSON export in supported array/object/wrapper forms. It inventories `multipleExecutions`, bounded retry, timeout, schedule activation and node filter for **three** identified SPHERE jobs without outputting job command content. Offline unit tests `backend.tests.test_rundeck_job_guard_diagnostic` verify export format handling and nonsecret output. These new tests have **not yet been run on JAHSVR-SPHERE**.

Before changing any live job, review evidence and source of execution IDs: Rundeck Activity history for the exact UUID, manual/scheduler/API/webhook callers, schedule cadence, notifications and failure handler Job References; inspect if the job references itself or another job cyclically, if retries relaunch, if previous runs overlap, and if a "thousand executions" observation was actually a thousand output lines within one execution ID. Use GET-only API requests or restricted UI views; avoid exporting scripts, options, secrets or logs to chat.

**Preferred bounded configuration after approval** (adapt limits to measured baseline, not guesses):
- Set Multiple Executions **No** for each job where overlap is unsafe; if enterprise Job Queue exists, verify it is off or strictly bounded—unlimited queues can accumulate even with single-worker execution.
- Ensure one schedule owner, no duplicate cron/external webhook trigger, and no recursive Job Reference. Limit retry to zero initially for diagnosis, then an approved small bounded count/backoff only if needed; configure appropriate per-job timeout based on normal runtime and SSH/tool timeouts; define maximum output/log size.
- Make Collect Now idempotent across simultaneous HTTP requests using a **server-side atomic lock** protecting status check, cooldown and launch state; source `backend/rundeck_runner.py` currently evaluates `status()` before writing launch state with no atomic inter-request protection. Also fix public mutation-route identity authorization before enabling new execution controls; a fixed `X-SPHERE-Action` header is not sufficient.
- Keep watchdog guard scoped to Performance job UUID and verified execution status; do not manually start watchdog, broaden its kill rights or change abort thresholds without separate impact review.
- Only if job definition corruption or a confirmed stuck workflow design requires a new version, create a **new disabled/draft job** with separate UUID, schedule OFF, executions OFF, no global grants, then review before an explicitly approved switch of source UUIDs and rollback. Never run it just to test Runner token privileges.

No job was created, deleted, disabled, restarted or executed by this source update. DEV deployment, Runner rotation and interactive Renew Now remain on HOLD until the ACL and maintainer-authorization gates pass.


## SPHERE-only security hardening on DEV source (2026-10-11)

Ownership decision: the separate Rundeck host `tbssvr-ssl` (database, log storage,
retention, JVM/Quartz and ACL administration) is owned by the infrastructure
team. The SPHERE project does not change, tune, restart, or clean up Rundeck.
Previously collected `tbssvr-ssl` baseline information is an infra handoff,
not a prerequisite for continuing isolated source development on SPHERE DEV.

### Implemented on `rundeck-sphere-dev` (source only, NOT deployed)

- `POST /collect-now` **always returns HTTP 403**; no caller-supplied
  `X-SPHERE-Action`, `X-Forwarded-User`, or environment toggle can unlock it.
  `GET /collect-now/status` returns `enabled=false, allowed=false` with reason
  `MAINTAINER_AUTH_NOT_CONFIGURED`. No real principal/SSO/MFA binding currently
  exists. The route remains registered to preserve API contract compatibility.
- The DEV API unit **defaults** `RUNDECK_COLLECT_NOW_ENABLED=false`. A live
  environment file may override this legacy toggle, but cannot bypass the
  hard-locked backend route. The existing Nginx POST location does NOT grant
  authorization, because the backend rejects it unconditionally.
- `backend/rundeck_runner.py` contains defense-in-depth for **future**
  authenticated use: Linux `flock` serializes the readiness check and POST
  launch across threads/processes, and the launch-intent JSON is flushed
  before contacting Rundeck. Incomplete or ambiguous submissions retain a
  reconciliation flag so a retry cannot silently repeat a possibly accepted
  job run. A failed GET check for already-running jobs also makes Collect Now
  unavailable. The lock does **not** touch the watchdog or its auto-abort policy.
- `backend/tests/test_rundeck_collect_security.py` tests route denial,
  GET-check failure, durable intent before POST, simultaneous callers, and
  ambiguous-launch recovery without contacting SAP or Rundeck. The test uses
  mocks; a successful local test does **not** validate live Runner ACL.
- `System Data → Token Management → Renew Now` remains LOCKED. Do not add a
  token input form or create a credential-rotation endpoint on the unauthenticated
  monitoring API. The reported Reader expiry is not a live validity assertion.

### Required gates before any future interactive activation

1. The infra administrator confirms `sphere_runner` role and exact ACL for
   Performance and Availability, without broadening the Infrastructure
   Collector permissions; an authenticated GET-only candidate check must pass.
   The existing Reader credential remains unchanged.
2. A separate, trusted HTTPS maintainer gateway must authenticate named users,
   enforce role authorization and MFA where available, and provide CSRF,
   origin/session, audit and rate-limit protections. The application must use
   verified server-side identity, not client-defined proxy headers.
3. A narrowly scoped privileged rotation helper must validate a new token using
   GET-only calls, preserve root-only rollback backup, atomically replace the
   approved DEV path and verify each systemd LoadCredential consumer at an
   approved maintenance window. Revoke previous token **only after** all
   consumers are verified. Do not modify PROD or trigger jobs as a token test.
4. Before re-enabling Collect Now, verify failure recovery for
   `launch_reconciliation_required`: a named maintainer must reconcile Rundeck
   executions via GET-only evidence before any locked state can be cleared.
   A clock-based reset or unauthenticated clear endpoint is prohibited.
5. Pass focused source tests, full QA/build, existing watchdog readiness, and
   review deploy impact and rollback. **Do not run `deploy-dev.sh` automatically**:
   it changes the DEV systemd unit, restarts the DEV API and runs watchdog
   checks. No PROD deploy or branch promotion is authorized.

New focused regression (on `JAHSVR-SPHERE`, after a clean, reviewed checkout;
does not access Rundeck):
```bash
cd /root/rundeck-sphere-dev
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v backend.tests.test_rundeck_collect_security
```

Current status: **GITHUB SOURCE CHANGED / SERVER QA NOT RUN / DEV DEPLOY HOLD**.


## SPHERE DEV migration gate, source review 2026-10-11

Read-only server preflight on `JAHSVR-SPHERE` reported:

- DEV runtime: platform NORMAL, poller OK, watchdog NORMAL, auto-healing
  enabled, collector not stale; watchdog smoke PASS.
- Local database configuration: `DB_MODE=hybrid`,
  `SPHERE_RUN_DEV_MIGRATIONS=true`, exact DB name `sphere_rundeck_dev`,
  local host classification. These do **not** prove Alembic's current revision.
- Existing DEV release: `d51664d34a3e103503b132a122446b0214917773`;
  prior candidate: `8d54cfb863a589bcdfd52a459e98ea8d53cf0d96`.
  GitHub compare reported no changes under `backend/db/migrations/`
  between these releases, but schema state still needs a live read-only check.
- `RUNDECK_COLLECT_NOW_ENABLED` was `UNVERIFIED` in a secret-safe
  classifier (neither exact `true` nor exact `false`). Do not infer actual
  runtime authorization from this value. The new DEV backend routes remain
  fail-closed irrespective of the toggle after deployment.

**Hardening (source only):** `validate-dev-migration-target.py` checks the
whole parsed PostgreSQL URL (exact database name, `sphere` role, local
Unix socket or loopback, no hidden remote override), without printing it.
`migrate-dev.sh` uses this validator before any Alembic action. The old
substring-based URL check was unsafe and is no longer sufficient.
`deploy-dev.sh` now refuses to enter its side-effect stage whenever
`SPHERE_RUN_DEV_MIGRATIONS=true` without **both**:

1. `SPHERE_DEV_MIGRATION_APPROVED_SHA` exactly matching the release SHA;
2. `SPHERE_DEV_MIGRATION_DECISION` explicitly `skip` or `apply`.

These shell environment arguments are change-control safety gates, not a
replacement for named maintainer authentication or OS access controls.

- `skip` suppresses Alembic for that deployment even if the old environment
  file says `true`; use **only if a read-only check proves the DEV database
  is already at the matching Alembic head**. Never skip a needed migration.
- `apply` runs the existing migration helper only for the exact local DEV
  database. It requires a separately checked backup and approved maintenance
  window; the deploy rollback reverts API/web links and Nginx, **not the DB
  schema**. No backup is automatically created by the gate.
- Omitted/mismatched revision or an invalid decision means **DEPLOY HOLD**.
  The script fails before creating releases, altering credentials, Nginx, or
  systemd. Do not clear safety gates merely to complete a release.

**Read-only evidence required from `JAHSVR-SPHERE`:** retrieve the deployed
database's `alembic_version.version_num` using `psql` as local OS user
`sphere`, and retrieve the candidate's head using `alembic heads`
(without `upgrade`). Compare exactly. If credentials, peer authentication,
version table, or lineage differ, stop and investigate without DDL.
Confirm config `DB_MODE` and target via the secret-safe validator.
Avoid printing `DATABASE_URL`, SQL connection strings or credentials.

Offline regression:
`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v backend.tests.test_rundeck_dev_migration_guard`.
Validate `bash -n ops/rundeck/deploy-dev.sh ops/rundeck/migrate-dev.sh`,
then run `bash ops/rundeck/qa-build-dev.sh` for the new release SHA.
Full readiness and explicit deploy review follow separately; do not execute
`deploy-dev.sh` as a QA shortcut. Infrastructure-owned Rundeck host is
out of scope.

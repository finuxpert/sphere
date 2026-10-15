# SPHERE DEV — Network 422 and Custom Range regression guard (15 Oct 2026)

Scope: `rundeck-sphere-dev` only. No PROD service or production database mutation.

## User-visible changes
- Technical Trend > Network has RX/TX in the panel header, away from metric buttons.
- Network HTTP 422 displays which query parameter was rejected. A metric-only FastAPI 422 indicates the running backend does not accept the expected Network metric contract; it does not establish missing traffic.
- Custom opens a compact, keyboard-accessible date/time dialog (WIB) that shows the active preset and explains the new interval is not applied yet. The chart behind is not filtered until Apply.
- Reopening the dashboard with stale local preference `range=custom` defaults to the standard range, not an empty Custom view.
- Technical source remains the Infrastructure Collector (one highest-throughput NIC per APP/sample, in Mbps), not SAP process traffic or a causal verdict.

## Mandatory regression gates
1. `npm run qa:trend-focus` includes `rundeck-custom-range.test.mjs`, `rundeck-network-trend.test.mjs`, and `rundeck-trend-api-error.test.mjs`; all also run in `npm run qa`.
2. `ops/rundeck/release-dev-fast.sh` runs `backend.tests.test_rundeck_custom_window` and `backend.tests.test_rundeck_network_trends` before deployment.
3. `ops/rundeck/deploy-dev.sh` restarts the DEV API and verifies **both** Network directions on local port 8091 and public `/dev/api`. HTTP 422, 5xx, HTML response or invalid Network source contract makes the deployment FAIL/rollback.

## Recommended operator workflow
On JAHSVR-SPHERE, use the guarded command:

```bash
sphere deploy dev
```

After PASS, open `https://sphere.astraotoparts.co.id/dev/#/tool/logs` and test Network RX/TX (3H), APP focus, and Custom Time Range. Browser refresh recommended if old JavaScript is cached.

Read-only manual API verification:

```bash
curl -sS -i 'http://127.0.0.1:8091/history/trend?range=3h&bucket=auto&metric=network_rx'
curl -sS -i 'https://sphere.astraotoparts.co.id/dev/api/history/trend?range=3h&bucket=auto&metric=network_tx'
```

Expected HTTP 200 and JSON `metric=network_rx/network_tx`, `unit=Mbps`, `network_source=Infrastructure collector`, `items=[]` or source-backed APP1–APP5 samples. An empty `items` array means no retained readings for the chosen range, not a zero-Mbps sample.

If tests/build or post-deploy smoke fails, do not promote to PROD. Inspect `/tmp/sphere-dev-release-last.log` and the failing response details.

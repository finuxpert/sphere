import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')

test('sphere deploy dev dispatches guarded full-stack release before UI-only checks', () => {
  const source = read('ops/rundeck/sphere-cli.sh')
  const branch = source.indexOf('if [[ "$MODE" == dev ]]; then\n  echo "DEV_RELEASE=FULL_STACK_GUARDED"')
  const guarded = source.indexOf('exec bash "$SOURCE/ops/rundeck/release-dev-fast.sh"')
  const webOnly = source.indexOf('if [[ "$PREVIOUS" == "$RELEASE" ]]; then')
  assert.ok(branch !== -1 && branch < guarded && guarded < webOnly)
  assert.match(source, /if \[\[ "\$MODE" == prod \]\]; then/)
})

test('DEV QA still checks host scoped coverage, Network and Custom', () => {
  const source = read('scripts/tests/rundeck-current-workload-coverage.test.mjs')
  const component = read('src/tools/components/RundeckCurrentWorkload.jsx')
  const pack = JSON.parse(read('package.json'))
  assert.match(source, /loaded jobs and programs/)
  assert.match(component, /host=\$\{encodeURIComponent\(host\)\}/)
  assert.match(component, /combineCurrentWorkloadResponses/)
  assert.match(pack.scripts['qa:integrity'], /rundeck-current-workload-coverage.test.mjs/)
  assert.match(pack.scripts['qa:trend-focus'], /rundeck-custom-range.test.mjs/)
  assert.match(pack.scripts['qa:trend-focus'], /rundeck-network-trend.test.mjs/)
})

test('DEV idempotency requires matching API and verified Network/Custom contracts', () => {
  const deploy = read('ops/rundeck/deploy-dev.sh')
  const release = read('ops/rundeck/release-dev-fast.sh')
  const start = deploy.indexOf('if [[ "$(readlink -f "$API_CURRENT"')
  const earlyExit = deploy.indexOf('DEV=ALREADY_CURRENT')
  assert.ok(start >= 0 && earlyExit > start)
  const guard = deploy.slice(start,earlyExit)
  assert.match(guard, /smoke-network-trends-dev\.sh/)
  assert.match(guard, /smoke-custom-window-dev\.sh/)
  assert.match(deploy.slice(earlyExit), /smoke-custom-window-dev\.sh/)
  assert.match(release, /backend.tests.test_rundeck_custom_window/)
  assert.match(release, /backend.tests.test_rundeck_network_trends/)
})

test('read-only smoke spans local and public Custom CPU/RAM/Network and historical evidence', () => {
  const smoke = read('ops/rundeck/smoke-custom-window-dev.sh')
  assert.match(smoke, /for label in local public/)
  assert.match(smoke, /for metric in cpu ram network_rx network_tx/)
  assert.match(smoke, /history\/window/)
  assert.match(smoke, /start <= at < end/)
  assert.match(smoke, /start <= observed < end/)
  assert.match(smoke, /CUSTOM_API_SMOKE=FAIL/)
  assert.doesNotMatch(smoke, /collect-now|POST |INSERT INTO /)
})

test('DEV infrastructure poller has bounded sequential request budget and actionable failure diagnostics', () => {
  const service = read('ops/rundeck/sphere-rundeck-infra-poller.service')
  const aopTest = read('ops/rundeck/sphere-rundeck-infra-aop-prod-test.service')
  const poller = read('backend/rundeck_infra_poller.py')
  const deploy = read('ops/rundeck/deploy-dev.sh')
  for (const unit of [service, aopTest]) {
    assert.match(unit, /Type=oneshot/)
    assert.match(unit, /TimeoutStartSec=180/)
    assert.match(unit, /LoadCredential=rundeck-reader:/)
    assert.match(unit, /IPAddressDeny=any/)
  }
  assert.match(poller, /INFRA_POLLER_PHASE=/)
  assert.match(poller, /_phase\("RUNDECK_LIST_START"/)
  assert.match(poller, /_phase\("RUNDECK_OUTPUT_START"/)
  assert.match(poller, /_phase\("PERSIST_START"/)
  assert.match(deploy, /start_oneshot_with_retry sphere-rundeck-infra-poller\.service 2 3/)
  assert.match(deploy, /journalctl -u "\$service"/)
  assert.match(deploy, /SERVICE FAILED/)
  assert.match(deploy, /DEPLOY FAILED - rolling back \/dev/)
})

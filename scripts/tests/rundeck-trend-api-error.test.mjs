import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { trendApiError } from '../../src/tools/components/rundeckTrendApiError.js'

const component = readFileSync(new URL('../../src/tools/components/RundeckServerTrend.jsx', import.meta.url), 'utf8')
const dialog = readFileSync(new URL('../../src/tools/components/RundeckCustomRangeDialog.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../../src/tools/components/RundeckCockpitHexV13512.css', import.meta.url), 'utf8')
const smoke = readFileSync(new URL('../../ops/rundeck/smoke-network-trends-dev.sh', import.meta.url), 'utf8')
const deploy = readFileSync(new URL('../../ops/rundeck/deploy-dev.sh', import.meta.url), 'utf8')
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))

test('FastAPI 422 rejected Network metric is labeled backend mismatch, not missing traffic', () => {
  const payload = { detail: [{ loc: ['query', 'metric'], type: 'string_pattern_mismatch' }] }
  assert.match(trendApiError(422, payload, 'network_rx'), /backend DEV/)
  assert.match(trendApiError(422, payload, 'network_tx'), /network_rx\/network_tx/)
  assert.doesNotMatch(trendApiError(422, payload, 'network_rx'), /No saved samples/)
})
test('422 on other parameters stays explicit and errors are sanitized', () => {
  assert.match(trendApiError(422, { detail: [{ loc: ['query', 'from_at'] }] }, 'cpu'), /from_at/)
  assert.match(trendApiError(422, { detail: [{ loc: ['query', 'metric'], msg: '<script>' }] }, 'cpu'), /parameter/)
  assert.doesNotMatch(trendApiError(422, { detail: [{ loc: ['query', 'metric'], msg: '<script>' }] }, 'cpu'), /<script>/)
  assert.match(trendApiError(503, null, 'network_rx'), /Infrastructure/)
  assert.match(trendApiError(500, null, 'network_rx'), /HTTP 500/)
})
test('Network selector moved to Technical header before the metric toolbar', () => {
  const header = component.indexOf('rundeckTechnicalTrendHeading')
  const direction = component.indexOf('aria-label="Network throughput direction"')
  const metric = component.indexOf('ariaLabel="Technical metric"')
  assert.ok(header >= 0 && header < direction && direction < metric)
  assert.match(styles, /\.rundeckTechnicalTrendHeading h3/)
  assert.match(styles, /flex-wrap:nowrap/)
})
test('Custom picker uses modal with focus trap and applied-range semantics', () => {
  assert.match(component, /<RundeckCustomRangeDialog/)
  assert.doesNotMatch(component, /className="rundeckCustomRangeForm"/)
  assert.match(dialog, /aria-modal="true"/)
  assert.match(dialog, /event\.key === 'Escape'/)
  assert.match(dialog, /event\.key !== 'Tab'/)
  assert.match(dialog, /document\.body\.style\.overflow = previousOverflow/)
  assert.match(dialog, /new range not applied/)
  assert.match(styles, /position:fixed;inset:0;z-index:15000/)
})
test('DEV release must smoke-check local and public Network RX/TX', () => {
  assert.match(smoke, /network_rx network_tx/)
  assert.match(smoke, /local public/)
  assert.match(smoke, /NETWORK_API_SMOKE=FAIL/)
  assert.match(deploy, /smoke-network-trends-dev\.sh/)
  assert.match(packageJson.scripts['qa:trend-focus'], /rundeck-trend-api-error\.test\.mjs/)
})

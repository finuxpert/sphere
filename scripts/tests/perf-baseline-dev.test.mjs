import assert from 'node:assert/strict'
import test from 'node:test'
import { SCENARIOS, parseOptions, percentile, summarize, measure } from '../perf-baseline-dev.mjs'

test('DEV-only target and bounded read-only sampling', () => {
  assert.equal(SCENARIOS.length, 9)
  assert.equal(parseOptions([]).baseUrl, 'http://127.0.0.1:8091')
  assert.throws(() => parseOptions(['--samples=100']), /between 1 and 30/)
  assert.throws(() => parseOptions(['--base-url=http://127.0.0.1:8092']), /PROD API port 8092/)
  assert.throws(() => parseOptions(['--base-url=http://127.0.0.1:8092/dev/api']), /PROD API port 8092/)
  assert.throws(() => parseOptions(['--base-url=https://sphere.astraotoparts.co.id/api', '--allow-remote']), /Only root/)
  assert.equal(parseOptions(['--base-url=https://sphere.astraotoparts.co.id/dev/api', '--allow-remote']).baseUrl,
    'https://sphere.astraotoparts.co.id/dev/api')
})

test('percentiles and errors preserve missing observations', () => {
  assert.equal(percentile([], .95), null)
  assert.equal(percentile([10, 20, 30], .95), 30)
  const out = summarize([
    { ok: true, status: 200, ms: 10, bytes: 1024 },
    { ok: true, status: 200, ms: 30, bytes: 2048 },
    { ok: false, status: 503, ms: 5, bytes: 0 },
  ])
  assert.equal(out.latency_ms.p95, 30)
  assert.equal(out.failed, 1)
  assert.deepEqual(out.statuses, { '200': 2, '503': 1 })
  assert.equal(summarize([]).latency_ms.p50, null)
})

test('each request is GET, warmup excluded', async () => {
  let calls = 0
  const fetchImpl = async (_, options) => {
    assert.equal(options.method, 'GET')
    calls += 1
    return { ok: calls !== 3, status: calls === 3 ? 503 : 200,
      arrayBuffer: async () => new ArrayBuffer(512) }
  }
  let time = 0
  const result = await measure('http://127.0.0.1:8091', SCENARIOS[0],
    { samples: 2, warmup: 1, delayMs: 0 }, fetchImpl, () => (time += 5))
  assert.equal(calls, 3)
  assert.equal(result.attempted, 2)
  assert.equal(result.succeeded, 1)
  assert.equal(result.failed, 1)
})

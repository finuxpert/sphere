import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { publishOnResolve } from '../../src/tools/components/rundeckProgressiveRefresh.js'

test('Monitoring publishes a fast response without waiting for slower sources', async () => {
  const committed = []
  let resolvePlatform
  const platform = new Promise((resolve) => { resolvePlatform = resolve })
  const pending = Promise.allSettled([
    publishOnResolve(platform, (value) => committed.push(value.kind)),
    publishOnResolve(Promise.resolve({ kind: 'hosts' }), (value) => committed.push(value.kind)),
  ])
  await Promise.resolve()
  assert.deepEqual(committed, ['hosts'], 'host evidence must not wait for platform health')
  resolvePlatform({ kind: 'platform' })
  const states = await pending
  assert.deepEqual(states.map((item) => item.status), ['fulfilled', 'fulfilled'])
  assert.deepEqual(committed, ['hosts', 'platform'])
})

test('one failing source is rejected without preventing another from publishing', async () => {
  const committed = []
  const states = await Promise.allSettled([
    publishOnResolve(Promise.reject(new Error('health unavailable')), () => {
      committed.push('unexpected')
    }),
    publishOnResolve(Promise.resolve({ source: 'hosts' }), (value) => {
      committed.push(value.source)
    }),
  ])
  assert.deepEqual(states.map((item) => item.status), ['rejected', 'fulfilled'])
  assert.deepEqual(committed, ['hosts'])
})

test('Monitoring uses server snapshots and does not launch manual LOG/DuckDB processing', () => {
  const source = readFileSync('src/tools/components/RundeckSource.jsx', 'utf8')
  const tool = readFileSync('src/tools/ToolLogAutoSphereV5.jsx', 'utf8')
  const loadLatest = source.slice(source.indexOf('const loadLatest ='), source.indexOf('const refreshMeta ='))
  assert.match(loadLatest, /setLatest\(collection\)/)
  assert.doesNotMatch(loadLatest, /\/raw|onCollection|\.blob\(\)/)
  assert.equal((source.match(/publishOnResolve\(json\(/g) || []).length, 6)
  assert.match(source, /setMetaRefreshFailed\(/)
  assert.match(source, /setHistoryRefreshFailed\(/)
  assert.match(source, /setAvailabilityRefreshFailed\(/)
  assert.match(tool, /source === 'automatic' && <RundeckSource \/>/)
  assert.doesNotMatch(tool, /<RundeckSource onCollection=/)
  assert.match(tool, /source === 'manual' && <label className="logV2Upload"/)
  assert.match(tool, /await rankResources\(nextAnalysis, nextRca\)/)
})

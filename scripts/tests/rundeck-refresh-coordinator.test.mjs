import test from 'node:test'
import assert from 'node:assert/strict'
import { coalesceAsyncRefresh } from '../../src/tools/components/rundeckRefreshCoordinator.js'

test('timer + collection_ready bursts serialize without stale response overlap', async () => {
  let release
  let calls = 0
  let active = 0
  let maxActive = 0
  let committed = 0
  const refresh = coalesceAsyncRefresh(async () => {
    const id = ++calls
    active++
    maxActive = Math.max(maxActive, active)
    if (id === 1) await new Promise(resolve => { release = resolve })
    committed = id
    active--
  })
  const first = refresh()
  assert.equal(calls, 1)
  await Promise.all([refresh(), refresh(), refresh()])
  assert.equal(calls, 1)
  release()
  await first
  assert.equal(calls, 2)
  assert.equal(committed, 2)
  assert.equal(maxActive, 1)
})
test('failed refresh frees lock and allows subsequent retry', async () => {
  let calls = 0
  const refresh = coalesceAsyncRefresh(async () => {
    calls++
    if (calls === 1) throw new Error('transient failure')
  })
  await assert.rejects(refresh(), /transient failure/)
  await refresh()
  assert.equal(calls, 2)
})
test('coordinator rejects non-function and does not start multiple workers', () => {
  assert.throws(() => coalesceAsyncRefresh(), TypeError)
})

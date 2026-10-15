import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { combineCurrentWorkloadResponses, validateAppWorkloadResponse } from '../../src/tools/components/rundeckCurrentWorkloadCoverage.js'

const observation = (host, i) => ({
  collection_id: 'rundeck-500', host, consumer_type: 'PROGRAM',
  consumer_key: 'Z_APP_' + host + '_' + i, collected_at: '2026-10-13T01:40:00Z',
  rank: i, cpu_pct: i,
})
const response = (host, n, total = n) => ({
  collection_id: 'rundeck-500', host, total, coverage_scope: 'ALL_OBSERVED_ACTIVE_WORKLOADS',
  items: Array.from({ length: n }, (_, i) => observation(host, i)),
})
test('per-APP queries can expose all 209 observations without a global top-50 cutoff', () => {
  const result = combineCurrentWorkloadResponses([
    response('AOPH1PAPPDC', 41), response('AOPH2PAPPDC', 42),
    response('AOPH3PAPPDC', 43), response('AOPH4PAPPDC', 40),
    response('AOPH5PAPPDC', 43),
  ], 'rundeck-500')
  assert.equal(result.items.length, 209)
  assert.equal(result.total, 209)
  assert.equal(result.complete, true)
  assert.equal(result.items.filter(row => row.host === 'AOPH5PAPPDC').length, 43)
})
test('server limit cannot silently mark an oversized APP complete', () => {
  const result = combineCurrentWorkloadResponses([response('AOPH1PAPPDC',100,130)], 'rundeck-500')
  assert.equal(result.complete,false)
  assert.equal(result.total,130)
})
test('mixing collections or APP identities fails closed', () => {
  assert.throws(() => combineCurrentWorkloadResponses([response('AOPH1PAPPDC', 1)], 'rundeck-501'), /collection/)
  const payload = response('AOPH1PAPPDC',1)
  payload.items[0].host = 'AOPH2PAPPDC'
  assert.throws(() => combineCurrentWorkloadResponses([payload], 'rundeck-500'), /APP/)
})
test('live UI requests host-scoped pages rather than silently searching only 50 rows', () => {
  const source = readFileSync(new URL('../../src/tools/components/RundeckCurrentWorkload.jsx', import.meta.url), 'utf8')
  assert.match(source, /hostKey\.split\(','\)/)
  assert.match(source, /combineCurrentWorkloadResponses/)
  assert.match(source, /host=\$\{encodeURIComponent\(host\)\}/)
  assert.match(source, /Search \$\{rows.length\} loaded jobs and programs/)
  assert.doesNotMatch(source, /sortedRows\.slice\(0, visibleLimit\)/)
})

test('live pagination measures space for pager rather than using only viewport buckets', () => {
  const src = readFileSync(new URL('../../src/tools/components/RundeckCurrentWorkload.jsx',import.meta.url),'utf8')
  const parent = readFileSync(new URL('../../src/tools/components/RundeckSource.jsx',import.meta.url),'utf8')
  assert.match(src,/workloadRowsThatFit\(/)
  assert.match(src,/tableWrapRef\.current/)
  assert.match(src,/reserveBelow: 44/)
  assert.match(parent,/layoutKey=\{/)
})

test('APP detail accepts only a consistent host and collection population', () => {
  const payload = response('AOPH1PAPPDC', 2)
  assert.equal(validateAppWorkloadResponse(payload, 'rundeck-500', 'aoph1pappdc'), true)
  assert.equal(validateAppWorkloadResponse(payload, 'rundeck-501', 'AOPH1PAPPDC'), false)
  assert.equal(validateAppWorkloadResponse(payload, 'rundeck-500', 'AOPH2PAPPDC'), false)
  assert.equal(validateAppWorkloadResponse({...payload, total: 1}, 'rundeck-500', 'AOPH1PAPPDC'), false)
  assert.equal(validateAppWorkloadResponse({...payload, total: null}, 'rundeck-500', 'AOPH1PAPPDC'), false)
  const wrongCollection = response('AOPH1PAPPDC', 2)
  wrongCollection.items[0].collection_id = 'rundeck-499'
  assert.equal(validateAppWorkloadResponse(wrongCollection, 'rundeck-500', 'AOPH1PAPPDC'), false)
  const wrongHost = response('AOPH1PAPPDC', 2)
  wrongHost.items[0].host = 'AOPH2PAPPDC'
  assert.equal(validateAppWorkloadResponse(wrongHost, 'rundeck-500', 'AOPH1PAPPDC'), false)
  const duplicated = response('AOPH1PAPPDC', 2)
  duplicated.items[1].consumer_key = duplicated.items[0].consumer_key
  assert.equal(validateAppWorkloadResponse(duplicated, 'rundeck-500', 'AOPH1PAPPDC'), false)
  assert.equal(validateAppWorkloadResponse({...payload, items: [{}]}, 'rundeck-500', 'AOPH1PAPPDC'), false)
})

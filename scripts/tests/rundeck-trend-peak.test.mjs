import test from 'node:test'
import assert from 'node:assert/strict'
import { savedTrendPeak, formatTrendPeakWib } from '../../src/tools/components/rundeckTrendPeak.js'

const source = Object.freeze({ unit: '%', bucket: '30m', items: Object.freeze([
  Object.freeze({ host: 'AOPH1PAPPDC', bucket: '2026-10-29T03:00:00Z', max_value: 92, avg_value: 40, peak_at: '2026-10-29T03:17:00Z' }),
  Object.freeze({ host: 'AOPH2PAPPDC', bucket: '2026-10-29T04:00:00Z', max_value: 97, avg_value: 60, peak_at: '2026-10-29T04:18:00Z' }),
  Object.freeze({ host: 'AOPH3PAPPDC', bucket: '2026-10-29T05:00:00Z', max_value: null, avg_value: null }),
]) })

test('peak is the highest saved observation with exact source timestamp', () => {
  assert.deepEqual(savedTrendPeak(source, 'max'), {
    host: 'APP2', value: 97, unit: '%', bucket: '2026-10-29T04:00:00Z',
    timestamp: '2026-10-29T04:18:00Z', exact: true,
  })
  assert.equal(formatTrendPeakWib('2026-10-29T04:18:00Z'), '29 Oct 2026, 11:18')
})
test('APP filter cannot borrow another APP peak', () => {
  assert.equal(savedTrendPeak(source, 'max', 'APP1').value, 92)
  assert.equal(savedTrendPeak(source, 'max', 'APP4'), null)
  assert.equal(savedTrendPeak(source, 'max', 'UNKNOWN'), null)
})
test('bucket time is labelled non-exact when peak_at is unavailable', () => {
  const peak = savedTrendPeak({ items:[{host:'APP1',bucket:'2026-10-29T04:00:00Z',max_value:50}] }, 'max')
  assert.equal(peak.exact,false)
  assert.equal(peak.timestamp,'2026-10-29T04:00:00Z')
})
test('average never claims exact peak time', () => {
  assert.equal(savedTrendPeak(source, 'avg').exact,false)
})

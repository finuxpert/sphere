import test from 'node:test'
import assert from 'node:assert/strict'
import {networkTrendScale} from '../../src/tools/components/rundeckNetworkScale.js'

test('Network Typical crops only visual axis, retaining precise peak provenance', () => {
  const rows=Array.from({length:110},(_,i)=>({
    host:'APP'+(i%5+1),bucket:'2026-10-27T03:00:00Z',
    peak_at:'2026-10-27T03:04:02Z',peak_interface:'eth0',
    max_value:30+i%160,avg_value:20+i%50,
  }))
  rows[47]={...rows[47],host:'APP3',max_value:8718.547,
    peak_at:'2026-10-26T05:54:45Z',peak_interface:'bond0'}
  const before=structuredClone(rows)
  const result=networkTrendScale(rows,'max')
  assert.ok(result.axisMax>0 && result.axisMax<8718.547)
  assert.equal(result.peak,8718.547)
  assert.equal(result.peakHost,'APP3')
  assert.equal(result.peakAt,'2026-10-26T05:54:45Z')
  assert.equal(result.peakInterface,'bond0')
  assert.ok(result.outliers>=1)
  assert.deepEqual(rows,before)
})

test('Network no spike and invalid or absent data do not force zoom', () => {
  const rows=Array.from({length:20},(_,i)=>({max_value:100+i%10}))
  assert.equal(networkTrendScale(rows,'max').axisMax,null)
  assert.equal(networkTrendScale(rows,'max').peak,109)
  assert.equal(networkTrendScale(rows,'avg').peak,null)
  assert.equal(networkTrendScale([{max_value:null},{max_value:''},{max_value:'bad'}]).axisMax,null)
  assert.equal(networkTrendScale([]).outliers,0)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTIVITY_RANGES, activityGapMs, validateActivityTrend, splitActivitySeries,
} from '../../src/tools/components/rundeckWorkloadActivityCharts.js'

function response(range) {
  const end = '2026-11-16T12:00:00.000001+00:00'
  return {
    range, start:'2026-11-09T12:00:00+00:00', end,
    source:'RCA-WP retained complete collections',
    coverage_scope:'ALL_OBSERVED_ACTIVE_WORKLOADS',
    snapshot_sampled: range !== '24h',
    sample_interval_minutes: range !== '24h' ? 60 : 0,
    complete_checks:1,activity_checks:1,wp_checks:1,
    items:[{
      collection_id:'verified',collected_at:'2026-11-16T12:00:00+00:00',
      jobs:7,programs:2,source_rows:9,observed_wp:3,
      wp:{DIA:1,BTC:1,UPD:1,ENQ:0,OTHER:0},
    }],
  }
}
test('all configured activity ranges can validate bounded observations',()=>{
  for(const range of ACTIVITY_RANGES) {
    const result=validateActivityTrend(response(range),range)
    assert.ok(result,range)
  }
  assert.equal(validateActivityTrend(response('7d'),'24h'),null)
  assert.equal(validateActivityTrend(response('garbage'),'garbage'),null)
})
test('long sampled windows permit bounded gaps without connecting missing days',()=>{
  const interval = activityGapMs({snapshot_sampled:true,sample_interval_minutes:60})
  const start=Date.parse('2026-11-16T00:00:00Z')
  const points=[0,1,2,6].map((hours,i)=>({
    collected_at:new Date(start+hours*3600_000).toISOString(),jobs:i+1
  }))
  const groups=splitActivitySeries(points,p=>p.jobs!==null,interval)
  assert.deepEqual(groups.map(group=>group.length),[3,1])
  assert.equal(activityGapMs({snapshot_sampled:false}),26*60_000)
})
test('reject unbounded sampled response or invalid sampling metadata',()=>{
  const wrong=response('7d')
  wrong.sample_interval_minutes=-1
  assert.equal(validateActivityTrend(wrong,'7d'),null)
  const huge=response('7d')
  huge.items=Array.from({length:301},(_,i)=>({
    ...huge.items[0],collection_id:String(i),collected_at:new Date(Date.parse(huge.start)+i*1000).toISOString()
  }))
  huge.complete_checks=301;huge.activity_checks=301;huge.wp_checks=301
  assert.equal(validateActivityTrend(huge,'7d'),null)
})

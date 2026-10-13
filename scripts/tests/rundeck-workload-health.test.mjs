import test from 'node:test'
import assert from 'node:assert/strict'
import { workloadHealthLevel, workloadHealthPreview } from '../../src/tools/components/rundeckWorkloadHealthState.js'

test('backend assessment, not grouped CPU >100%, determines red state',()=>{
  assert.equal(workloadHealthLevel({status:'NORMAL',avg_cpu_pct:199}), 'normal')
  assert.equal(workloadHealthLevel({status:'REVIEW REQUIRED',avg_cpu_pct:20}), 'review')
  for (const status of ['HIGH CPU','HIGH MEMORY','CPU SPIKE','INCREASING CPU','RECURRING']) {
    assert.equal(workloadHealthLevel({status}), 'attention')
  }
  for (const status of ['INSUFFICIENT DATA','UNKNOWN','']) {
    assert.equal(workloadHealthLevel({status}), 'unknown')
  }
})
test('30 ranked honeycomb hexagons retain the full independent backend counts',()=>{
  const report={summary:{workloads:204,review_required:31},quality:{confidence:'HIGH'},
    end:'2026-10-13T03:00:00Z',items:Array.from({length:100},(_,i)=>({
      consumer_type:'PROGRAM',consumer_key:'Z'+i,status:i<31?'REVIEW REQUIRED':'NORMAL',
    }))}
  const preview=workloadHealthPreview(report)
  assert.equal(preview.total,204)
  assert.equal(preview.reviewRequired,31)
  assert.equal(preview.sample.length,30)
  assert.ok(preview.sample.every(item=>item.level==='review'))
  assert.equal(preview.limited,false)
})
test('low confidence and malformed backend summary are not presented as all-green',()=>{
  assert.equal(workloadHealthPreview({summary:{workloads:10,review_required:11},items:[]}),null)
  assert.equal(workloadHealthPreview({summary:{workloads:10},items:[]}),null)
  assert.equal(workloadHealthPreview({summary:{workloads:10,review_required:0},items:[]}),null)
  const report={summary:{workloads:1,review_required:0},quality:{confidence:'LOW'},items:[{status:'NORMAL'}]}
  assert.equal(workloadHealthPreview(report).limited,true)
  assert.equal(workloadHealthPreview(report).sample[0].level,'normal')
})

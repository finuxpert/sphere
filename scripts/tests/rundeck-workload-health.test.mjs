import test from 'node:test'
import assert from 'node:assert/strict'
import { allocateWorkloadHexagons, workloadHealthLevel, workloadHealthPreview } from '../../src/tools/components/rundeckWorkloadHealthState.js'

test('grouped multicore CPU above 100 percent never independently marks a workload red', () => {
  assert.equal(workloadHealthLevel({status:'NORMAL',avg_cpu_pct:199}), 'normal')
  assert.equal(workloadHealthLevel({status:'REVIEW REQUIRED',avg_cpu_pct:20}), 'review')
  for (const status of ['HIGH CPU','HIGH MEMORY','CPU SPIKE','INCREASING CPU','RECURRING']) {
    assert.equal(workloadHealthLevel({status}), 'attention')
  }
  for (const status of ['INSUFFICIENT DATA','UNKNOWN','']) assert.equal(workloadHealthLevel({status}), 'unknown')
})

test('30 hexagons reflect full 388 workload population rather than top-ranked rows', () => {
  const health = {review:13,attention:61,unknown:24,normal:290}
  const report = {summary:{workloads:388,review_required:13,health},
    quality:{confidence:'HIGH'},end:'2026-10-13T03:00:00Z',
    items:Array.from({length:100},(_,i)=>({status:i<13?'REVIEW REQUIRED':'HIGH CPU'}))}
  const preview = workloadHealthPreview(report)
  assert.equal(preview.total,388)
  assert.equal(preview.reviewRequired,13)
  assert.equal(preview.hexagons.length,30)
  assert.ok(preview.hexagons.filter(x=>x==='review').length <= 2)
  assert.ok(preview.hexagons.filter(x=>x==='normal').length >= 20)
  assert.equal(preview.hexagons.filter(x=>x==='attention').length,5)
  assert.equal(preview.limited,false)
})

test('invalid/missing status population is unverified, not green', () => {
  assert.equal(workloadHealthPreview({summary:{workloads:10,review_required:0},items:[]}),null)
  assert.equal(workloadHealthPreview({summary:{workloads:10,review_required:11,health:{review:11,attention:0,normal:0,unknown:0}},items:[]}),null)
  assert.equal(workloadHealthPreview({summary:{workloads:10,review_required:0,health:{review:0,attention:0,normal:4,unknown:0}},items:[]}),null)
  const report={summary:{workloads:1,review_required:0,health:{review:0,attention:0,normal:1,unknown:0}},
    quality:{confidence:'LOW'},items:[]}
  assert.equal(workloadHealthPreview(report).limited,true)
  assert.deepEqual(allocateWorkloadHexagons(report.summary.health,1),Array(30).fill('normal'))
  assert.deepEqual(allocateWorkloadHexagons({review:0,attention:0,normal:0,unknown:0},0),[])
})

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

import { validatedWorkloadDots } from '../../src/tools/components/rundeckWorkloadHealthState.js'

test('individual dots require exact backend pages, collection window and matching population', () => {
  const rows=Array.from({length:394},(_,index)=>({
    consumer_type:index%2?'JOB':'PROGRAM',consumer_key:'Z_WORKLOAD_'+index,
    status:index<11?'REVIEW REQUIRED':index<214?'HIGH CPU':'NORMAL',avg_cpu_pct:20+index
  }))
  const health={review:11,attention:203,normal:180,unknown:0}
  const page=(offset,items=rows.slice(offset,offset+100))=>({
    summary:{workloads:394,review_required:11,health},items,
    start:'2026-10-12T06:00:00Z',end:'2026-10-13T06:00:00Z',
    page:{offset,limit:100,returned:items.length,total:394,scope:'FULL_EVALUATED_POPULATION',health:'ALL'}
  })
  const first=page(0),others=[page(100),page(200),page(300)]
  const validated=validatedWorkloadDots(first,others,0,400)
  assert.equal(validated.rows.length,394)
  assert.equal(validated.rows.filter(row=>workloadHealthLevel(row)==='review').length,11)
  assert.equal(validated.rows.find(row=>row.consumer_key==='Z_WORKLOAD_10')?.status,'REVIEW REQUIRED')
  assert.equal(validatedWorkloadDots(first,[page(100),{...page(200),end:'different'},page(300)],0,400),null)
  assert.equal(validatedWorkloadDots(first,[page(100),page(200)],0,400),null)
  assert.equal(validatedWorkloadDots(first,[page(100),{...page(200),page:{...page(200).page,total:393}},page(300)],0,400),null)
  assert.equal(validatedWorkloadDots(first,[page(100),page(100),page(300)],0,400),null)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { workloadHealthLevel, workloadHealthPreview, validatedWorkloadDots } from '../../src/tools/components/rundeckWorkloadHealthState.js'

test('grouped multicore CPU above 100 percent never independently marks a workload red', () => {
  assert.equal(workloadHealthLevel({status:'NORMAL',avg_cpu_pct:199}), 'normal')
  assert.equal(workloadHealthLevel({status:'REVIEW REQUIRED',avg_cpu_pct:20}), 'review')
  for (const status of ['HIGH CPU','HIGH MEMORY','CPU SPIKE','INCREASING CPU','RECURRING']) {
    assert.equal(workloadHealthLevel({status}), 'attention')
  }
  for (const status of ['INSUFFICIENT DATA','UNKNOWN','']) assert.equal(workloadHealthLevel({status}), 'unknown')
})

test('full 388 workload population has verified server counts, never first-100 estimates', () => {
  const health = {review:13,attention:61,unknown:24,normal:290}
  const report = {summary:{workloads:388,review_required:13,health},
    quality:{confidence:'HIGH'},end:'2026-10-13T03:00:00Z',
    items:Array.from({length:100},(_,i)=>({status:i<13?'REVIEW REQUIRED':'HIGH CPU'}))}
  const preview = workloadHealthPreview(report)
  assert.equal(preview.total,388)
  assert.equal(preview.reviewRequired,13)
  assert.equal(preview.health.review,13)
  assert.equal(preview.health.attention,61)
  assert.equal(preview.health.normal,290)
  assert.equal(preview.limited,false)
})

test('invalid/missing status population is unverified, not green', () => {
  assert.equal(workloadHealthPreview({summary:{workloads:10,review_required:0},items:[]}),null)
  assert.equal(workloadHealthPreview({summary:{workloads:10,review_required:11,health:{review:11,attention:0,normal:0,unknown:0}},items:[]}),null)
  assert.equal(workloadHealthPreview({summary:{workloads:10,review_required:0,health:{review:0,attention:0,normal:4,unknown:0}},items:[]}),null)
  const report={summary:{workloads:1,review_required:0,health:{review:0,attention:0,normal:1,unknown:0}},
    quality:{confidence:'LOW'},items:[]}
  assert.equal(workloadHealthPreview(report).limited,true)
  assert.equal(workloadHealthPreview(report).health.normal,1)
  assert.equal(workloadHealthPreview({summary:{workloads:0,review_required:0,health:{review:0,attention:0,normal:0,unknown:0}},items:[]}).total,0)
})


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
  const empty={summary:{workloads:0,review_required:0,health:{review:0,attention:0,normal:0,unknown:0}},
    items:[],page:{offset:0,limit:100,returned:0,total:0,scope:'FULL_EVALUATED_POPULATION',health:'ALL'}}
  assert.deepEqual(validatedWorkloadDots(empty,[],0,400)?.rows,[])
})

test('401 saved workloads fit in one validated hexagon population without page 2', () => {
  const rows=Array.from({length:401},(_,index)=>({
    consumer_type:'JOB', consumer_key:'Z_VALID_'+index,
    status:index<10?'REVIEW REQUIRED':index<218?'HIGH CPU':index<295?'NORMAL':'UNKNOWN'
  }))
  const health={review:10,attention:208,normal:77,unknown:106}
  const page=offset=>({
    summary:{workloads:401,review_required:10,health},items:rows.slice(offset,offset+100),
    start:'2026-10-12T11:41:00Z',end:'2026-10-13T11:41:00Z',
    page:{offset,limit:100,returned:rows.slice(offset,offset+100).length,total:401,
      scope:'FULL_EVALUATED_POPULATION',health:'ALL'}
  })
  const first=page(0)
  const full=validatedWorkloadDots(first,[page(100),page(200),page(300),page(400)],0,500)
  assert.equal(full?.rows.length,401)
  assert.equal(full?.pageIndex,0)
  assert.equal(full?.preview.health.attention,208)
  assert.equal(validatedWorkloadDots(first,[page(100),page(200),page(300)],0,500),null)
  assert.equal(validatedWorkloadDots(first,[page(100),page(200),page(300),page(300)],0,500),null)
})

test('coverage uses full 1D population and keeps unknown separate from SAP execution', () => {
  const report={summary:{workloads:406,review_required:8,
    health:{review:8,attention:201,unknown:130,normal:67}},
    quality:{confidence:'HIGH'},items:[]}
  const preview=workloadHealthPreview(report)
  assert.equal(preview.classified,276)
  assert.equal(preview.unknownSharePct,32)
  assert.equal(preview.reviewRequired,8)
  assert.equal(workloadHealthPreview({summary:{workloads:0,review_required:0,
    health:{review:0,attention:0,unknown:0,normal:0}},items:[]}).unknownSharePct,0)
})

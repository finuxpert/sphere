import assert from 'node:assert/strict'
import test from 'node:test'
import {
  reportAvailabilityWindow, summarizeReportAvailability,
  unavailableReportAvailability, REPORT_APPS,
} from '../../src/tools/components/rundeckReportAvailability.js'

const window=reportAvailabilityWindow('2026-10',{weekStart:'2026-10-26'},new Date('2026-11-06T09:00:00Z'))
const history=(items=[],extra={})=>({
  range:'custom',category:'SAP_APP',observation_semantics:'OBSERVED_AVAILABILITY',
  range_started_at:window.startUtc,window_end:window.endUtc,
  expected_cadence_seconds:600,gap_threshold_seconds:1320,
  observation_gaps:[],coverage_limited:false,items,...extra,
})
const check=(host,status,bucket,id)=>({
  host,status,bucket,execution_id:id,avg_value:status==='UP'?100:0,
})
test('weekly WIB bounds are exclusive and use existing custom availability endpoint',()=>{
  assert.equal(window.startUtc,'2026-10-25T17:00:00.000Z')
  assert.equal(window.endUtc,'2026-11-01T17:00:00.000Z')
  assert.equal(window.params.get('range'),'custom')
  assert.equal(window.params.get('category'),'SAP_APP')
  assert.equal(window.partial,false)
})
test('full and partial five-APP checks have explicit latest states and check rates only',()=>{
  const nearEnd='2026-11-01T16:55:00Z'
  const historyRows=[
    ...REPORT_APPS.map((name,i)=>check(name,i===4?'DOWN':'UP',nearEnd,'last')),
    check('APP5','UP','2026-11-01T16:45:00Z','before'),
    check('APP1','DOWN','2026-11-01T16:40:00Z','before'),
    check('APP1','UP',nearEnd,'last'), // duplicate execution+APP must not add samples
  ]
  const model=summarizeReportAvailability(history(historyRows),window)
  assert.equal(model.sourceStatus,'OK')
  assert.equal(model.rows[0].status,'AVAILABLE')
  assert.equal(model.rows[0].checkRatePct,50)
  assert.equal(model.rows[4].status,'UNAVAILABLE')
  assert.equal(model.rows[4].checkRatePct,50)
  assert.equal(model.rows[1].status,'AVAILABLE')
  assert.equal(model.totalChecks,7)
  assert.ok(!Object.hasOwn(model.rows[0],'uptimePct'))
})
test('missing APP observations are UNKNOWN, not DOWN',()=>{
  const model=summarizeReportAvailability(history([
    check('APP2','UP','2026-11-01T16:55:00Z','one')]),window)
  assert.equal(model.rows[0].status,'UNKNOWN')
  assert.equal(model.rows[0].checks,0)
  assert.equal(model.rows[1].status,'AVAILABLE')
})
test('completely empty month is explicitly UNKNOWN with zero evidence',()=>{
  const monthly=reportAvailabilityWindow('2026-10',{},new Date('2026-11-06T09:00:00Z'))
  const model=summarizeReportAvailability({...history([]),
    range_started_at:monthly.startUtc,window_end:monthly.endUtc},monthly)
  assert.equal(model.totalChecks,0)
  assert.equal(model.rows.every(row=>row.status==='UNKNOWN'),true)
  assert.equal(model.lastAt,null)
})
test('old UP/DOWN observations become STALE, never present-day SAP DOWN',()=>{
  const model=summarizeReportAvailability(history([
    check('APP1','DOWN','2026-10-27T00:00:00Z','old'),
    check('APP2','UP','2026-10-27T00:00:00Z','old'),
  ],{observation_gaps:[{kind:'NO_OBSERVATION'}],coverage_limited:true}),window)
  assert.equal(model.rows[0].status,'STALE')
  assert.equal(model.rows[1].status,'STALE')
  assert.equal(model.gapCount,1)
  assert.equal(model.coverageLimited,true)
})
test('endpoint failure is explicit, and period/source mismatch fails closed',()=>{
  const missing=unavailableReportAvailability(window,'HTTP 503')
  assert.equal(missing.sourceStatus,'ERROR')
  assert.equal(missing.rows.every(row=>row.status==='UNKNOWN'),true)
  assert.throws(()=>summarizeReportAvailability(history([],{category:'SSH'}),window),/does not match/)
  assert.throws(()=>summarizeReportAvailability(history([],{window_end:'2026-11-01T16:00:00Z'}),window),/does not match/)
})
test('ongoing November is capped at now; no future service checks are evaluated',()=>{
  const current=reportAvailabilityWindow('2026-11',{},new Date('2026-11-06T09:30:00Z'))
  assert.equal(current.partial,true)
  assert.equal(current.endUtc,'2026-11-06T09:30:00.000Z')
})

test('192 positive historical checks per APP still mean incomplete weekly coverage',()=>{
  // Based on observed 26 Oct - 1 Nov audit timestamps, synthetic execution IDs.
  const first=Date.parse('2026-10-26T00:00:00Z')
  const last=Date.parse('2026-10-31T09:00:00Z')
  const items=[]
  for(let i=0;i<192;i++){
    const when=new Date(first+Math.round(i*(last-first)/191)).toISOString()
    for(const host of REPORT_APPS) items.push(check(host,'UP',when,String(i)))
  }
  const model=summarizeReportAvailability(history(items,{
    expected_cadence_seconds:2400,gap_threshold_seconds:5280,
    observation_gaps:[],coverage_limited:false, // simulate older API lacking tail check
  }),window)
  assert.equal(model.totalChecks,960)
  assert.ok(model.rows.every(row=>row.checks===192 && row.up===192))
  assert.ok(model.rows.every(row=>row.status==='STALE'))
  assert.equal(model.coverageLimited,true)
  assert.equal(model.leadingGapSeconds,7*3600)
  assert.equal(model.trailingGapSeconds,32*3600)
  assert.ok(!Object.hasOwn(model,'uptimePct'))
})

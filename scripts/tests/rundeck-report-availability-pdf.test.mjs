import assert from 'node:assert/strict'
import test from 'node:test'
import { monthlyEnterpriseReportModel, buildManagementMonthlyPdf } from '../../src/tools/components/rundeckMonthlyEnterprisePdf.js'
import { reportAvailabilityWindow, summarizeReportAvailability, unavailableReportAvailability } from '../../src/tools/components/rundeckReportAvailability.js'

function fixture(weekStart=null,sourceError=false) {
  const month='2026-10'
  const avWindow=reportAvailabilityWindow(month,weekStart?{weekStart}:{},new Date('2026-11-06T09:00:00Z'))
  const av=sourceError
    ? unavailableReportAvailability(avWindow,'HTTP 503')
    : summarizeReportAvailability({
      range:'custom',category:'SAP_APP',observation_semantics:'OBSERVED_AVAILABILITY',
      range_started_at:avWindow.startUtc,window_end:avWindow.endUtc,
      expected_cadence_seconds:600,gap_threshold_seconds:1320,
      observation_gaps:[],coverage_limited:false,
      items:[
        {host:'APP1',status:'UP',bucket:new Date(Date.parse(avWindow.endUtc)-300000).toISOString(),execution_id:'one'},
        {host:'APP2',status:'DOWN',bucket:new Date(Date.parse(avWindow.endUtc)-300000).toISOString(),execution_id:'one'},
      ]
    },avWindow)
  return {
    month,period:weekStart?'week':'month',...(weekStart?{week_start:weekStart}:{}),
    quality:{coverage_pct:60},summary:{workloads:0},monthly_errors:{status:'ERROR_SOURCE_NOT_RETAINED'},
    monthly_pressure:{hosts:[],daily_hosts:[],thresholds:{}},
    monthly_top_wp_cpu:[],monthly_top_wp_pss:[],monthly_abap_candidates:[],
    monthly_storage:{month,period:weekStart?'week':'month',
      ...(weekStart?{week_start:weekStart}:{}),
      items:['File System OS','FS SAP Archive','Archive INTF','INTF']
        .map(category=>({category,status:'NOT_COLLECTED'}))},
    monthly_availability:av,
  }
}
for(const scope of [null,'2026-10-26']){
  const label=scope?'Weekly':'Monthly'
  test(label+' A3 PDF includes five APP availability evidence without invented uptime',async()=>{
    const data=fixture(scope)
    const m=monthlyEnterpriseReportModel('2026-10',data)
    assert.equal(m.availability.rows.length,5)
    const pdf=await buildManagementMonthlyPdf({month:'2026-10',data,format:'a3',returnInstance:true})
    assert.equal(pdf.internal.getNumberOfPages(),1)
    assert.ok(Math.abs(pdf.internal.pageSize.getWidth()-1190.55)<.4)
    assert.ok(Math.abs(pdf.internal.pageSize.getHeight()-841.89)<.4)
    const stream=pdf.internal.pages[1].join('\n')
    for(const token of ['SAP Availability','Observed Service Checks','APP1','APP5',
      'AVAILABLE','UNAVAILABLE','UNKNOWN','UP checks','port-check observations']){
      assert.ok(stream.includes(token),'Missing '+label+' A3 PDF content: '+token)
    }
    assert.ok(!stream.includes('100% uptime'))
  })
  test(label+' A3 reports source errors explicitly instead of projecting SAP DOWN',async()=>{
    const data=fixture(scope,true)
    const pdf=await buildManagementMonthlyPdf({month:'2026-10',data,format:'a3',returnInstance:true})
    const stream=pdf.internal.pages[1].join('\n')
    assert.ok(stream.includes('SOURCE UNAVAILABLE'))
    assert.ok(stream.includes('UNKNOWN'))
  })
}
test('wrong period Availability blocks export rather than mixing evidence',async()=>{
  const data=fixture('2026-10-26')
  data.monthly_availability={...data.monthly_availability,startUtc:'2026-10-01T00:00:00Z'}
  await assert.rejects(buildManagementMonthlyPdf({month:'2026-10',data,format:'a3'}),/another reporting period/)
})
test('16:9 remains one slide with the compact SAP check header',async()=>{
  const data=fixture('2026-10-26')
  const pdf=await buildManagementMonthlyPdf({month:'2026-10',data,returnInstance:true})
  assert.equal(pdf.internal.getNumberOfPages(),1)
  assert.ok(pdf.internal.pages[1].join('\n').includes('SAP Availability'))
})

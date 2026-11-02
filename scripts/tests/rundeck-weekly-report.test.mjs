import assert from 'node:assert/strict'
import test from 'node:test'
import { buildManagementMonthlyPdf, monthlyEnterpriseReportModel } from '../../src/tools/components/rundeckMonthlyEnterprisePdf.js'

const weekStart='2026-10-26'
const month='2026-10'
const example={
  period:'week',month,week_start:weekStart,
  quality:{complete_checks:15,expected_checks:30,coverage_pct:50},
  monthly_errors:{status:'ERROR_SOURCE_NOT_RETAINED'},
  monthly_pressure:{hosts:[],daily_hosts:[
    {host:'AOPH1PAPPDC',day:'2026-10-25',peak_cpu_pct:100,peak_cpu_at:'2026-10-25T11:00:00Z'},
    {host:'AOPH1PAPPDC',day:'2026-10-26',peak_cpu_pct:83,peak_cpu_at:'2026-10-26T11:00:00Z'},
    {host:'AOPH1PAPPDC',day:'2026-10-31',peak_cpu_pct:90,peak_cpu_at:'2026-10-31T11:00:00Z'},
    {host:'AOPH1PAPPDC',day:'2026-11-01',peak_cpu_pct:95,peak_cpu_at:'2026-11-01T11:00:00Z'},
    {host:'AOPH1PAPPDC',day:'2026-11-02',peak_cpu_pct:98,peak_cpu_at:'2026-11-02T11:00:00Z'},
  ]},
  monthly_abap_candidates:[],
  monthly_top_wp_cpu:[],monthly_top_wp_pss:[],
  monthly_storage:{month,week_start:weekStart,period:'week',items:[]},
}

test('weekly model uses seven calendar days in WIB even when the week crosses two months',()=>{
  const report=monthlyEnterpriseReportModel(month,example)
  assert.equal(report.days,7)
  assert.deepEqual([report.dates[0],report.dates[6]],['2026-10-26','2026-11-01'])
  assert.equal(report.cpuPeak.value,95)
  assert.equal(report.cpuPeak.host,'APP1')
  assert.equal(report.series[0].days[0].cpu,83)
  assert.equal(report.series[0].days[1].cpu,null)
  assert.equal(report.series[0].days[6].cpu,95)
  assert.equal(report.daily.length,7)
})

test('weekly management PDF is A3 landscape and has the weekly title and exact bounds',async()=>{
  const pdf=await buildManagementMonthlyPdf({month,data:example,returnInstance:true})
  assert.equal(pdf.internal.getNumberOfPages(),1)
  const stream=pdf.internal.pages.slice(1).flat().join('\n')
  assert.ok(stream.includes('SAP Weekly Performance Report'))
  assert.ok(stream.includes('2026-10-26 to 2026-11-01 (WIB)'))
  assert.ok(!stream.includes('SAP Monthly Performance Report'))
})

test('weekly reporting rejects wrong-week storage and invalid weeks',()=>{
  assert.throws(()=>monthlyEnterpriseReportModel(month,{
    ...example,monthly_storage:{month,items:[]},
  }),/Period-scoped/)
  assert.throws(()=>monthlyEnterpriseReportModel(month,{
    ...example,week_start:'2026-10-27',
  }),/Invalid weekly/)
  assert.throws(()=>monthlyEnterpriseReportModel(month,{
    ...example,period:'month',
  }),/Invalid weekly/)
})

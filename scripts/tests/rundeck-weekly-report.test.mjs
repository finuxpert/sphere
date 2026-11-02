import assert from 'node:assert/strict'
import test from 'node:test'
import { buildManagementMonthlyPdf, monthlyEnterpriseReportModel } from '../../src/tools/components/rundeckMonthlyEnterprisePdf.js'

const weekStart='2026-10-26'
const month='2026-10'
const example={
  period:'week',month,week_start:weekStart,
  quality:{complete_checks:15,expected_checks:30,coverage_pct:50},
  monthly_errors:{status:'ERROR_SOURCE_NOT_RETAINED'},
  monthly_pressure:{thresholds:{cpu_warning_pct:75,ram_warning_pct:80},hosts:[],daily_hosts:[
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
  assert.ok(stream.includes('26 Oct 2026 - 01 Nov 2026'))
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

test('custom report keeps only dates in an inclusive cross-month window',()=>{
  const data={...example,period:'custom',week_start:null,
    start_date:'2026-10-30',end_date:'2026-11-01',
    monthly_storage:{month,period:'custom',week_start:null,
      start_date:'2026-10-30',end_date:'2026-11-01',items:[]},
  }
  const m=monthlyEnterpriseReportModel(month,data)
  assert.equal(m.days,3)
  assert.deepEqual(m.dates,['2026-10-30','2026-10-31','2026-11-01'])
  assert.equal(m.cpuPeak.value,95)
  assert.equal(m.series[0].days[0].cpu,null)
  assert.equal(m.series[0].days[1].cpu,90)
  assert.equal(m.series[0].days[2].cpu,95)
})

test('one-day custom report remains one landscape A3 PDF',async()=>{
  const data={...example,period:'custom',week_start:null,
    start_date:'2026-10-31',end_date:'2026-10-31',
    monthly_storage:{month,period:'custom',week_start:null,
      start_date:'2026-10-31',end_date:'2026-10-31',items:[]},
  }
  const pdf=await buildManagementMonthlyPdf({month,data,returnInstance:true})
  assert.equal(pdf.internal.getNumberOfPages(),1)
  const stream=pdf.internal.pages.slice(1).flat().join('\n')
  assert.ok(stream.includes('SAP Custom Performance Report'))
  assert.ok(stream.includes('31 Oct 2026 - 31 Oct 2026'))
})

test('custom export refuses wrong date scopes, reversed dates and over 31 days',()=>{
  const data={...example,period:'custom',week_start:null,
    start_date:'2026-10-01',end_date:'2026-10-31',
    monthly_storage:{month,period:'custom',week_start:null,
      start_date:'2026-10-01',end_date:'2026-10-31',items:[]},
  }
  assert.equal(monthlyEnterpriseReportModel(month,data).days,31)
  assert.throws(()=>monthlyEnterpriseReportModel(month,{
    ...data,end_date:'2026-11-01',
  }),/Invalid custom/)
  assert.throws(()=>monthlyEnterpriseReportModel(month,{
    ...data,end_date:'2026-09-30',
  }),/Invalid custom/)
  assert.throws(()=>monthlyEnterpriseReportModel(month,{
    ...data,monthly_storage:{...data.monthly_storage,end_date:'2026-10-30'},
  }),/Period-scoped/)
  assert.throws(()=>monthlyEnterpriseReportModel(month,{
    ...data,week_start:'2026-10-26',
  }),/Invalid custom/)
})

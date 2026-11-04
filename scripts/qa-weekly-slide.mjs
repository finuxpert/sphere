#!/usr/bin/env node
/** Standalone source-backed contract fixture for Weekly 16:9 and cross-month scope.
 * All values are synthetic QA fixtures; this script does not query SAP production.
 */
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {buildManagementMonthlyPdf,monthlyEnterpriseReportModel} from '../src/tools/components/rundeckMonthlyEnterprisePdf.js'

const month='2026-10'
const week_start='2026-10-26'
const rows=Array.from({length:5},(_,i)=>({
  consumer_type:'PROGRAM',
  consumer_key:i===0?'ZCL_MONTH_END_LONG_ABAP_PROGRAM_NAME==========CP':'Z_WEEKLY_TEST_'+String(i+1).padStart(2,'0'),
  hosts:['AOPH1PAPPDC'],
  observations:i+2,peak_cpu_pct:600-i*60,peak_pss_gb:12-i,
  last_seen:'2026-11-01T16:30:00Z',
  signals:{sustained_high_cpu:true},
}))
const data={
  month,period:'week',week_start,summary:{},
  quality:{coverage_pct:98.6,complete_checks:98,expected_checks:100},
  monthly_errors:{status:'ERROR_SOURCE_NOT_RETAINED'},
  monthly_pressure:{
    hosts:Array.from({length:5},(_,i)=>({
      host:'AOPH'+(i+1)+'PAPPDC',avg_cpu_pct:12+i,peak_cpu_pct:60+i,
      avg_ram_pct:26+i,peak_ram_pct:40+i,
      cpu_warning_host_checks:0,ram_warning_host_checks:0,
    })),
    thresholds:{cpu_warning_pct:75,ram_warning_pct:80},
    daily_hosts:[
      {day:'2026-10-26',host:'AOPH1PAPPDC',peak_cpu_pct:55,peak_ram_pct:34,
        peak_cpu_at:'2026-10-26T06:00:00Z',peak_ram_at:'2026-10-26T06:00:00Z'},
      {day:'2026-10-29',host:'AOPH4PAPPDC',peak_cpu_pct:87.7,peak_ram_pct:37,
        peak_cpu_at:'2026-10-29T06:00:00Z',peak_ram_at:'2026-10-29T06:00:00Z'},
      {day:'2026-11-01',host:'AOPH3PAPPDC',peak_cpu_pct:42,peak_ram_pct:59.4,
        peak_cpu_at:'2026-11-01T16:00:00Z',peak_ram_at:'2026-11-01T16:00:00Z'},
    ],
  },
  monthly_top_wp_cpu:[...rows].reverse(),
  monthly_top_wp_pss:[...rows].reverse(),
  monthly_abap_candidates:rows,
  monthly_storage:{month,week_start,period:'week',items:[
    {category:'File System OS',status:'COLLECTED',host:'AOPH1PAPPDC',mount_point:'/',
      total_bytes:100e9,used_bytes:70e9,free_bytes:30e9,used_pct:70,
      sample_at:'2026-11-01T16:59:59Z'},
    ...['FS SAP Archive','Archive INTF','INTF'].map(category=>({category,status:'NOT_COLLECTED'})),
  ]},
}
const model=monthlyEnterpriseReportModel(month,data)
assert.equal(model.observedDays,3)
assert.equal(model.days,7)
assert.deepEqual([model.dates[0],model.dates[6]],['2026-10-26','2026-11-01'])
assert.equal(model.sortedCpu.length,5)
assert.equal(model.sortedPss.length,5)
assert.equal(model.candidates.length,5)
assert.equal(model.period.startUtc,'2026-10-25T17:00:00.000Z')
assert.equal(model.period.exclusiveEndUtc,'2026-11-01T17:00:00.000Z')

const pdf=await buildManagementMonthlyPdf({month,data,returnInstance:true})
assert.equal(pdf.internal.getNumberOfPages(),1)
assert.ok(Math.abs(pdf.internal.pageSize.getWidth()-960)<.25)
assert.ok(Math.abs(pdf.internal.pageSize.getHeight()-540)<.25)
const stream=pdf.internal.pages[1].join('\n')
for(const label of ['SAP Weekly Performance Report','Period: 26 Oct 2026 - 01 Nov 2026',
  '29 Oct 2026, 13:00 WIB','01 Nov 2026, 23:00 WIB','Top 5 Workloads by Peak WP CPU',
  'Top 5 Workloads by Peak WP Memory','Top 5 Tuning Candidates',
  'Application Server Performance','Storage Capacity','01 Nov, 23:59 WIB']) {
  assert.ok(stream.includes(label),'Missing Weekly 16:9 PDF label: '+label)
}
assert.ok(!stream.includes('Top 10 Tuning Candidates'))
const out=join(process.env.RUNNER_TEMP||tmpdir(),'sphere-weekly-management-16x9-qa.pdf')
writeFileSync(out,Buffer.from(pdf.output('arraybuffer')))
console.log('WEEKLY_SLIDE_QA=PASS size=960x540 pages=1 days='+model.observedDays+'/'+model.days+' output='+out)

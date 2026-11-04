import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildManagementMonthlyPdf, monthlyEnterpriseReportModel } from '../../src/tools/components/rundeckMonthlyEnterprisePdf.js'
import { monthlyReportPeriod, reportPeakEvidenceWib } from '../../src/tools/components/rundeckMonthlyPeriod.js'

const window=monthlyReportPeriod('2026-10')
test('October calendar window is exact WIB midnight to exclusive next-month midnight',()=>{
  assert.equal(window.start,'2026-10-01')
  assert.equal(window.end,'2026-10-31')
  assert.equal(window.startUtc,'2026-09-30T17:00:00.000Z')
  assert.equal(window.exclusiveEndUtc,'2026-10-31T17:00:00.000Z')
  assert.equal(window.label,'Period: 01–31 October 2026 (WIB)')
  assert.equal(window.days,31)
  assert.equal(monthlyReportPeriod('2028-02').days,29)
  assert.throws(()=>monthlyReportPeriod('2026-13'),/Invalid/)
})

const rows=Array.from({length:10},(_,i)=>({
  consumer_type:'PROGRAM',consumer_key:'ZWORK_'+String(i+1).padStart(2,'0'),
  peak_cpu_pct:(i+1)*100,peak_pss_gb:11-i,
  observations:5,hosts:['AOPH1PAPPDC'],last_seen:'2026-10-09T08:00:00Z',
  signals:{sustained_high_cpu:true}
}))
const data={
  month:'2026-10',period:'month',
  quality:{coverage_pct:61.2},summary:{},
  monthly_errors:{status:'ERROR_SOURCE_NOT_RETAINED'},
  monthly_pressure:{hosts:[{host:'AOPH1PAPPDC',avg_cpu_pct:20,peak_cpu_pct:88}],
    daily_hosts:[{day:'2026-10-09',host:'AOPH1PAPPDC',peak_cpu_pct:88,
      peak_cpu_at:'2026-10-09T07:00:00Z',peak_ram_pct:44,
      peak_ram_at:'2026-10-09T07:00:00Z'}],
    thresholds:{cpu_warning_pct:75,ram_warning_pct:80}},
  monthly_top_wp_cpu:[...rows],
  monthly_top_wp_pss:[...rows],
  monthly_abap_candidates:[...rows],
  monthly_storage:{month:'2026-10',period:'month',items:[
    {category:'File System OS',status:'COLLECTED',host:'AOPH1PAPPDC',
      mount_point:'/',total_bytes:100e9,used_bytes:70e9,free_bytes:30e9,used_pct:70,
      sample_at:'2026-09-30T16:59:59Z'},
    ...['FS SAP Archive','Archive INTF','INTF'].map(category=>({category,status:'NOT_COLLECTED'}))
  ]},
}
test('ranking is independently sorted, limited to five and never pads missing days',()=>{
  const m=monthlyEnterpriseReportModel('2026-10',data)
  assert.deepEqual(m.sortedCpu.map(r=>r.consumer_key),['ZWORK_10','ZWORK_09','ZWORK_08','ZWORK_07','ZWORK_06'])
  assert.deepEqual(m.sortedPss.map(r=>r.consumer_key),['ZWORK_01','ZWORK_02','ZWORK_03','ZWORK_04','ZWORK_05'])
  assert.equal(m.candidates.length,5)
  assert.equal(m.observedDays,1)
  assert.equal(m.daily[0].cpu,null)
  assert.equal(m.daily[8].cpu.value,88)
  assert.equal(m.daily[9].cpu,null)
  assert.equal(m.period.label,'Period: 01–31 October 2026 (WIB)')
})
test('16:9 PDF is single page, has five-ranked workloads and excludes out-of-window storage',async()=>{
  const pdf=await buildManagementMonthlyPdf({month:'2026-10',data,returnInstance:true})
  assert.equal(pdf.internal.getNumberOfPages(),1)
  assert.ok(Math.abs(pdf.internal.pageSize.getWidth()-960)<.25)
  assert.ok(Math.abs(pdf.internal.pageSize.getHeight()-540)<.25)
  const stream=pdf.internal.pages[1].join('\n')
  for(const label of ['Top 5 Workloads by Peak WP CPU','Top 5 Workloads by Peak WP Memory',
    'Top 5 Tuning Candidates','Not Collected','09 Oct 2026, 14:00 WIB'])assert.ok(stream.includes(label),label)
  assert.ok(!stream.includes('Top 10 Tuning Candidates'))
  await assert.rejects(buildManagementMonthlyPdf({month:'2026-10',data,format:'letter'}),/Unsupported/)
})

test('PowerPoint PNG export uses the exact report model with enforced 1920x1080 dimensions',()=>{
  const ui=readFileSync(new URL('../../src/tools/components/RundeckMonthlyReview.jsx',import.meta.url),'utf8')
  const css=readFileSync(new URL('../../src/tools/components/RundeckMonthlyPptExport.css',import.meta.url),'utf8')
  assert.match(ui,/async function buildManagementMonthlyPng/)
  assert.match(ui,/monthlyEnterpriseReportModel\(month,data\)/)
  assert.match(ui,/await import\('\.\/RundeckMonthlyPptExport\.css'\)/)
  assert.match(ui,/width:1280,height:720,scale:1\.5,backgroundColor:'#ffffff'/)
  assert.match(ui,/canvas\.width!==1920\|\|canvas\.height!==1080/)
  assert.match(ui,/scrollHeight>panel\.clientHeight\+2/)
  assert.match(ui,/reportType==='png'/)
  assert.ok(ui.includes('customStart={model.customStart}'))
  assert.ok(ui.includes('customEnd={model.customEnd}'))
  assert.ok(ui.includes('weekStart={model.weekStart}'))
  assert.ok(ui.includes("model.weekStart?'SAP Weekly Performance Report'"))
  assert.ok(ui.includes("previewPdf('print-a3')"))
  assert.ok(ui.includes("previewPdf('png')"))
  assert.ok(ui.includes('exportStem+'))
  assert.doesNotMatch(css,/text-overflow:ellipsis!important/)
  assert.match(ui,/\.png'/)
  assert.match(css,/width:1280px;height:720px/)
  assert.match(css,/grid-template-rows:164px 136px 168px 138px/)
})

test('report peak timestamps are exact Asia/Jakarta instants, not inferred from day buckets',()=>{
  assert.equal(reportPeakEvidenceWib('2026-10-30T22:09:00Z'),'31 Oct 2026, 05:09 WIB')
  assert.equal(reportPeakEvidenceWib('2026-11-01T16:49:00Z'),'01 Nov 2026, 23:49 WIB')
  assert.equal(reportPeakEvidenceWib('2026-11-01T17:00:00Z'),'02 Nov 2026, 00:00 WIB')
  assert.equal(reportPeakEvidenceWib(null),'Peak time unavailable')
  assert.equal(reportPeakEvidenceWib('invalid'),'Peak time unavailable')
})
test('slide PDF and PNG omit coverage header but preserve coverage in the data model',()=>{
  const pdfSource=readFileSync(new URL('../../src/tools/components/rundeckMonthlyEnterprisePdf.js',import.meta.url),'utf8')
  const uiSource=readFileSync(new URL('../../src/tools/components/RundeckMonthlyReview.jsx',import.meta.url),'utf8')
  const css=readFileSync(new URL('../../src/tools/components/RundeckMonthlyPptExport.css',import.meta.url),'utf8')
  assert.doesNotMatch(pdfSource,/['"]Observed days /)
  assert.doesNotMatch(uiSource,/<small>Observed days/)
  assert.ok(uiSource.includes('reportPeakEvidenceWib(p.at)'))
  assert.ok(pdfSource.includes('reportPeakEvidenceWib(best.at)'))
  assert.match(css,/sphereMonthlyManagerPeak small/)
  const m=monthlyEnterpriseReportModel('2026-10',data)
  assert.equal(m.observedDays,1)
  assert.equal(m.quality.coverage_pct,61.2)
})

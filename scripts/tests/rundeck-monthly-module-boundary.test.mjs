import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read = name => readFileSync(new URL('../../src/tools/components/' + name, import.meta.url), 'utf8')
const entry = read('RundeckMonthlyReview.jsx')
const panels = read('RundeckMonthlyManagement.jsx')
const evidence = read('RundeckMonthlyEvidencePanels.jsx')
const header = read('RundeckMonthlyReportHeader.jsx')
const png = read('RundeckMonthlyPngExport.jsx')
const exporter = read('rundeckMonthlyExport.js')

test('entry orchestrates data, export, evidence, and UI styles; report panels are isolated',()=>{
  assert.match(entry,/import MonthlyManagementDashboard from '\.\/RundeckMonthlyManagement\.jsx'/)
  assert.match(entry,/export default function RundeckMonthlyReview\(/)
  assert.doesNotMatch(entry,/async function buildManagementMonthlyPng\(/)
  assert.match(png,/export async function buildManagementMonthlyPng\(/)
  assert.match(entry,/import '\.\/RundeckMonthlyReview\.css'/)
  assert.match(entry,/import '\.\/RundeckMonthlyFinal20261030\.css'/)
  assert.match(entry,/<MonthlyManagementDashboard month=\{month\}/)
  assert.doesNotMatch(entry,/function MonthlyManagementDashboard\(/)
  assert.doesNotMatch(entry,/function MonthlyRanking\(/)
  assert.doesNotMatch(entry,/function HostTrend\(/)
  assert.match(panels,/export default function MonthlyManagementDashboard\(/)
  assert.match(panels,/function MonthlyRanking\(/)
  assert.match(panels,/function HostTrend\(/)
  assert.equal((panels.match(/export default function MonthlyManagementDashboard\(/g)||[]).length,1)
  assert.doesNotMatch(panels,/fetch\(|\/evaluation\/workloads|\/api\//)
  assert.doesNotMatch(panels,/import '\.\/RundeckMonthlyReview\.css'/)
})

test('chart lazy loading, zero/missing samples and export preloading remain intact',()=>{
  assert.match(panels,/React\.lazy\(loadTimeHostTrend\)/)
  assert.match(panels,/Array\.isArray\(pressure\.trend_hosts\)/)
  assert.match(png,/await loadTimeHostTrend\(\)/)
  assert.match(panels,/firstObservedDay/)
  assert.match(panels,/fitObserved=\{false\}/)
  assert.match(panels,/Missing dates are not zero/)
  assert.match(panels,/monthlyRankMetricValue\(row,metric\)/)
  assert.match(panels,/savedPeriodPeak\(pressure,metric,month,weekStart,customStart,customEnd\)/)
  assert.match(panels,/monthlyEnterpriseReportModel\(month,\{\.\.\.full,monthly_storage:storage\}\)/)
})

test('management report retains the saved period and source-backed fields',()=>{
  for(const label of [
    'Top 5 Workloads — Peak WP CPU','Top 5 Workloads — Peak PSS',
    'Application Server Utilization','Top 5 Workloads for Review',
    'CPU Warning Checks','RAM Warning Checks','Observations',
    'Suggested Review','Filesystem Capacity','Available (df)',
  ])assert.ok(panels.includes(label),'Source-backed label missing: '+label)
  assert.match(panels,/row\.availability_source==='EXPLICIT'/)
  assert.match(panels,/snapshot>=Date\.parse\(reportWindow\.startUtc\)/)
  assert.match(panels,/snapshot<Date\.parse\(reportWindow\.exclusiveEndUtc\)/)
  assert.match(panels,/monthlyReviewBasis\(row\)/)
})

test('phase 2 keeps evidence renderers outside stateful Reports controller',()=>{
  assert.match(entry,/import \{ PressureRows, PressureObservations, MonthlyErrorAnalysis \} from '\.\/RundeckMonthlyEvidencePanels\.jsx'/)
  assert.match(entry,/<PressureRows label="Jobs & Programs During Resource Pressure"/)
  assert.match(entry,/<PressureObservations metric="ram" pressure=\{evidence\}/)
  assert.match(entry,/<MonthlyErrorAnalysis key=\{requestedWeek\|\|month\} evidence=\{errors\}/)
  assert.doesNotMatch(entry,/function PressureRows\(/)
  assert.doesNotMatch(entry,/function MonthlyErrorAnalysis\(/)
  for(const label of ['WorkloadDistribution','PressureRows','PressureObservations','MonthlyErrorAnalysis']) {
    assert.match(evidence,new RegExp('export function '+label+'\\('))
  }
  assert.match(evidence,/This does not mean zero errors/)
  assert.match(evidence,/RABAX and RXMSG are WP trace signals/)
  assert.match(evidence,/No observations reached the warning threshold/)
  assert.doesNotMatch(evidence,/fetch\(|\/evaluation\/workloads|\/api\//)
})

test('phase 2 header preserves controlled period selection and export action safety',()=>{
  assert.match(entry,/import RundeckMonthlyReportHeader from '\.\/RundeckMonthlyReportHeader\.jsx'/)
  assert.match(entry,/<RundeckMonthlyReportHeader/)
  assert.doesNotMatch(entry,/className="sphereMonthlyHead"/)
  assert.match(header,/export default function RundeckMonthlyReportHeader\(/)
  assert.match(header,/className="sphereMonthlyHead"/)
  assert.match(header,/monthlyReportPeriod\(month,\{weekStart:requestedWeek,customStart:requestedStart,customEnd:requestedEnd\}\)/)
  assert.match(header,/id="sphere-period-mode"/)
  assert.match(header,/max=\{TODAY_WIB\}/)
  assert.match(header,/disabled=\{Boolean\(customDateError\(draftStart,draftEnd\)\)\}/)
  assert.match(header,/onClick=\{\(\) => setEvidenceOpen\(true\)\}/)
  assert.match(header,/disabled=\{pdfBusy \|\| !completedData \|\| staleSnapshot\}/)
  for(const label of ['Generate PDF 16:9','Generate PNG 16:9','Generate PDF A3']) {
    assert.ok(header.includes(label))
  }
  assert.equal((header.match(/className="sphereMonthlyDownload"/g)||[]).length,1)
})

test('phase 2 export separates verified report fetching from PDF/PNG serialization',()=>{
  assert.match(entry,/import \{ buildMonthlyReportArtifact \} from '\.\/rundeckMonthlyExport\.js'/)
  assert.match(entry,/const blob=await buildMonthlyReportArtifact\(\{reportType,month,exportData\}\)/)
  assert.match(entry,/reportData\.page\?\.scope!=='FULL_EVALUATED_POPULATION'/)
  assert.match(entry,/monthlyStorage\.month!==month/)
  assert.match(entry,/generation!==pdfGenerationRef\.current/)
  assert.match(exporter,/export async function buildMonthlyReportArtifact\(/)
  assert.match(exporter,/const \{buildMonthlyPdf\}=await import\('\.\/rundeckMonthlyPdf\.js'\)/)
  assert.match(exporter,/buildManagementMonthlyPdf\(\{month,data:exportData,format:'a3'\}\)/)
  assert.match(exporter,/buildManagementMonthlyPng\(\{month,data:exportData\}\)/)
  assert.match(png,/monthlyEnterpriseReportModel\(month,data\)/)
  assert.match(png,/canvas\.width!==1920\|\|canvas\.height!==1080/)
  assert.match(png,/scrollHeight>panel\.clientHeight\+2/)
  assert.doesNotMatch(exporter,/fetch\(|\/evaluation\/workloads|\/api\//)
  assert.doesNotMatch(png,/fetch\(|\/evaluation\/workloads|\/api\//)
})

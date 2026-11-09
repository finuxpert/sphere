import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const component = name => readFileSync(new URL('../../src/tools/components/' + name, import.meta.url), 'utf8')
const ui = component('RundeckMonthlyReview.jsx')
const css = component('RundeckMonthlyFinal20261030.css')

test('Monthly Report has four dense report rows plus evidence popup',()=>{
  assert.match(ui,/sphereMonthlyManagement/)
  assert.match(ui,/MonthlyManagementDashboard/)
  assert.match(ui,/Top 5 Workloads by Peak WP CPU/)
  assert.match(ui,/Top 5 Workloads by Peak WP Memory/)
  assert.match(ui,/Storage Capacity/)
  assert.match(css,/sphereMonthlyManagerPair\.is-tables/)
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/)
})

test('Chart observed fit is reversible and missing calendar dates never become zero', () => {
  assert.match(ui, /fitObserved = true/)
  assert.match(ui, /firstObservedDay/)
  assert.match(ui, /startDay = fitObserved \? firstObservedDay : 1/)
  assert.match(ui, /row\[field\] !== null && row\[field\] !== undefined/)
  assert.match(ui, /fitObserved=\{false\}/)
  assert.match(ui, /point\.day===points\[k-1\]\.day\+1/)
  assert.match(ui, /Missing dates are not zero/)
  assert.match(ui, /point\.warningChecks>0/)
})

test('Saved evaluation status and WP CPU semantics are retained', () => {
  for (const label of ['Review', 'Watch', 'Normal', 'Limited Data']) {
    assert.ok(ui.includes("label:'" + label + "'"))
  }
  assert.match(ui, /wpCpuCoreEquivalent/)
  assert.match(ui, /not host CPU utilization/)
  assert.match(ui, /model\?\.candidates/)
  const pressure = readFileSync(new URL('../../backend/rundeck_monthly_pressure.py', import.meta.url),'utf8')
  assert.match(pressure,/critical_wp_host_checks/)
  assert.match(ui, /summary\.health/)
})

test('Evidence is readable without losing source timestamps or SAP error status', () => {
  assert.match(ui, /row\.first_seen===row\.last_seen/)
  assert.match(ui, /row\.last_at!==row\.first_at/)
  assert.match(ui, /row\.peak_at!==row\.first_at/)
  assert.match(ui, /Error source not retained/)
  assert.match(ui, /This does not mean zero errors/)
  assert.match(ui, /WP Trace Signals for ABAP Review/)
  assert.match(ui, /onChange=\{event=>changeFilter\(setHealth,event\.target\.value\)\}/)
  assert.match(css, /overflow-y:visible\s*!important/)
  assert.match(css, /overflow-x:auto\s*!important/)
})

test('PDF evidence is unfiltered, selected-period scoped and not reused from table pagination', () => {
  assert.match(ui, /month, type:'ALL', health:'ALL', pressure:'ALL', flag:'ALL'/)
  assert.match(ui, /reportData\.month!==month/)
  assert.match(ui, /reportData\.page\?\.scope!=='FULL_EVALUATED_POPULATION'/)
  assert.match(ui, /buildManagementMonthlyPdf\(\{month,data:exportData\}\)/)
  assert.match(ui, /buildMonthlyPdf\(\{month,data:exportData\}\)/)
  assert.match(ui, /monthlyStorage\.month!==month/)
  assert.match(ui, /pdfGenerationRef\.current/)
  assert.equal((ui.match(/className="sphereMonthlyDownload"/g) || []).length,1)
  assert.match(ui, /sphereMonthlyOnePageActions/)
  assert.doesNotMatch(ui, /sphere-month-panel-report/)
  assert.match(css, /68dvh/)
})

test('Monthly Report is a single-view overview with an evidence popup and direct PDF actions', () => {
  assert.match(ui, /is-single-page/)
  assert.match(ui, /sphereMonthlyOnePageActions/)
  assert.match(ui, /evidenceOpen && <RundeckWorkspaceDrawer/)
  assert.match(ui, /Download \{pdfMode==='png'\?'PNG':'PDF'\}/)
  assert.doesNotMatch(ui, /sphereMonthlyTabs|sphere-month-tab-/)
})

test('Report UI follows system light/dark tokens and does not suppress data', () => {
  assert.match(css, /html\[data-theme="light"\]/)
  assert.match(css, /html\[data-theme="dark"\]/)
  assert.match(css, /color-scheme:light/)
  assert.match(css, /color-scheme:dark/)
  assert.match(css, /@media\(max-width:640px\)/)
})


test('Monthly Summary prioritizes host preview before full workload evaluation', () => {
  assert.match(ui, /fullEvaluationReady = hostPreview\?\.month===month/)
  assert.match(ui, /setLoading\(!hostPreviewError\)/)
  assert.match(ui, /if\(!fullEvaluationReady\)/)
  assert.ok(ui.includes('setHostPreview(payload)'), 'verified host data must be rendered')
  assert.match(ui, /setHostPreviewRetry\(count=>count\+1\)/)
  assert.match(ui, /Retry server data/)
  assert.match(ui, /Host summary exceeded 20 seconds/)
  assert.match(ui, /Evaluation exceeded 35 seconds/)
})



test('Host summary retries one transient cold request and preserves scope validation',()=>{
  const start=ui.indexOf('const loadHostPreview=async()=>')
  const end=ui.indexOf('},[reportParams,matchesScope,hostPreviewRetry])',start)
  assert.ok(start>0&&end>start,'host-only request effect must exist')
  const host=ui.slice(start,end)
  assert.match(host,/for\(let attempt=0;attempt<2&&!controller\.signal\.aborted;attempt\+\+\)/)
  assert.match(host,/const previewDeadline=AbortSignal\.timeout\(20_000\)/)
  assert.match(host,/const retryable=timedOut\|\|failure instanceof TypeError\|\|failure\.retryable===true/)
  assert.match(host,/if\(retryable&&attempt===0\)/)
  assert.match(host,/await waitBeforeHostRetry\(\)/)
  assert.match(host,/!matchesScope\(payload\)\|\|payload\.preview_only!==true/)
  assert.match(host,/setHostPreviewError\(timedOut/)
  assert.match(host,/setHostPreview\(payload\)/)
  assert.match(ui,/retryTimer=window\.setTimeout\(done,1500\)/)
  assert.match(ui,/controller\.signal\.removeEventListener\('abort',done\)/)
  assert.match(ui,/failure\.retryable=\[502,503,504\]\.includes\(response\.status\)/)
})


test('weekly and monthly report show verified host peaks independently of storage and workload evaluation',()=>{
  const modelSource=readFileSync(new URL('../../src/tools/components/rundeckMonthlyEvidence.js',import.meta.url),'utf8')
  assert.match(modelSource,/function savedPeriodPeak\(pressure,metric,month,weekStart,customStart=null,customEnd=null\)/)
  assert.match(ui,/const p=savedPeriodPeak\(pressure,metric,month,weekStart,customStart,customEnd\)/)
  assert.match(ui,/model\?\.sortedCpu\|\|full\?\.monthly_top_wp_cpu\|\|\[\]/)
  assert.match(ui,/model\?\.sortedPss\|\|full\?\.monthly_top_wp_pss\|\|\[\]/)
  assert.match(ui,/model\?\.candidates\|\|full\?\.monthly_abap_candidates\?\.slice\(0,5\)\|\|\[\]/)
  assert.match(ui,/attempt<2&&!controller\.signal\.aborted/)
  assert.match(ui,/setEvaluationRetry\(value=>value\+1\)/)
  assert.match(ui,/error\?'Evaluation unavailable'/)
})

test('System Health combines five APPs and matching Infrastructure without redundant drilldown',()=>{
  const wrapper=readFileSync(new URL('../../src/tools/components/RundeckMonitoringHistory.jsx',import.meta.url),'utf8')
  const infra=component('RundeckInfrastructure.jsx')
  const styles=component('RundeckUnifiedExperience20261030.css')
  const start=wrapper.indexOf("{['availability', 'issues', 'system-health'].includes")
  const end=wrapper.indexOf("{activeOverlay?.type === 'app' &&",start)
  const popup=wrapper.slice(start,end)
  assert.ok(start>=0 && end>start)
  assert.match(popup,/RundeckAvailability refreshToken=\{refreshToken\} inlineSummary/)
  assert.match(popup,/RundeckSapIssues refreshToken=\{refreshToken\} inlineSummary/)
  assert.match(popup,/RundeckInfrastructure healthMatrix refreshToken=\{refreshToken\}/)
  assert.doesNotMatch(popup,/Infrastructure History|is-sap-checks|<details|<summary/)
  assert.match(infra,/Array\.from\(\{length:5\}/)
  assert.match(infra,/sourceQuality\?\.performanceValid===true/)
  assert.match(infra,/appSampleFreshness/)
  assert.match(infra,/infrastructureTelemetryFreshness/)
  assert.match(infra,/Promise\.allSettled\(requests\)/)
  assert.match(infra,/setError\(unavailable\.length/)
  assert.match(infra,/String\(row\.collection_id\|\|''\)===String\(infra\.collection_id\|\|''\)/)
  assert.match(infra,/sourceLoading\?'CHECKING'/)
  assert.match(infra,/sapWorkloadState\(sap\)/)
  assert.match(infra,/Filesystem/)
  assert.match(infra,/Storage I\/O/)
  assert.match(infra,/Network/)
  assert.match(infra,/snapshot_ts/)
  assert.match(styles,/html\[data-theme="light"\] \.sphereSystemHealthCompact/)
  assert.match(styles,/html\[data-theme="dark"\] \.sphereSystemHealthCompact/)
  assert.match(styles,/sphereHealthState\.is-stale/)
  assert.match(styles,/@media\(max-width:700px\)/)
})


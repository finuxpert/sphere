import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const component = name => readFileSync(new URL('../../src/tools/components/' + name, import.meta.url), 'utf8')
const ui = component('RundeckMonthlyReview.jsx')
const css = component('RundeckMonthlyFinal20261030.css')

test('Monthly Review uses two independently sized desktop columns with natural mobile flow', () => {
  assert.match(ui, /sphereMonthlyVisualGrid sphereMonthlyMainColumn col-12 col-xl-7/)
  assert.match(ui, /sphereMonthlySideColumn col-12 col-xl-5/)
  assert.ok(ui.indexOf('sphereMonthlyMainColumn') < ui.indexOf('sphereMonthlyHostSummary'))
  assert.ok(ui.indexOf('sphereMonthlySideColumn') < ui.indexOf('<WorkloadDistribution'))
  assert.ok(ui.indexOf('sphereMonthlySideColumn') < ui.indexOf('sphereMonthlyPriorities'))
  assert.match(css, /grid-template-columns:minmax\(0,58fr\) minmax\(0,42fr\)/)
  assert.match(css, /@media\(max-width:1199px\)/)
  assert.doesNotMatch(css, /visibility:\s*hidden\s*!important|display:\s*none\s*!important/)
})

test('Chart observed fit is reversible and missing calendar dates never become zero', () => {
  assert.match(ui, /fitObserved = true/)
  assert.match(ui, /firstObservedDay/)
  assert.match(ui, /startDay = fitObserved \? firstObservedDay : 1/)
  assert.match(ui, /row\[field\] !== null && row\[field\] !== undefined/)
  assert.match(ui, /Full month/)
  assert.match(ui, /Fit observed/)
  assert.match(ui, /Missing dates are not zero/)
  assert.match(ui, /point\.warningChecks>0/)
})

test('Saved evaluation status and WP CPU semantics are retained', () => {
  for (const label of ['Review', 'Watch', 'Normal', 'Limited Data']) {
    assert.ok(ui.includes("label:'" + label + "'"))
  }
  assert.match(ui, /wpCpuCoreEquivalent/)
  assert.match(ui, /not host CPU utilization/)
  assert.match(ui, /tuningCandidates\.slice\(0,5\)/)
  assert.match(ui, /critical_wp_host_checks/)
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

test('PDF evidence is unfiltered, month-scoped and not reused from table pagination', () => {
  assert.match(ui, /month, type:'ALL', health:'ALL', pressure:'ALL', flag:'ALL'/)
  assert.match(ui, /reportData\.month!==month/)
  assert.match(ui, /reportData\.page\?\.scope!=='FULL_EVALUATED_POPULATION'/)
  assert.match(ui, /buildManagementMonthlyPdf\(\{month,data:reportData\}\)/)
  assert.match(ui, /buildMonthlyPdf\(\{month,data:reportData\}\)/)
  assert.match(ui, /pdfGenerationRef\.current/)
  assert.equal((ui.match(/Download PDF/g) || []).length,1)
  assert.match(ui, /navpanes=0&view=FitH/)
  assert.match(ui, /Open full screen/)
  assert.match(css, /68dvh/)
})

test('Three tab panels expose accessible labels and keyboard navigation', () => {
  assert.match(ui, /handleTabKeyDown/)
  assert.match(ui, /event\.key==='ArrowRight'/)
  assert.match(ui, /event\.key==='ArrowLeft'/)
  for (const name of ['summary','evidence','report']) {
    assert.ok(ui.includes('sphere-month-panel-'+name))
    assert.ok(ui.includes('sphere-month-tab-'+name))
  }
  assert.match(ui, /aria-selected=\{tab===value\}/)
  assert.match(ui, /role="tabpanel"/)
})

test('Report UI follows system light/dark tokens and does not suppress data', () => {
  assert.match(css, /html\[data-theme="light"\]/)
  assert.match(css, /html\[data-theme="dark"\]/)
  assert.match(css, /color-scheme:light/)
  assert.match(css, /color-scheme:dark/)
  assert.match(css, /@media\(max-width:640px\)/)
})


test('Monthly Summary prioritizes host preview before full workload evaluation', () => {
  assert.match(ui, /tab==='summary' && hostPreview\?\.month!==month && !hostPreviewError/)
  assert.ok(ui.includes('setHostPreview(payload)'), 'verified host data must be rendered')
  assert.match(ui, /setHostPreviewRetry\(count=>count\+1\)/)
  assert.match(ui, /Retry server data/)
  assert.match(ui, /Monthly host summary exceeded 20 seconds/)
  assert.match(ui, /Monthly evaluation exceeded 35 seconds/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = name => readFileSync(new URL('../../src/tools/components/' + name, import.meta.url), 'utf8')
const css = read('RundeckEnterpriseFinishV138.css')
const history = read('RundeckMonitoringHistory.jsx')
const pdf = read('rundeckMonthlyPdf.js')

test('Enterprise finishing layer loads after existing SAP monitoring styles', () => {
  const previous = history.indexOf("import './RundeckEnterpriseMonitoringV137.css'")
  const finishing = history.indexOf("import './RundeckEnterpriseFinishV138.css'")
  assert.ok(previous > 0 && finishing > previous)
  assert.match(css, /\.appShell:has\(\.rundeckPanel\) \.spherePerformanceShell/)
  assert.match(css, /--ui-focus/)
  assert.doesNotMatch(css, /Math\.random|synthetic metrics|mock KPI/)
})

test('All SAP Operations workspaces receive scoped display and accessible focus rules', () => {
  for (const view of [
    '.spherePerformancePage.is-jobs',
    '.spherePerformancePage.is-events',
    '.spherePerformancePage.is-sap-checks',
    '.spherePerformancePage.is-infrastructure',
    '.sphereMonthlyReview.is-v2',
    '.rundeckTripleTrendGrid',
  ]) assert.ok(css.includes(view), 'Missing operational view: ' + view)
  assert.match(css, /:focus-visible/)
  assert.match(css, /overflow-wrap: anywhere/)
  assert.match(css, /@media \(max-width: 1050px\)/)
  assert.match(css, /@media \(max-width: 720px\)/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /html\[data-theme="light"\]/)
})

test('Monthly PDF remains observational and explains candidate review status', () => {
  assert.match(pdf, /const summaryY = Math\.max\(ramTableBottom, cpuTableBottom\) \+ 7/)
  assert.match(pdf, /Executive Findings/)
  assert.match(pdf, /Highest observed APP CPU/)
  assert.match(pdf, /Highest observed APP RAM/)
  assert.match(pdf, /not confirmed failed jobs or root causes/)
  assert.match(pdf, /no job failure is implied/)
  assert.match(pdf, /data\.monthly_errors/)
  assert.match(pdf, /data\.monthly_abap_candidates/)
  assert.match(pdf, /quality\.complete_checks/)
  assert.match(pdf, /pressure\.thresholds\?\.cpu_warning_pct/)
})

test('New visual layer does not hide evidence, timestamps, alerts, or error rows', () => {
  assert.doesNotMatch(css, /display:\s*none\s*!important\s*;?\s*\}/i)
  assert.match(read('RundeckEvidenceTimeline.jsx'), /Cause not established/)
  assert.match(read('RundeckInfrastructure.jsx'), /OPERATOR_THRESHOLDS\.filesystem\.critical/)
  assert.match(read('RundeckMonthlyReview.jsx'), /monthly_errors|sphereMonthlyErrors/)
})

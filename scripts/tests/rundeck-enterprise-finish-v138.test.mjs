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
  assert.doesNotMatch(css, /(?:\.rundeckEvidenceEvent|\.sphereMonthlyErrors|\.rundeckInfraChartWrap)[^{}]*\{[^{}]*display:\s*none/i)
  assert.match(read('RundeckEvidenceTimeline.jsx'), /Cause not established/)
  assert.match(read('RundeckInfrastructure.jsx'), /OPERATOR_THRESHOLDS\.filesystem\.critical/)
  assert.match(read('RundeckMonthlyReview.jsx'), /monthly_errors|sphereMonthlyErrors/)
})

test('APP evaluation host buttons open the filtered current workload instead of being disabled', () => {
  const parent = read('RundeckMonitoringHistoryCore.jsx')
  const health = read('RundeckWorkloadHealth.jsx')
  const lanes = read('RundeckWorkloadAppLanes.jsx')
  assert.match(parent, /onOpenApp=\{props\.onOpenAppJobs\}/)
  assert.match(health, /onSelectWorkload, onOpenApp, viewMode/)
  assert.match(health, /<RundeckWorkloadAppLanes[^>]*onOpenApp=\{onOpenApp\}/)
  assert.match(lanes, /disabled=\{!onOpenApp\}/)
  assert.match(lanes, /onClick=\{\(\) => onOpenApp\?\.\(lane\.key\)\}/)
  assert.match(css, /\.rundeckAppEvalHostButton:not\(:disabled\):hover/)
})

test('Compact APP evaluations keep human-readable status labels and bars', () => {
  assert.match(css, /\.rundeckAppEvalBar\s*\{[\s\S]*?height: 16px !important/)
  assert.match(css, /\.rundeckAppEvalColumnHead > div > span\s*\{[\s\S]*?white-space: normal/)
  assert.match(css, /\.rundeckAppEvalBreakdown small\s*\{[\s\S]*?font-size: 11\.5px !important/)
  assert.match(read('RundeckWorkloadAppLanes.jsx'), /per-APP memberships are not distinct workloads/)
})

test('Premium operator polish preserves severity meaning, layout fit, and light theme', () => {
  const finish = css.slice(css.indexOf('v1.38.2 — Premium SAP operator finishing'))
  assert.ok(finish.length > 7000)
  assert.match(finish, /html:not\(\[data-theme="light"\]\)/)
  assert.match(finish, /grid-template-rows:minmax\(64px,auto\)!important/)
  assert.match(finish, /\.rundeckAppHexSelector\.is-active/)
  assert.match(finish, /\.rundeckWorkloadCategory\.is-review/)
  assert.match(finish, /\.rundeckWorkloadCategory\.is-attention/)
  assert.match(finish, /\.rundeckWorkloadCategory\.is-unknown/)
  assert.match(finish, /\.rundeckWorkloadCategory\.is-normal/)
  assert.match(finish, /\.rundeckTripleTrendGrid/)
  assert.match(finish, /@media\(max-width:1050px\)/)
  assert.match(finish, /prefers-reduced-motion:reduce/)
  assert.doesNotMatch(finish, /(?:display:\s*none|visibility:\s*hidden)/)
  assert.doesNotMatch(finish, /(?:Math\.random|fake API|status\s*=|threshold\s*=)/)
})

test('Single-screen desktop Overview measures real viewport space and keeps smaller screens in natural flow', () => {
  const core = read('RundeckMonitoringHistoryCore.jsx')
  const history = read('RundeckMonitoringHistory.jsx')
  const fit = read('RundeckViewportFitV139.css')
  assert.ok(history.indexOf("RundeckViewportFitV139.css") > history.indexOf("RundeckEnterpriseFinishV138.css"))
  assert.match(core, /window\.innerHeight - overview\.getBoundingClientRect\(\)\.top - 10/)
  assert.match(core, /window\.innerWidth >= 1280 && window\.innerHeight >= 760 && available >= 670/)
  assert.match(core, /overview\.style\.setProperty\('--sphere-overview-room'/)
  assert.match(core, /overview\.dataset\.viewportFit = 'true'/)
  assert.match(core, /delete overview\.dataset\.viewportFit/)
  assert.match(core, /window\.addEventListener\('resize', schedule/)
  assert.match(core, /observer\?\.disconnect\(\)/)
  assert.match(fit, /@media \(min-width: 1280px\) and \(min-height: 760px\)/)
  assert.match(fit, /grid-template-rows: minmax\(132px,\.72fr\) minmax\(240px,1\.55fr\) minmax\(236px,1\.2fr\)/)
  assert.match(fit, /grid-template-areas: "heading summary" "lanes lanes" "foot foot"/)
  assert.match(fit, /\.rundeckAppEvalLane/)
  assert.match(fit, /\.rundeckTripleTrendV13457/)
  assert.match(fit, /:has\(\.rundeckAppEvalDots\)/)
  assert.match(fit, /@media \(max-width: 1279px\), \(max-height: 759px\)/)
  assert.doesNotMatch(fit, /overflow:\s*hidden|display:\s*none|visibility:\s*hidden/)
  assert.doesNotMatch(fit, /Math\.random|mock metrics|hardcoded KPI/)
})

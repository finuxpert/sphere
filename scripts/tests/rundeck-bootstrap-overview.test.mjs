import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const component = name => readFileSync(new URL('../../src/tools/components/' + name, import.meta.url), 'utf8')

test('compact monitoring keeps four charts, live data and navigation with Bootstrap layout', () => {
  const core = component('RundeckMonitoringHistoryCore.jsx')
  const wrapper = component('RundeckMonitoringHistory.jsx')
  const trends = component('RundeckServerTrend.jsx')
  const css = component('RundeckBootstrapTrend.css')
  assert.match(core, /sphereOverviewBottomRow row g-2/)
  assert.match(core, /rundeckJobsProgramsOverview col-12 col-xl-5/)
  assert.match(wrapper, /sphereOverviewDetails col-12 col-xl-7/)
  assert.match(core, /dataset\.viewportFit = 'compact'/)
  assert.match(css, /\[data-viewport-fit="compact"\]/)
  assert.match(css, /--sphere-overview-room/)
  assert.match(trends, /row-cols-1 row-cols-md-2 row-cols-xxl-4 g-2/)
  assert.match(trends, /formatTrendPeakWib\(panelPeak\.timestamp\)/)
  assert.match(trends, /<select className="rundeckTrendMetricSelect/)
  assert.doesNotMatch(trends, /InfrastructureGapBand/)
  assert.match(trends, /gapPoints.map/)
})

test('dashboard previews are bounded but full drilldowns remain available', () => {
  const evaluation = component('RundeckWorkloadHealth.jsx')
  const current = component('RundeckCurrentWorkload.jsx')
  assert.match(evaluation, /workloadHealthLevel\(row\) === 'review'\)\.slice\(0,2\)/)
  assert.match(current, /\)\.slice\(0,2\)\s+return <section className="sphereCurrentWorkloadSummary"/)
  assert.match(current, /href="#\/tool\/logs\/jobs">View all/)
  assert.match(evaluation, /onReview\?\.\(level\.health\)/)
  assert.match(evaluation, /onClick=\{\(\) => openWorkload\(row\)\}/)
})

test('compact fit never clips the entire monitoring page', () => {
  const css = component('RundeckBootstrapTrend.css')
  const core = component('RundeckMonitoringHistoryCore.jsx')
  assert.match(css, /permit natural page scrolling rather than concealing/)
  assert.doesNotMatch(css, /\.rundeckMonitoring\[data-viewport-fit="compact"\]\s*\{[^}]*overflow:\s*hidden/s)
  assert.match(core, /window\.innerHeight >= 760 && available >= 540/)
})

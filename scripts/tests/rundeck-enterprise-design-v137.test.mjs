import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { groupEvaluationsByApp } from '../../src/tools/components/rundeckWorkloadAppLanes.js'

const read = path => readFileSync(new URL('../../src/tools/components/' + path, import.meta.url), 'utf8')

test('enterprise visual design loaded last after historical layout layers', () => {
  const source = read('RundeckMonitoringHistory.jsx')
  const before = source.indexOf("import './RundeckVisualRedesignV136.css'")
  const after = source.indexOf("import './RundeckEnterpriseMonitoringV137.css'")
  assert.ok(before > 0 && after > before)
  const css = read('RundeckEnterpriseMonitoringV137.css')
  for (const piece of ['--v36-bg:#10151c','--v36-panel:#1b242e','--v36-blue:#67a9e7',
    'rundeckTripleTrendGrid', 'rundeckAppEvalSummary', 'is-infrastructure', 'is-sap-checks',
    'is-events', 'sphereMonthlyReview', '@media(max-width:650px)', 'prefers-reduced-motion']) {
    assert.ok(css.includes(piece), 'Enterprise design missing ' + piece)
  }
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|text-shadow/)
})

test('workload APP status distribution is source-backed and only details render individual clickable buttons', () => {
  const lanes = read('RundeckWorkloadAppLanes.jsx')
  const parent = read('RundeckWorkloadHealth.jsx')
  assert.match(lanes, /groupEvaluationsByApp\(rows\)/)
  assert.match(lanes, /lane\.counts\[level\.key\]/)
  assert.match(lanes, /100 \* lane\.counts\[level\.key\] \/ lane\.total/)
  assert.match(lanes, /expandedByLane\[lane\.key\] &&/)
  assert.match(lanes, /aria-expanded=\{Boolean\(expandedByLane\[lane\.key\]\)\}/)
  assert.match(lanes, /onSelectWorkload\?\.\(row\)/)
  assert.match(parent, /viewMode === 'by-app'/)
  const model = groupEvaluationsByApp([
    { consumer_type:'JOB', consumer_key:'A', status:'REVIEW REQUIRED', hosts:['APP1','APP2'] },
    { consumer_type:'JOB', consumer_key:'B', status:'HIGH CPU', hosts:['APP1'] },
    { consumer_type:'PROGRAM', consumer_key:'C', status:'NORMAL', hosts:['APP1'] },
  ])
  const lane = model.lanes.find(item => item.key === 'APP1')
  assert.equal(lane.total, 3)
  assert.equal(lane.counts.review, 1)
  assert.equal(lane.counts.attention, 1)
  assert.equal(lane.counts.normal, 1)
  assert.equal(model.memberships, 4)
})

test('existing SAP evidence semantics remain unchanged in presentation updates', () => {
  const core = read('RundeckMonitoringHistoryCore.jsx')
  const trend = read('RundeckServerTrend.jsx')
  const evidence = read('RundeckEvidenceTimeline.jsx')
  assert.match(core, /<RundeckUnifiedAppInfrastructure/)
  assert.match(core, /<RundeckServerTrend/)
  assert.match(core, /<RundeckWorkloadHealth/)
  assert.match(trend, /InfrastructureGapBand trend=\{technicalTrend\}/)
  assert.match(evidence, /Cause not established/)
})

test('dashboard ECharts preserve data and thresholds while filling the available plot', () => {
  const trend = read('RundeckServerTrend.jsx')
  const css = read('RundeckEnterpriseMonitoringV137.css')
  const grid = trend.match(/grid: \{ left: (\d+), right: (\d+), top: (\d+), bottom: compactPoints \? (\d+) : (\d+) \}/)
  assert.ok(grid, 'ECharts plot grid must remain explicit and measurable')
  const top = Number(grid[3])
  const bottom = Number(grid[5])
  assert.ok(top <= 16 && bottom <= 32, 'Dashboard must not waste chart height on empty plot rails')
  assert.ok(176 - top - bottom >= 125, 'At least 125px of observed data plot at minimum chart size')
  assert.match(trend, /markLine: index === 0 && visibleThresholds\.length/)
  assert.match(trend, /markArea: index === 0 && gaps\.length/)
  assert.match(trend, /selectedHost=\{focusedHost\}/)
  assert.match(css, /\.rundeckTripleTrendGrid \.rundeckTrendPlot\{/)
  assert.match(css, /\.rundeckTripleTrendGrid \.rundeckTrendChart\{[\s\S]*?min-height:176px!important/)
  assert.match(css, /\.is-technical-trend \.rundeckTrendChart\{[\s\S]*?min-height:142px!important/)
  assert.match(css, /\.is-technical-trend \.rundeckTrendToolbar \.rundeckSegmented\{/)
})

test('status charts remain linked to actual APP evaluation totals and drilldowns', () => {
  const css = read('RundeckEnterpriseMonitoringV137.css')
  const source = read('RundeckWorkloadAppLanes.jsx')
  assert.match(source, /aria-expanded=\{Boolean\(expandedByLane\[lane\.key\]\)\}/)
  assert.match(source, /aria-label=\{lane\.label \+ ' saved memberships:/)
  assert.match(source, /lane\.counts\[level\.key\]/)
  assert.match(source, /onSelectWorkload\?\.\(row\)/)
  assert.match(css, /\.rundeckAppEvalBar\{/)
})

test('visual finishing keeps focus visible and APP memberships unambiguous', () => {
  const trend = read('RundeckServerTrend.jsx')
  const bars = read('RundeckWorkloadAppLanes.jsx')
  const styles = read('RundeckEnterpriseMonitoringV137.css')
  assert.match(trend, /type: 'line', z: focused \? 6 : 2/)
  assert.match(trend, /axisLabel: \{ color: colors\.muted, fontSize: 11/)
  assert.match(trend, /markLine: index === 0 && visibleThresholds\.length/)
  assert.match(trend, /markArea: index === 0 && gaps\.length/)
  assert.match(bars, /per-APP memberships are not distinct workloads/)
  assert.match(bars, /not confirmed SAP SM37 failed jobs/)
  assert.match(styles, /\.rundeckAppEvalBreakdown small\{[\s\S]*?font-size:11px!important/)
})

test('enterprise chart tokens are consistent with the selected shell and preserve severity meaning', () => {
  const trend = read('RundeckServerTrend.jsx')
  const css = read('RundeckEnterpriseMonitoringV137.css')
  assert.match(trend, /document\.querySelector\('\.spherePerformanceShell'\)/)
  for (let index = 1; index <= 5; index++) {
    assert.match(css, new RegExp('--v36-series-' + index + ':'))
    assert.ok(trend.includes("'--v36-series-" + index + "'"), 'chart palette missing APP slot ' + index)
  }
  assert.match(trend, /warning: token\('--v36-amber'/)
  assert.match(trend, /danger: token\('--v36-red'/)
})

test('inactive temporal decoration does not execute its reduction or load canvas until requested', () => {
  const trend = read('RundeckServerTrend.jsx')
  const pure = read('rundeckTrendAmbientData.js')
  const ambient = read('rundeckTrendAmbient.js')
  assert.match(trend, /temporalReady \? savedVortexPeak\(/)
  assert.match(trend, /import\('\.\/rundeckTrendAmbient\.js'\)/)
  assert.match(ambient, /export \{ vortexAppLabel, savedVortexPeak \}/)
  assert.match(pure, /export function savedVortexPeak/)
  assert.match(trend, /if \(disposed\) return/)
  assert.match(trend, /layer\?\.dispose\?\.\(\)/)
})

test('chart and APP details use only one active resize notification source', () => {
  const trend = read('RundeckServerTrend.jsx')
  const details = read('RundeckWorkloadAppLanes.jsx')
  for (const [source, callback] of [[trend, 'resize'], [details, 'measure']]) {
    assert.ok(source.includes('if (observer) observer.observe('))
    assert.ok(source.includes("else window.addEventListener('resize', " + callback))
    assert.ok(source.includes("if (!observer) window.removeEventListener('resize', " + callback))
  }
})

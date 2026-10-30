import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (name) => readFileSync(new URL('../../src/tools/components/' + name, import.meta.url), 'utf8')
const css = read('RundeckVisualRedesignV136.css')
const history = read('RundeckMonitoringHistory.jsx')

test('v1.36 visual layer loads last and respects existing SAP source models', () => {
  assert.match(history, /import '\.\/RundeckOperationalPagesV135\.css'/)
  assert.match(history, /import '\.\/RundeckVisualRedesignV136\.css'/)
  assert.ok(history.indexOf('RundeckVisualRedesignV136.css') > history.indexOf('RundeckOperationalPagesV135.css'))
  assert.match(css, /--v36-cyan:#38c7df/)
  assert.match(css, /html\[data-theme="light"\]/)
  assert.match(css, /prefers-reduced-motion:reduce/)
  assert.doesNotMatch(css, /Math\.random|fake API|hardcoded metric/)
})

test('Overview keeps live APP and three real trend charts above Job & Program Evaluation', () => {
  const core = read('RundeckMonitoringHistoryCore.jsx')
  const fleet = read('RundeckUnifiedAppInfrastructure.jsx')
  const workload = read('RundeckWorkloadHealth.jsx')
  assert.match(core, /<RundeckUnifiedAppInfrastructure/)
  assert.match(core, /<RundeckServerTrend/)
  assert.match(core, /ambientBraid=\{false\}/)
  assert.match(core, /<RundeckWorkloadHealth/)
  assert.ok(core.indexOf('<RundeckUnifiedAppInfrastructure') < core.indexOf('<RundeckServerTrend'))
  assert.ok(core.indexOf('<RundeckServerTrend') < core.indexOf('<RundeckWorkloadHealth'))
  assert.match(fleet, /onClick=\{\(\) => \{ openAppAnalysis\(host\); selectApp\(key\)/)
  assert.match(workload, /onSelectWorkload=|onSelectWorkload/)
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/)
  assert.match(css, /height:206px!important/)
})

test('events use observed issue timestamps and preserve causal uncertainty', () => {
  const events = read('RundeckEvidenceTimeline.jsx')
  assert.match(events, /const summaryNote/)
  assert.match(events, /Cause not established/)
  assert.match(events, /eventRelation\(event\.at, issueAt, threshold/)
  assert.match(events, /formatWib\(event\.at, true\)/)
  assert.match(events, /RundeckEvidenceTechnical|rundeckEvidenceTechnical/)
  assert.match(css, /is-events \.rundeckEvidenceEvent\.is-primary-signal/)
})

test('SAP Checks preserve verified availability and UNKNOWN data source states', () => {
  const availability = read('RundeckAvailability.jsx')
  const issues = read('RundeckSapIssues.jsx')
  assert.match(availability, /Last verified sample/)
  assert.match(issues, /SM37 readiness unavailable/)
  assert.match(issues, /Missing or stale source data; not confirmed SAP downtime/)
  assert.match(issues, /onClick=\{\(\)=>inspect\(row\)\}/)
  assert.match(css, /\.rundeckSapChecksDetailGrid/)
  assert.match(css, /\.rundeckSapChecksHistoryDock/)
})

test('Infrastructure keeps measured host selectors, thresholds, and historical series', () => {
  const infra = read('RundeckInfrastructure.jsx')
  assert.match(infra, /rundeckInfraHostCards/)
  assert.match(infra, /OPERATOR_THRESHOLDS\.filesystem\.critical/)
  assert.match(infra, /setTrendMetric\(v\)/)
  assert.match(infra, /setSelectedSeries/)
  assert.match(css, /is-infrastructure \.rundeckInfraGrid/)
  assert.match(css, /is-infrastructure \.rundeckInfraTrendWorkspace/)
})

test('desktop finishing restores full fleet width despite retired honeycomb max-width', () => {
  const finishing = css.slice(css.indexOf('v1.36.1 finishing'))
  assert.ok(finishing.length > 4000, 'finishing rules loaded')
  assert.match(finishing, /\.rundeckAppHexMain\.rundeckAppThreePanels\s*\{[\s\S]*?align-items:stretch!important/)
  assert.match(finishing, /\.rundeckAppHexSelectors\.rundeckUnifiedAppCards\.is-honeycomb\s*\{[\s\S]*?max-width:none!important/)
  assert.match(finishing, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/)
  assert.match(finishing, /\.rundeckAppHexSelector\s*\{[\s\S]*?grid-column:auto!important/)
  assert.match(finishing, /@media\(max-width:650px\)/)
})

test('Technical Trend keeps observed network evidence and selected chart visible, not cropped', () => {
  const finishing = css.slice(css.indexOf('v1.36.1 finishing'))
  const trend = read('RundeckServerTrend.jsx')
  assert.match(finishing, /\.rundeckTripleTrendGrid > \.rundeckServerTrendPanelV1234\s*\{[\s\S]*?height:auto!important;[\s\S]*?overflow:visible!important/)
  assert.match(finishing, /\.rundeckTripleTrendGrid \.is-technical-trend \.rundeckTrendToolbar\s*\{[\s\S]*?flex-wrap:wrap!important/)
  assert.doesNotMatch(trend, /InfrastructureGapBand/)
  assert.match(trend, /gapPoints\.map/)
  assert.match(trend, /networkInfo\.outliers/)
  assert.match(trend, /renderTrendState\(panel.trend, panel.loading/)
  assert.match(read('RundeckMonitoringHistoryCore.jsx'), /<RundeckWorkloadHealth/)
})

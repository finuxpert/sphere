import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const load = file => readFileSync(new URL('../../src/tools/components/' + file, import.meta.url), 'utf8')

test('source ECharts is visible at rest, braid stays subtle and never owns pointer events', () => {
  const css = load('RundeckTrendAmbient.css')
  const chart = load('RundeckServerTrend.jsx')
  assert.match(css, /ECharts is the primary source-backed data surface at rest/)
  assert.match(css, /data-vortex-ready="true"\]::before \{\s*display:none!important/)
  assert.match(css, />\.rundeckUnifiedVortexCanvas \{\s*opacity:\.13!important;\s*pointer-events:none!important/)
  assert.match(css, /\.is-expanded>\.rundeckUnifiedVortexCanvas \{\s*opacity:0!important/)
  assert.match(chart, /connectNulls: false/)
  assert.match(chart, /onFocusCapture=\{\(\) => setUnifiedHovered\(true\)\}/)
})

test('source-backed APP evaluation lanes have explicit status headings and legible hexagons', () => {
  const lanes = load('RundeckWorkloadAppLanes.jsx')
  const css = load('RundeckWorkloadAppLanes.css')
  assert.match(lanes, /maxCount = Math\.max\(1/)
  assert.match(lanes, /Math\.max\(10, Math\.min\(12/)
  assert.match(lanes, /rundeckAppEvalColumnHead/)
  assert.match(lanes, /STATUS_LABELS\.map\(level => <span/)
  assert.match(lanes, /onClick=\{\(\) => onOpenApp\?\.\(lane\.key\)\}/)
  assert.match(lanes, /workloadHealthLevel\(row\)/)
  assert.match(css, /\.rundeckAppEvalHostButton/)
  assert.match(css, /\.rundeckAppEvalHex \{\s*min-width:var\(--lane-hex-size,10px\)/)
})

test('APP label scopes only Current observations; review/search stay global', () => {
  const core = load('RundeckMonitoringHistoryCore.jsx')
  const main = load('RundeckMonitoringHistory.jsx')
  const workspace = load('RundeckJobsProgramsWorkspace.jsx')
  const current = load('RundeckCurrentWorkload.jsx')
  assert.match(core, /onOpenApp=\{props\.onOpenAppJobs\}/)
  assert.match(main, /onOpenAppJobs=\{\(hostKey\) => setActiveOverlay\(\{ type: 'jobs-programs', mode: 'live', category: 'REVIEW', hostKey \}\)\}/)
  assert.match(main, /initialAppHost=\{activeOverlay\.hostKey \|\| ''\}/)
  assert.match(workspace, /React\.cloneElement\(currentContent, \{ embedded: true, initialAppHost \}\)/)
  assert.match(workspace, /Review and Search remain global evaluations/)
  assert.match(current, /const resolvedHost = availableHostKey\.split\(','\)\.find\(host => shortHost\(host\)/)
  assert.match(current, /setHostFilter\(requestedHost\)/)
  assert.match(current, /\|\| requestedHost/)
  assert.match(current, /setHostFilter\(resolvedHost\)/)
  assert.match(current, /no saved current observation/)
  assert.match(current, /This does not describe 24h saved evaluations/)
  assert.match(current, /hostFilter !== 'ALL' && row\.host !== hostFilter/)
})

test('one time-range overflow menu and honest retained historical coverage', () => {
  const chart = load('RundeckServerTrend.jsx')
  const menu = load('RundeckAppThreePanel.css')
  assert.match(chart, /aria-label="Additional time ranges"/)
  assert.match(chart, /<optgroup label="Short range">/)
  assert.match(chart, /<optgroup label="Historical">/)
  assert.doesNotMatch(chart, /aria-label="Historical analysis period"/)
  assert.match(chart, /observedDailyBuckets/)
  assert.match(chart, /Number\(item\?\.samples\) > 0/)
  assert.match(chart, /configured_retention_days/)
  assert.match(chart, /Missing dates are unknown, not zero/)
  assert.match(menu, /\.rundeckAppChecksPanel \.rundeckAnalysisActions > button :is\(span,strong\) \{\s*font-size:12px!important/)
})

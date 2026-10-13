import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = name => readFileSync(new URL('../../src/tools/components/' + name, import.meta.url), 'utf8')

test('hexagon APP selection, source provenance and modal behavior', () => {
  const app=read('RundeckUnifiedAppInfrastructure.jsx')
  const css=read('RundeckCockpitHexV13512.css')
  assert.match(app,/hosts\.map\(host => \{/)
  assert.match(app,/appSignalState\(host, performanceVerified\)/)
  assert.match(app,/aria-pressed=\{appKey === key\}/)
  assert.match(app,/onSelectApp\?\.\(host\.host\)/)
  assert.match(app,/selectedHost && <div className="rundeckSelectedAppDetail"/)
  assert.match(app,/selectedInfra\?\.topFs\?\.mount_point/)
  assert.match(app,/onClick=\{openSelectedAnalysis\}/)
  assert.match(css,/clip-path:polygon\(50% 0%/)
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/)
  assert.match(css,/@media \(max-width:430px\)/)
})

test('four operational modal shortcuts moved below APP and above trends', () => {
  const core=read('RundeckMonitoringHistoryCore.jsx')
  const wrapper=read('RundeckMonitoringHistory.jsx')
  const css=read('RundeckCockpitHexV13512.css')
  assert.ok(core.indexOf('rundeckTopBandV13454') < core.indexOf('rundeckAnalysisRailV13456'))
  assert.ok(core.indexOf('rundeckAnalysisRailV13456') < core.indexOf('rundeckTrendBandV13454'))
  assert.ok(core.indexOf('rundeckTrendBandV13454') < core.indexOf('<RundeckJobsProgramsWorkspace'))
  assert.match(core,/onSelectApp=\{props\.onFocusAppHost\}/)
  assert.match(wrapper,/focusedOperationalHost/)
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/)
})

test('Workload Health keeps validated 1D identities and adds hexagon title icon', () => {
  const health=read('RundeckWorkloadHealth.jsx')
  assert.match(health,/<SphereIcon name="hexagon" \/>/)
  assert.match(read('SphereIcon.jsx'),/hexagon: <>/)
  assert.match(health,/validatedWorkloadDots\(first, following, 0, completePageSize\)/)
  assert.match(health,/onClick=\{\(\) => openWorkload\(row\)\}/)
})

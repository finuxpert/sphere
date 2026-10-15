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
  assert.match(app,/openAppAnalysis\(host\)/)
  assert.match(app,/infraHostVerified: Boolean\(infraHost\)/)
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

test('saved job/program evaluation retains full validation and an accessible status bar', () => {
  const health=read('RundeckWorkloadHealth.jsx')
  assert.match(health,/<SphereIcon name="activity" \/>/)
  assert.match(health,/validatedWorkloadDots\(first, following, 0, completePageSize\)/)
  assert.match(health,/className="rundeckWorkloadDistribution"/)
  assert.match(health,/onClick=\{\(\) => onReview\?\.\(level\.health\)\}/)
  assert.doesNotMatch(health,/className="rundeckWorkloadDot/)
})

test('five SAP APP hexagons use fixed 3+2 positions and preserve status identity', () => {
  const app=read('RundeckUnifiedAppInfrastructure.jsx')
  const css=read('RundeckCockpitHexV13512.css')
  assert.match(app,/hosts\.length === 5 \? ' is-honeycomb'/)
  assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)!important/)
  for (let index=1;index<=5;index++) {
    assert.ok(css.includes('.rundeckAppHexSelector:nth-child(' + index + ')'))
  }
  assert.match(css,/nth-child\(4\)\{grid-column:2 \/ span 2;grid-row:2\}/)
  assert.match(css,/nth-child\(5\)\{grid-column:4 \/ span 2;grid-row:2\}/)
  assert.match(css,/@media \(max-width:899px\)/)
  assert.match(app,/onClick=\{\(\) => \{ selectApp\(key\); onSelectApp\?\.\(host\.host\); openAppAnalysis\(host\) \}\}/)
})

test('status distribution is proportional to verified saved counts, not first-page estimates', () => {
  const health=read('RundeckWorkloadHealth.jsx')
  const css=read('RundeckCockpitHexV13512.css')
  assert.match(health,/validatedWorkloadDots\(first, following, 0, completePageSize\)/)
  assert.match(health,/const count = Number\(preview\.health\[level\.key\]\) \|\| 0/)
  assert.match(health,/style=\{\{ flexGrow: count \}\}/)
  assert.match(css,/\.rundeckWorkloadDistribution button \{/)
  for (const category of ['review','attention','unknown','normal']) {
    assert.ok(css.includes('.rundeckWorkloadDistribution .is-' + category))
  }
})

test('compact evaluation panel keeps the five SAP APP hexagons and avoids hundreds of rendered buttons', () => {
  const health=read('RundeckWorkloadHealth.jsx')
  const css=read('RundeckCockpitHexV13512.css')
  assert.match(health,/aria-label="Proportion of saved evaluations by category"/)
  assert.match(health,/onClick=\{\(\) => onReview\?\.\(level\.health\)\}/)
  assert.doesNotMatch(health,/dotGridRef|dotLayout|is-staggered-row/)
  assert.ok(css.includes('height:24px'))
  assert.match(css,/\.rundeckAppHexSelector:nth-child\(4\)/)
})

test('v1.35.17 chart Focus is explicit, reversible, and preserves threshold references', () => {
  const trend=read('RundeckServerTrend.jsx')
  const css=read('RundeckCockpitHexV13512.css')
  assert.match(trend,/useState\('full'\)/)
  assert.match(trend,/trendPercentAxisMax\(rows, valueKey, scaleMode\)/)
  assert.match(trend,/visibleThresholds/)
  assert.match(trend,/thresholds unchanged/)
  assert.match(trend,/Y Axis · \{scaleMode === 'focus'/)
  assert.match(css,/\.rundeckTrendYAxisToggle/)
  assert.match(css,/aria-pressed="true"/)
})

test('v1.35.18 saved evaluation categories are backend Review shortcuts, not local color filters', () => {
  const health=read('RundeckWorkloadHealth.jsx')
  const workspace=read('RundeckJobsProgramsWorkspace.jsx')
  const review=read('RundeckPerformanceReview.jsx')
  assert.ok(health.includes("health: 'REVIEW'"))
  assert.ok(health.includes("health: 'ATTENTION'"))
  assert.ok(health.includes("health: 'UNKNOWN'"))
  assert.ok(health.includes("health: 'NORMAL'"))
  assert.ok(health.includes("onClick={() => onReview?.(level.health)}"))
  assert.ok(health.includes("disabled={!preview}"))
  assert.ok(workspace.includes("setReviewJumpHealth"))
  assert.ok(workspace.includes("reviewJumpHealth,"))
  assert.ok(review.includes("reviewJumpHealth = 'REVIEW'"))
  assert.ok(review.includes("setPeriod('1d')"))
  assert.ok(review.includes("health:healthGroup"))
  assert.ok(review.includes("result.page.scope !== 'FULL_EVALUATED_POPULATION'"))
  const trend=read('RundeckServerTrend.jsx')
  assert.ok(trend.includes("technicalAxisMax ?? 'auto'"),'chart schema resets when switching axis scale')
})

test('v1.35.19 APP and Infrastructure source times are named independently',()=>{
  const app=read('RundeckUnifiedAppInfrastructure.jsx')
  const css=read('RundeckCockpitHexV13512.css')
  assert.match(app,/SAP APP sample ·/)
  assert.match(app,/Infra FS · \{mountNote\}/)
  assert.match(app,/Infra sampled/)
  assert.match(app,/Last Infra sample/)
  assert.match(app,/selectedHost\?\.collected_at/)
  assert.match(app,/fsSampleAt/)
  assert.match(app,/fsFresh && selectedInfra\?\.topFs/)
  assert.match(css,/\.rundeckSelectedAppSource small/)
})

test('v1.35.21 evaluation summary has bounded categories, verified counts and navigation', () => {
  const css=read('RundeckCockpitHexV13512.css')
  const ui=read('RundeckWorkloadHealth.jsx')
  assert.match(css,/DEV v1\.35\.19 — final cockpit polish layer/)
  assert.match(css,/\.rundeckWorkloadHealthFooter :is\(span,small\)/)
  assert.match(ui,/validatedWorkloadDots\(first, following, 0, completePageSize\)/)
  assert.match(ui,/className="rundeckWorkloadDistribution"/)
  assert.match(ui,/aria-label=\{level\.label \+ ': ' \+ count/)
  assert.match(ui,/onClick=\{\(\) => onReview\?\.\(level\.health\)\}/)
  assert.match(ui,/not SAP SM37 job status/)
})

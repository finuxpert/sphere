import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveServerTrendMetrics } from '../../src/tools/components/rundeckTrendPreferences.js'

const source = (name) => readFileSync(new URL('../../src/tools/components/' + name, import.meta.url), 'utf8')

test('first-load trends default to CPU and RAM', () => {
  assert.deepEqual(resolveServerTrendMetrics(), { first: 'cpu', second: 'ram' })
})

test('legacy duplicate CPU preferences are normalized without a stale second CPU chart', () => {
  assert.deepEqual(resolveServerTrendMetrics({ serverMetric1: 'cpu', serverMetric2: 'cpu' }), { first: 'cpu', second: 'ram' })
  assert.deepEqual(resolveServerTrendMetrics({ serverMetric: 'cpu', serverMetric2: 'cpu' }), { first: 'cpu', second: 'ram' })
  assert.deepEqual(resolveServerTrendMetrics({ serverMetric1: 'ram', serverMetric2: 'ram' }), { first: 'ram', second: 'cpu' })
})

test('valid distinct operator preferences remain respected', () => {
  assert.deepEqual(resolveServerTrendMetrics({ serverMetric1: 'wp', serverMetric2: 'iowait' }), { first: 'wp', second: 'iowait' })
  assert.deepEqual(resolveServerTrendMetrics({ serverMetric1: 'unknown', serverMetric2: 'unknown' }), { first: 'cpu', second: 'ram' })
})

test('cockpit layout only constrains large short desktop windows; long tables scroll internally', () => {
  const css = source('RundeckCockpitPolish.css')
  assert.match(css, /min-width:1281px/)
  assert.match(css, /min-height:780px/)
  assert.match(css, /max-height:1100px/)
  assert.match(css, /100dvh/)
  assert.match(css, /\.rundeckCurrentWorkloadTableWrap/)
  assert.match(css, /overflow-y: auto !important/)
  assert.match(source('RundeckMonitoringHistory.jsx'), /import '\.\/RundeckCockpitPolish\.css'/)
})

test('System Data shares centered modal with scrim, keyboard trap, Escape and scroll/focus restoration', () => {
  const jsx = source('RundeckWorkspaceDrawer.jsx')
  const wrapper = source('RundeckMonitoringHistory.jsx')
  const css = source('RundeckCockpitPolish.css')
  const unified = source('RundeckUnifiedModalPolish.css')
  assert.match(wrapper, /activeOverlay\?\.type === 'system-data'/)
  assert.match(wrapper, /size="system-data"/)
  assert.match(jsx, /const isModal = true/)
  assert.match(jsx, /aria-modal=\{isModal\}/)
  assert.match(jsx, /isModal && <div className="rundeckWorkspaceModalBackdrop"/)
  assert.match(jsx, /event\.key === 'Escape'/)
  assert.match(jsx, /event\.key !== 'Tab'/)
  assert.match(jsx, /first\.focus\(\)/)
  assert.match(jsx, /last\.focus\(\)/)
  assert.match(jsx, /document\.body\.style\.overflow = previousOverflow/)
  assert.match(jsx,/previousFocus\?\.focus\?\.\(\{\s*preventScroll:\s*true\s*\}\)/)
  assert.match(css, /\.rundeckWorkspaceDrawer\.is-system-data/)
  assert.match(unified, /\.is-observation-history,\.is-system-data/)
  assert.match(unified, /transform:translate\(-50%,-50%\)!important/)
})

test('motion is short, non-looping and honors reduced-motion preferences', () => {
  const css = source('RundeckCockpitPolish.css')
  const chart = source('RundeckServerTrend.jsx')
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.doesNotMatch(css, /animation-iteration-count:\s*infinite|animation:[^;]*infinite/)
  assert.match(chart, /animationDuration: reduceMotion \? 0 : 300/)
  assert.match(chart, /animationDurationUpdate: reduceMotion \? 0 : 200/)
})

test('v1.34.80 chart updates reuse the same ECharts instance and preserve null gaps', () => {
  const chart = source('RundeckServerTrend.jsx')
  assert.match(chart, /chartRef\.current = chart/)
  assert.match(chart, /replaceMerge: schemaChanged \? undefined : \['series'\]/)
  assert.match(chart, /connectNulls: false/)
  assert.match(chart, /value: \[at, null\], gap: true/)
  assert.match(chart, /aria-label="Highlight APP trace"/)
  assert.match(chart, /prefers-reduced-motion: reduce/)
})

test('Jobs & Programs modes expose keyboard-accessible tabs and finite transitions', () => {
  const tabs = source('RundeckJobsProgramsWorkspace.jsx')
  const css = source('RundeckCockpitPolish.css')
  assert.match(tabs, /role="tabpanel"/)
  assert.match(tabs, /ArrowLeft/)
  assert.match(tabs, /ArrowRight/)
  assert.match(tabs, /aria-selected=\{mode === 'search'\}/)
  assert.match(css, /sphereWorkModeArrival 180ms/)
  assert.match(css, /prefers-reduced-motion: reduce/)
})


test('v1.34.84 Cloudflare-inspired motion stays finite, non-causal and opt-out accessible', () => {
  const css = source('RundeckCloudflareMotion.css')
  const sourceJsx = source('RundeckMonitoringHistory.jsx')
  assert.match(sourceJsx, /import '\.\/RundeckCloudflareMotion\.css'/)
  assert.match(css, /radial-gradient\(ellipse at 18% -22%/)
  assert.match(css, /translate3d\(0,-2px,0\)/)
  assert.match(css, /sphereSoftScrimEnter 190ms/)
  assert.match(css, /\.rundeckJobsProgramsModes button::after/)
  assert.match(css, /pointer:fine/)
  assert.match(css, /prefers-reduced-motion:reduce/)
  assert.doesNotMatch(css, /animation-iteration-count\s*:\s*infinite|animation:[^;]*infinite/i)
  assert.doesNotMatch(css, /setInterval|requestAnimationFrame|innerText|textContent|cpu_pct|ram_pct/)
})


test('v1.34.85 light operator palette corrects shadowed vars and preserves data semantics', () => {
  const light = source('RundeckCloudflareLight.css')
  const jsx = source('RundeckMonitoringHistory.jsx')
  const app = source('RundeckUnifiedAppInfrastructure.jsx')
  const chart = source('RundeckServerTrend.jsx')
  assert.match(jsx, /import '\.\/RundeckCloudflareLight\.css'/)
  assert.match(light, /html\[data-theme="light"\] \.logV2Inner:has\(\.rundeckPanel\)/)
  assert.match(light, /--sphere-page:#f8fafc/)
  assert.match(light, /--sphere-text:#111827/)
  assert.match(light, /--sphere-chart-grid:rgba\(71,85,105,\.16\)/)
  assert.match(light, /grid-template-areas:"snapshot" "history"/)
  assert.match(light, /\.rundeckInfraTrendWorkspace \.rundeckInfraChartWrap svg/)
  assert.match(light, /overflow-wrap:anywhere!important/)
  assert.match(light, /prefers-reduced-motion:reduce/)
  assert.match(app, /appSignalState\(host, performanceVerified\)/)
  // Selected APP reads real source metrics; filesystem evidence remains independent.
  assert.match(app,/rundeckAppHexSelector/)
  assert.match(app,/selectedInfra\?\.topFs\?\.mount_point/)
  assert.match(app,/metric\(selectedInfra\.topFs\.used_pct, '%'/)
  assert.match(app,/selectedInfra\?\.freshness/)
  assert.match(app,/filesystem is separate Infrastructure telemetry/i)
  assert.match(app,/hostInfrastructureEvidence\(selectedHost, infraSnapshot\.hosts, infraSnapshot\.filesystems, nowMs\)/)
  assert.match(chart, /MutationObserver/)
  assert.match(chart, /themeRevision\]/)
  assert.doesNotMatch(light, /animation-iteration-count\s*:\s*infinite/i)
})


test('v1.34.86 unifies analysis modal geometry and preserves unresolved SAP identity keys', async () => {
  const modal=source('RundeckUnifiedModalPolish.css')
  const history=source('RundeckMonitoringHistory.jsx')
  const drawer=source('RundeckWorkspaceDrawer.jsx')
  const workload=source('RundeckCurrentWorkload.jsx')
  const identity=source('sapUiFormat.js')
  assert.match(modal, /top:50%!important/)
  assert.match(modal, /left:50%!important/)
  assert.match(modal, /translate\(-50%,-50%\)/)
  assert.match(modal, /prefers-reduced-motion:reduce/)
  assert.match(drawer, /const isModal = true/)
  assert.match(history, /title="Related Events & Run History"/)
  assert.match(history, /aria-label="Related events timeline"/)
  assert.match(history, /aria-label="Run history"/)
  assert.match(history, /RundeckObservationHistory/)
  assert.doesNotMatch(history, /className="rundeckAnalysisContextStrip"/)
  assert.match(workload, /observedWorkloadName\(row.consumer_key, details\)/)
  assert.match(identity, /export const observedWorkloadName/)
})


test('DEV motion restoration keeps source data correct and animation interactive', () => {
  const app = source('RundeckUnifiedAppInfrastructure.jsx')
  const globe = source('RundeckEvaluationGlobe.jsx')
  const trendAmbient = source('rundeckTrendAmbient.js')
  const health = source('RundeckWorkloadHealth.jsx')
  const status = source('RundeckSystemHealth.jsx')
  const css = source('RundeckSphereMotion.css')

  assert.match(app, /const attentionCount = visibleStates\.filter\(value => value === 'ATTENTION'\)/)
  assert.match(app, /const warningCount = visibleStates\.filter\(value => value === 'WARNING'\)/)
  assert.match(app, /SAP APP sample · \{appKey\}/)
  assert.match(app, /if \(!expanded\) phase \+= delta \* \.22/)
  assert.match(app, /if \(!expanded \|\| moving\) raf = window\.requestAnimationFrame\(tick\)/)
  assert.match(app, /const viewportObserver = typeof IntersectionObserver/)
  assert.match(app, /prefers-reduced-motion: no-preference/)
  assert.match(globe, /if \(!expandedRef\.current\) phase \+= dt \* \.17/)
  assert.match(globe, /if \(!expandedRef\.current \|\| morph !== target\) raf = requestAnimationFrame\(paint\)/)
  assert.match(globe, /if \(document\.hidden \|\| !visible/)
  assert.match(trendAmbient, /if\(!target\)angle\+=dt\*\.14/)
  assert.match(trendAmbient, /if\(target===0\|\|morph!==target\)wake\(\)/)
  assert.match(trendAmbient, /reduce\?\.matches\|\|compact\?\.matches\|\|coarse\?\.matches/)
  assert.match(trendAmbient, /if\(stopped\|\|disabled\|\|!intersecting\|\|document\.hidden\)return/)
  assert.match(health, /tabIndex=\{index === activeDotIndex \? 0 : -1\}/)
  assert.match(health, /onKeyDown=\{event => handleDotNavigation\(event, index\)\}/)
  assert.match(health, /Saved 24h/)
  assert.match(status, /<span>Monitoring Status<\/span>/)
  assert.match(css, /\.rundeckWorkloadDot:focus-visible/)
})


test('DEV restored braid keeps verified ECharts accessible on focus and incidents visible', () => {
  const trendStyle = source('RundeckTrendAmbient.css')
  const issue = source('RundeckSapIssues.jsx')
  const checksStyle = source('RundeckSapChecksLayout.css')
  const workload = source('RundeckCurrentWorkload.jsx')
  const infra = source('RundeckInfrastructure.jsx')
  const cockpitStyle = source('RundeckCockpitHexV13512.css')

  // Full ambient mode returns at idle; original ECharts still exist and
  // their controls are revealed by hover/focus without changing samples.
  assert.match(trendStyle, />\\.rundeckUnifiedVortexCanvas\\{opacity:1\\}/)
  assert.match(trendStyle, /\\.is-expanded::before\\{opacity:0/)
  assert.match(trendStyle, /var\\(--sphere-surface-1,#141d23\\)/)
  assert.match(source('RundeckServerTrend.jsx'), /onFocusCapture=\\{\\(\\) => setUnifiedHovered\\(true\\)\\}/)
  assert.match(source('RundeckServerTrend.jsx'), /connectNulls: false/)
  assert.match(source('RundeckServerTrend.jsx'), /\{ value: \[at, null\], gap: true \}/)

  // Short retained-incident histories are visible without a hidden disclosure.
  assert.match(issue, /open=\{!paired \|\| \(incidentItems\.length > 0 && incidentItems\.length <= 5\)\}/)
  assert.match(issue, /separateWarningCount/)
  assert.match(checksStyle, /\.rundeckSapChecksHistoryDisclosure\[open\]>summary::after/)
  assert.match(checksStyle, /max-height:min\(194px,26dvh\)/)

  // Manual marker list must never be confused with APP Critical WP warning.
  assert.match(workload, />Marked Workloads <b>\{attentionRows\.length\}<\/b>/)
  assert.match(workload, /latest collection · observed/)
  assert.match(infra, /<b>Collector sample<\/b>/)
  assert.match(infra, /Latest collected readings/)
  assert.match(infra, /Last retained readings/)
  assert.match(cockpitStyle, /font-size:10\.5px!important/)
})

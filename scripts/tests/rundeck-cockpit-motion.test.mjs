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

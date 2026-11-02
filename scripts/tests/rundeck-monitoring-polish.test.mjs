import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = name => readFileSync(new URL('../../src/tools/components/' + name, import.meta.url), 'utf8')

test('monitoring uses a source-preserving final stylesheet after Bootstrap foundation', () => {
  const page = read('RundeckMonitoringHistory.jsx')
  assert.match(page, /import '\.\/RundeckBootstrapFoundation\.css'\s*\nimport '\.\/RundeckMonitoringPolish\.css'/)
  assert.match(page, /sphereSystemHealthCompact/)
  assert.match(page, /RundeckInfrastructure healthMatrix/)
  assert.doesNotMatch(page, /Backup monitor:/)
})

test('desktop overview allocates room for jobs and presents health as flat rows', () => {
  const base = read('RundeckOneScreenDev.css')
  const polish = read('RundeckMonitoringPolish.css')
  assert.match(base, /grid-template-columns:\s*minmax\(0,58fr\) minmax\(0,42fr\)/)
  assert.match(polish, /\.sphereOverviewDetails \.sphereHealthSummaryGrid/)
  assert.match(polish, /grid-template-columns:\s*minmax\(0, 1fr\)/)
  assert.match(polish, /\.sphereHealthInlineBlock:last-child/)
  assert.match(polish, /@media \(max-width: 699px\)/)
  assert.doesNotMatch(polish, /display:\s*none\s*!important|visibility:\s*hidden\s*!important/)
})

test('four selectable trends retain source timestamps and 24h dates', () => {
  const source = read('RundeckServerTrend.jsx')
  assert.match(source, /row-cols-1 row-cols-md-2 row-cols-xxl-4 g-2/)
  assert.match(source, /const dateLabel = new Intl\.DateTimeFormat/)
  assert.ok(source.includes("return dateLabel + '\\n' + clockLabel"))
  assert.ok(source.includes("if (range === '24h') return 4"))
  assert.match(source, /formatTrendPeakWib\(panelPeak\.timestamp\)/)
  assert.match(source, /No matching saved observation/)
})

test('compact review keeps evidence-backed counts and drilldowns', () => {
  const source = read('RundeckWorkloadHealth.jsx')
  assert.match(source, /Programs for Review/)
  assert.match(source, /saved performance review|Saved evaluation/)
  assert.match(source, /onReview\?\.\(level\.health\)/)
  assert.match(source, /onClick=\{\(\) => openWorkload\(row\)\}/)
})

test('unverified evaluation has one actionable state before KPI rendering', () => {
  const component = read('RundeckWorkloadHealth.jsx')
  const guard = component.indexOf('if (compactSummary && !preview) return')
  const verified = component.indexOf('if (compactSummary) return', guard)
  assert.ok(guard > 0 && verified > guard)
  const fallback = component.slice(guard, verified)
  assert.match(fallback, /Evaluation unavailable/)
  assert.match(fallback, /Loading evaluations/)
  assert.match(fallback, /No verified evaluation/)
  assert.match(fallback, /setRetryToken\(token => token \+ 1\)/)
  assert.doesNotMatch(fallback, /sphereWorkloadSummaryMetrics/)
})

test('enterprise dark theme uses common surface and preserves severity markers', () => {
  const css = read('RundeckUnifiedExperience20261030.css')
  assert.match(css, /--cockpit-surface:#1b2835/)
  assert.match(css, /--cockpit-outline:#304150/)
  assert.match(css, /--sphere-accent:#67a9e8/)
  assert.match(css, /\.sphereOverviewBottomRow > :is\(\.rundeckJobsProgramsOverview,\.sphereOverviewDetails\)/)
  for (const level of ['normal', 'warning', 'critical']) {
    assert.match(css, new RegExp('is-sap-' + level))
  }
  assert.doesNotMatch(css, /\.sphereWorkloadUnavailable[^}]*display:\s*none/s)
})

test('Monitoring globe uses dedicated four-area layout without overwriting by-app reports', () => {
  const source = read('RundeckWorkloadHealth.jsx')
  const css = read('RundeckUnifiedExperience20261030.css')
  assert.match(source, /is-monitoring-globe/)
  assert.match(css, /grid-template-areas:"eval-heading" "eval-kpis" "eval-globe" "eval-footer"/)
  for (const key of ['eval-heading','eval-kpis','eval-globe','eval-footer']) assert.match(css, new RegExp('grid-area:'+key))
  assert.match(css, /--hex-fill:#214339!important/)
  assert.match(css, /sphereServiceToolbarCounts/)
})
test('SAP overview keeps last-check provenance and compact issue counts', () => {
  const monitor = read('RundeckMonitoringHistory.jsx')
  const availability = read('RundeckAvailability.jsx')
  const issues = read('RundeckSapIssues.jsx')
  assert.match(monitor, /inlineSummary toolbarSummary hideDetailsAction/)
  assert.match(availability, /inlineSummary && toolbarSummary/)
  assert.match(availability, /Last check/)
  assert.match(issues, /inlineSummary && toolbarSummary/)
  assert.match(issues, /No Data/)
})
test('APP source identity remains available behind a concise label', () => {
  const app = read('RundeckAppServerAnalysis.jsx')
  const css = read('RundeckUnifiedAppAnalysis.css')
  assert.match(app, /title=\{\[identity\.full/)
  assert.match(app, /onClick=\{openWorkload\}/)
  assert.match(css, /\.rundeckAppFullIdentity > strong/)
  assert.match(css, /text-overflow:ellipsis!important/)
})

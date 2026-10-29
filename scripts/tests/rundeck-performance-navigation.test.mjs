import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../../src/tools/components/' + path, import.meta.url), 'utf8')

test('SAP Operations exposes all six deep-linked workspaces without changing ST03N routing', () => {
  const navigation = read('RundeckPerformanceNavigation.jsx')
  const state = read('RundeckPerformanceNavigationState.js')
  for (const key of ['performance','jobs','events','sap-checks','infrastructure','system-data','monthly-review']) {
    assert.match(state, new RegExp("id: '" + key + "'"))
  }
  assert.match(state, /location\.hash/)
  assert.match(navigation, /aria-current=\{activeView === item\.id/)
  assert.match(navigation, /href=\{item\.id === 'performance'/)
})

test('performance shell preserves live components and uses page navigation for operations', () => {
  const wrapper = read('RundeckMonitoringHistory.jsx')
  for (const component of ['RundeckMonitoringHistoryCore','RundeckJobsProgramsWorkspace',
    'RundeckEvidenceTimeline','RundeckObservationHistory','RundeckSapIssues',
    'RundeckAvailability','RundeckInfrastructure','RundeckMonthlyReview']) {
    assert.ok(wrapper.includes('<' + component), component + ' remains connected')
  }
  assert.match(wrapper, /window\.addEventListener\('hashchange', sync\)/)
  assert.match(wrapper, /activeView === 'performance'/)
  assert.match(wrapper, /<RundeckPerformanceNavigation/)
  assert.match(wrapper, /onOpenEvaluatedWorkload=\{openEvaluatedWorkload\}/)
  assert.match(wrapper, /sourceHosts=\{props\.sourceHosts \|\| \[\]\}/)
})

test('fleet mode disables moving orbit controls and retains source-backed selected APP metrics', () => {
  const core = read('RundeckMonitoringHistoryCore.jsx')
  const app = read('RundeckUnifiedAppInfrastructure.jsx')
  const css = read('RundeckPerformanceShell.css')
  assert.match(core, /fleetMode/)
  assert.match(app, /fleetMode \|\| hosts\.length !== 5/)
  assert.match(app, /matchedInfrastructureHost/)
  assert.match(app, /selectedHost\.cpu_pct/)
  assert.match(app, /selectedHost\.ram_pct/)
  assert.match(css, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)\s*!important/)
  assert.match(css, /\.rundeckAppChecksPanel\s*\{\s*display:\s*none\s*!important/)
  assert.match(css, /@media\s*\(max-width:\s*640px\)/)
})

test('new UI scope does not remove evidence and infrastructure provenance', () => {
  const app = read('RundeckUnifiedAppInfrastructure.jsx')
  const review = read('RundeckMonthlyReview.jsx')
  assert.match(app, /infraHostVerified/)
  assert.match(app, /fsFresh/)
  assert.match(review, /buildMonthlyPdf/)
})

test('performance cockpit is a normal-flow stack; APP fleet, Trends, and Workload cannot share grid cells', () => {
  const css = read('RundeckPerformanceShell.css')
  const core = read('RundeckMonitoringHistoryCore.jsx')
  assert.doesNotMatch(css, /display:\s*contents\s*!important/)
  assert.match(css, /\.rundeckMonitoring\.rundeckCockpitV13491\s*\{[\s\S]*?display:\s*flex\s*!important/)
  assert.match(css, /flex-direction:\s*column\s*!important/)
  assert.match(css, /grid-template-areas:\s*none\s*!important/)
  assert.match(css, /\.rundeckAppHexMain\.rundeckAppThreePanels\s*\{[\s\S]*?grid-template-columns:\s*minmax/)
  assert.match(css, /\.rundeckTrendBandV13454/)
  assert.match(css, /\.rundeckJobsProgramsOverview/)
  const a = core.indexOf('<RundeckUnifiedAppInfrastructure')
  const b = core.indexOf('<RundeckServerTrend')
  const c = core.indexOf('<RundeckWorkloadHealth')
  assert.ok(a > 0 && b > a && c > b, 'APP, trends and evaluations stay in reading order')
})

test('fleet and selected APP summary use compact two-row layout instead of a stretched empty card', () => {
  const css = read('RundeckPerformanceShell.css')
  const marker = 'v1.35.20 DEV finishing: compact APP fleet'
  assert.ok(css.includes(marker), 'compact finishing rules must be present')
  const compact = css.slice(css.indexOf(marker))
  assert.match(compact, /\.rundeckAppHexMain\.rundeckAppThreePanels\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.match(compact, /grid-template-rows:\s*auto auto\s*!important/)
  assert.match(compact, /\.rundeckAppMotionPanel\s*\{[\s\S]*?min-height:\s*0\s*!important/)
  assert.match(compact, /\.rundeckAppDetailPanel\s*\{[\s\S]*?display:\s*grid\s*!important/)
  assert.match(compact, /\.rundeckSelectedAppMetrics\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(compact, /@media\s*\(max-width:\s*560px\)/)
  const infra = read('RundeckUnifiedAppInfrastructure.jsx')
  for (const value of ['selectedHost.cpu_pct', 'selectedHost.ram_pct', 'selectedHost.wp_critical', 'selectedInfra.topFs.used_pct', 'openSelectedAnalysis']) {
    assert.ok(infra.includes(value), 'APP metrics and navigation remain source-backed: ' + value)
  }
})

test('Operational Checks own full-page CSS scope without overriding investigation drawers', () => {
  const main = read('RundeckMonitoringHistory.jsx')
  const css = read('RundeckOperationalPagesV135.css')
  assert.match(main, /import '\.\/RundeckOperationalPagesV135\.css'/)
  assert.match(main, /className=\{\x60spherePerformancePage is-\$\{activeView\}\x60\}/)
  for (const view of ['infrastructure', 'sap-checks', 'events', 'jobs']) {
    assert.ok(css.includes('.spherePerformancePage.is-' + view), view + ' is scoped to its own page')
  }
  assert.doesNotMatch(css, /\.rundeckWorkspaceDrawerBody\s*>\s*\.rundeckInfra/)
  assert.doesNotMatch(css, /\.rundeckWorkspaceDrawer\.is-/)
})

test('Infrastructure workspace is stacked with independent readable telemetry cards', () => {
  const css = read('RundeckOperationalPagesV135.css')
  const component = read('RundeckInfrastructure.jsx')
  assert.match(css, /\.is-infrastructure \.rundeckInfraWorkspace\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.match(css, /\.is-infrastructure \.rundeckInfraGrid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(235px/)
  assert.match(css, /\.is-infrastructure \.rundeckInfraGrid :is\(th, td\)/)
  for (const feature of ['rundeckInfraHostCards', 'rundeckInfraTrendWorkspace', 'rundeckInfraFreshness', 'rundeckInfraChartWrap']) {
    assert.ok(component.includes(feature), feature + ' remains data-backed and selectable')
  }
})

test('SAP Checks and Related Events keep their evidence, with responsive full-page layout', () => {
  const css = read('RundeckOperationalPagesV135.css')
  const wrapper = read('RundeckMonitoringHistory.jsx')
  assert.match(css, /\.is-sap-checks \.rundeckSapChecksDetailGrid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(330px/)
  assert.match(css, /\.is-events \.rundeckEvidenceEvent\s*\{[\s\S]*?grid-template-columns:\s*126px/)
  assert.match(css, /\.is-events \.rundeckObservationHistoryTableWrap/)
  for (const prop of ['paired refreshToken={refreshToken} job={selectedJob}', 'readinessRoot={readinessSummaryRoot}', 'historyRoot={incidentHistoryRoot}']) {
    assert.ok(wrapper.includes(prop), 'keeps existing monitoring evidence: ' + prop)
  }
})

test('Jobs & Programs reclaims full width but preserves tabs, saved evaluation and pagination', () => {
  const css = read('RundeckOperationalPagesV135.css')
  const workspace = read('RundeckJobsProgramsWorkspace.jsx')
  assert.match(css, /\.is-jobs \.rundeckJobsProgramsSplit/)
  assert.match(css, /\.is-jobs \.rundeckCurrentWorkload table/)
  for (const text of ['Current', 'Review', 'Search', 'showHealth &&', 'currentContent', 'reviewContent']) {
    assert.ok(workspace.includes(text), text + ' remains operational')
  }
})

test('V1.43 sidebar is collapsible, keyboard labeled and retains all SAP workspaces', () => {
  const nav=read('RundeckPerformanceNavigation.jsx')
  const wrapper=read('RundeckMonitoringHistory.jsx')
  const css=read('RundeckEnterpriseShellV143.css')
  assert.match(nav,/React\.useState\(false\)/)
  assert.match(nav,/data-sidebar-state=\{collapsed \? 'collapsed' : 'expanded'\}/)
  assert.match(nav,/aria-expanded=\{!collapsed\}/)
  assert.match(nav,/aria-label=\{item\.label\}/)
  assert.match(nav,/onClick=\{\(\) => setCollapsed\(value => !value\)\}/)
  assert.match(wrapper,/RundeckEnterpriseShellV143\.css/)
  assert.match(css,/spherePerformanceShell:has\(\.spherePerformanceSidebar\.is-collapsed\)/)
  assert.match(css,/grid-template-columns:64px minmax\(0,1fr\)/)
  assert.match(css,/spherePerformanceSidebar\.is-expanded/)
  assert.match(css,/@media\(max-width:899px\)/)
  assert.doesNotMatch(css,/\.rundeckAppEvalLane\s*\{[\s\S]*display:\s*none/)
})

test('three main sections preserve older monitoring deep links', () => {
  const state=read('RundeckPerformanceNavigationState.js')
  const nav=read('RundeckPerformanceNavigation.jsx')
  const wrapper=read('RundeckMonitoringHistory.jsx')
  const jobs=read('RundeckJobsProgramsWorkspace.jsx')
  const review=read('RundeckPerformanceReview.jsx')
  assert.match(state,/PRIMARY_PERFORMANCE_VIEWS/)
  for(const label of ['Monitoring','Data Collection','Reports'])assert.ok(state.includes("label:'"+label+"'"))
  for(const id of ['performance','jobs','events','sap-checks','infrastructure','system-data','monthly-review'])assert.ok(state.includes("id: '"+id+"'"))
  assert.match(nav,/React\.useState\(false\)/)
  assert.match(nav,/SPHERE/)
  assert.match(nav,/PRIMARY_PERFORMANCE_VIEWS\.map/)
  assert.match(wrapper,/aria-label="System Health"/)
  assert.match(wrapper,/sphereHealthSummaryGrid/)
  assert.match(jobs,/const tabs = \['live', 'review'\]/)
  assert.match(review,/React\.useState\(embedded\)/)
  assert.match(wrapper,/sphereHealthSummaryGrid/)
  assert.match(read('RundeckSource.jsx'),/sphere:set-source/)
  assert.match(read('RundeckDataCollection.jsx'),/Open Manual Upload/)
})

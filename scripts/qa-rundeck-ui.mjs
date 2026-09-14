import fs from 'node:fs'
import { systemHealthState } from '../src/tools/components/rundeckSystemHealth.js'
import { hostResourceState, sapWorkloadState } from '../src/tools/components/rundeckStatusSemantics.js'

const read = (path) => fs.readFileSync(path, 'utf8')
const files = {
  version: read('src/app/version.js'),
  workspace: read('src/tools/ToolLogWorkspace.jsx'),
  source: read('src/tools/components/RundeckSource.jsx'),
  wrapper: read('src/tools/components/RundeckMonitoringHistory.jsx'),
  core: read('src/tools/components/RundeckMonitoringHistoryCore.jsx'),
  incident: read('src/tools/components/RundeckPerformanceIncident.jsx'),
  trend: read('src/tools/components/RundeckServerTrendV1234.jsx'),
  observation: read('src/tools/components/RundeckObservationHistoryV1234.jsx'),
  css: read('src/tools/components/RundeckWorkspaceV1236.css'),
  availability: read('src/tools/components/RundeckAvailability.jsx'),
  issues: read('src/tools/components/RundeckSapIssuesV1231.jsx'),
  review: read('src/tools/components/RundeckPerformanceReviewV1231.jsx'),
  backendEvidence: read('backend/rundeck_evidence.py'),
  backendRunner: read('backend/rundeck_runner.py'),
}

const forbiddenStructuralImports = [
  'RundeckWorkspaceCompact.css',
  'RundeckWorkspaceFinalPolish.css',
  'RundeckWorkspaceRails.css',
  'RundeckWorkspaceAlignedBands.css',
  'RundeckWorkspaceFlowBands.css',
  'RundeckWorkspaceConvergenceV1205.css',
  'RundeckLayoutNormalizationV1232.css',
  'RundeckStructuralBandsV1233.css',
  'RundeckExplicitBandsV1234.css',
  'RundeckExplicitBandsV1234Responsive.css',
  'RundeckExplicitBandsV1234Override.css',
  'RundeckExplicitBandsV1234OverrideTrend.css',
  'RundeckExplicitBandsV1234OverrideWorkload.css',
  'RundeckExplicitBandsV1235Closure.css',
]

const normalHost = { cpu_pct: 20, ram_pct: 55, io_wait_pct: 0, wp_critical: 0 }
const criticalWorkload = { ...normalHost, wp_critical: 3 }
const criticalResource = { ...normalHost, cpu_pct: 95 }

const checks = [
  ['version is v1.23.6', files.version.includes("APP_VERSION = '1.23.6'") && files.version.includes("APP_PREVIOUS_VERSION = '1.23.5'") && files.version.includes('frontend-debt-retirement-v1.23.6')],
  ['one structural stylesheet is loaded', files.workspace.includes('RundeckWorkspaceV1236.css')],
  ['legacy structural imports are retired', forbiddenStructuralImports.every((name) => !files.workspace.includes(name))],
  ['monitoring stylesheet is owned by active wrapper', files.wrapper.includes("import './RundeckMonitoringHistory.css'")],
  ['canonical monitoring core is active', files.wrapper.includes("RundeckMonitoringHistoryCore from './RundeckMonitoringHistoryCore.jsx'") && !files.wrapper.includes('CoreV1234')],
  ['row 1 keeps explicit operational band', files.incident.includes('rundeckOperationalBandV1234') && files.incident.includes('is-operational-events') && files.incident.includes('is-availability')],
  ['row 2 keeps explicit APP/trend band', files.core.includes('rundeckServerTrendBandV1235') && files.core.includes('is-app-servers') && files.core.includes('is-server-trend')],
  ['row 3 keeps explicit workload band', files.core.includes('rundeckWorkloadBandV1235') && files.core.includes('is-current-workload') && files.core.includes('is-selected-workload')],
  ['desktop ratios remain 45/55 and 40/60', files.css.includes('45fr') && files.css.includes('55fr') && files.css.includes('40fr') && files.css.includes('60fr')],
  ['canonical CSS has no float rail ownership', !files.css.includes('float: left') && !files.css.includes('float: right') && !files.css.includes('display: contents')],
  ['canonical CSS has no negative layout lift', !/margin-top:\s*-/.test(files.css)],
  ['server trend is a closed formatting context', files.trend.includes('rundeckServerTrendPanelV1234') && files.css.includes('display: flow-root')],
  ['observation history remains full width', files.observation.includes('rundeckObservationHistoryV1234') && files.css.includes('.rundeckObservationHistoryV1234')],
  ['availability remains trust-aware', files.availability.includes('rundeckAvailabilityDataTrust') && files.availability.includes('Collection gap')],
  ['SAP Issues remains operator-readable', files.issues.includes('<th>APP</th><th>Issue</th><th>Now</th><th>Peak</th><th>Duration</th>')],
  ['Performance Review remains lean', files.review.includes('Performance Review') && files.review.includes('<th>Workload</th><th>Why</th><th>Avg CPU</th><th>Peak</th><th>PSS</th>')],
  ['critical workload without service impact remains ATTENTION', hostResourceState(criticalWorkload) === 'NORMAL' && sapWorkloadState(criticalWorkload) === 'CRITICAL' && systemHealthState([criticalWorkload], { availabilityState: 'NORMAL' }) === 'ATTENTION'],
  ['critical OS remains CRITICAL', systemHealthState([criticalResource], { availabilityState: 'NORMAL' }) === 'CRITICAL'],
  ['evidence compatibility remains exported', files.backendEvidence.includes('def availability_transition_events')],
  ['Collect Now remains credential guarded', files.backendRunner.includes('RUNNER_CREDENTIAL_MISSING') && files.backendRunner.includes('_discover_job_id')],
  ['PDF preview remains non-destructive', files.source.includes("pdf.output('blob')") && !files.source.includes('pdf.save(')],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (failed.length) {
  console.error(`\n${failed.length} Rundeck v1.23.6 contract check(s) failed.`)
  process.exit(1)
}
console.log('\nRundeck v1.23.6 contract checks passed.')

import fs from 'node:fs'
import { systemHealthState } from '../src/tools/components/rundeckSystemHealth.js'
import { hostResourceState, sapWorkloadState } from '../src/tools/components/rundeckStatusSemantics.js'

const read = (path) => fs.readFileSync(path, 'utf8')
const files = {
  version: read('src/app/version.js'),
  workspace: read('src/tools/ToolLogWorkspace.jsx'),
  wrapper: read('src/tools/components/RundeckMonitoringHistory.jsx'),
  core: read('src/tools/components/RundeckMonitoringHistoryCoreV1234.jsx'),
  incident: read('src/tools/components/RundeckPerformanceIncident.jsx'),
  trend: read('src/tools/components/RundeckServerTrendV1234.jsx'),
  appServers: read('src/tools/components/RundeckAppServersV1234.jsx'),
  observation: read('src/tools/components/RundeckObservationHistoryV1234.jsx'),
  css: read('src/tools/components/RundeckExplicitBandsV1234.css'),
  availability: read('src/tools/components/RundeckAvailability.jsx'),
  issues: read('src/tools/components/RundeckSapIssuesV1231.jsx'),
  review: read('src/tools/components/RundeckPerformanceReviewV1231.jsx'),
  source: read('src/tools/components/RundeckSource.jsx'),
  backendEvidence: read('backend/rundeck_evidence.py'),
  backendRunner: read('backend/rundeck_runner.py'),
}

const normalHost = { cpu_pct: 20, ram_pct: 55, io_wait_pct: 0, wp_critical: 0 }
const criticalWorkload = { ...normalHost, wp_critical: 3 }
const criticalResource = { ...normalHost, cpu_pct: 95 }

const checks = [
  ['version is v1.23.4', files.version.includes("APP_VERSION = '1.23.4'") && files.version.includes("APP_PREVIOUS_VERSION = '1.23.3'") && files.version.includes("explicit-dom-bands-v1.23.4")],
  ['v1.23.4 CSS loads last', files.workspace.indexOf('RundeckExplicitBandsV1234.css') > files.workspace.indexOf('RundeckStructuralBandsV1233.css')],
  ['availability portal is removed', !files.wrapper.includes('createPortal') && !files.wrapper.includes('AvailabilityPortal')],
  ['operational band is direct JSX', files.incident.includes('rundeckOperationalBandV1234') && files.incident.includes('<RundeckAvailability refreshToken={refreshToken} />')],
  ['server trend band is explicit JSX', files.core.includes('rundeckServerTrendBandV1234') && files.core.includes('<RundeckAppServersV1234') && files.core.includes('<RundeckServerTrendV1234')],
  ['workload band is explicit JSX', files.core.includes('rundeckWorkloadBandV1234') && files.core.includes('currentWorkloadContent') && files.core.includes('<RundeckJobHistory')],
  ['observation history is full-width component', files.core.includes('<RundeckObservationHistoryV1234') && files.observation.includes('rundeckObservationHistoryV1234')],
  ['desktop ratios are 45/55 and 40/60', files.css.includes('45fr') && files.css.includes('55fr') && files.css.includes('40fr') && files.css.includes('60fr')],
  ['legacy source APP table is suppressed only as direct child', files.css.includes('.rundeckPanel>.rundeckServerSection:not(.rundeckServerSectionV1234)')],
  ['trend stays self-contained', files.trend.includes('rundeckServerTrendPanelV1234') && files.trend.includes('rundeckTrendChart') && files.trend.includes('rundeckAdvancedControls')],
  ['pinned workload suppresses selected-time context in JSX', files.trend.includes('!selectedJob?.pinned')],
  ['availability remains trust-aware', files.availability.includes('rundeckAvailabilityDataTrust') && files.availability.includes('Collection gap')],
  ['SAP Issues remains operator-readable', files.issues.includes('<th>APP</th><th>Issue</th><th>Now</th><th>Peak</th><th>Duration</th>')],
  ['Performance Review remains lean', files.review.includes('Performance Review') && files.review.includes('<th>Workload</th><th>Why</th><th>Avg CPU</th><th>Peak</th><th>PSS</th>')],
  ['critical workload without impact remains ATTENTION', hostResourceState(criticalWorkload) === 'NORMAL' && sapWorkloadState(criticalWorkload) === 'CRITICAL' && systemHealthState([criticalWorkload], { availabilityState: 'NORMAL' }) === 'ATTENTION'],
  ['critical OS remains CRITICAL', systemHealthState([criticalResource], { availabilityState: 'NORMAL' }) === 'CRITICAL'],
  ['v1.21 evidence compatibility remains exported', files.backendEvidence.includes('def availability_transition_events')],
  ['Collect Now remains credential guarded', files.backendRunner.includes('RUNNER_CREDENTIAL_MISSING') && files.backendRunner.includes('_discover_job_id')],
  ['PDF preview remains non-destructive', files.source.includes("pdf.output('blob')") && !files.source.includes('pdf.save(')],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (failed.length) {
  console.error(`\n${failed.length} Rundeck v1.23.4 contract check(s) failed.`)
  process.exit(1)
}
console.log('\nRundeck v1.23.4 contract checks passed.')

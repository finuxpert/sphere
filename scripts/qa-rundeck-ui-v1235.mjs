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
  observation: read('src/tools/components/RundeckObservationHistoryV1234.jsx'),
  closure: read('src/tools/components/RundeckExplicitBandsV1235Closure.css'),
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
  ['version is v1.23.5', files.version.includes("APP_VERSION = '1.23.5'") && files.version.includes("APP_PREVIOUS_VERSION = '1.23.4'") && files.version.includes("explicit-band-closure-v1.23.5")],
  ['v1.23.5 closure loads last', files.workspace.indexOf('RundeckExplicitBandsV1235Closure.css') > files.workspace.indexOf('RundeckExplicitBandsV1234OverrideWorkload.css')],
  ['availability portal remains removed', !files.wrapper.includes('createPortal') && !files.wrapper.includes('AvailabilityPortal')],
  ['row 1 remains explicit operational band', files.incident.includes('rundeckOperationalBandV1234') && files.incident.includes('is-operational-events') && files.incident.includes('is-availability')],
  ['row 2 is marked as v1.23.5 explicit band', files.core.includes('rundeckServerTrendBandV1234 rundeckServerTrendBandV1235') && files.core.includes('is-app-servers') && files.core.includes('is-server-trend')],
  ['row 3 is marked as v1.23.5 explicit band', files.core.includes('rundeckWorkloadBandV1234 rundeckWorkloadBandV1235') && files.core.includes('is-current-workload') && files.core.includes('is-selected-workload')],
  ['observation history remains full width', files.core.includes('<RundeckObservationHistoryV1234') && files.observation.includes('rundeckObservationHistoryV1234')],
  ['desktop ratios remain 45/55 and 40/60', files.closure.includes('45fr') && files.closure.includes('55fr') && files.closure.includes('40fr') && files.closure.includes('60fr')],
  ['explicit bands neutralize legacy floats', files.closure.includes('float:none!important') && files.closure.includes('clear:none!important') && files.closure.includes('container-type:normal!important')],
  ['row 2 app server top baseline is normalized', files.closure.includes('.is-app-servers>.rundeckServerSectionV1234') && files.closure.includes('padding-top:0!important')],
  ['server trend is a closed formatting context', files.closure.includes('.is-server-trend>.rundeckServerTrendPanelV1234') && files.closure.includes('display:flow-root!important')],
  ['server trend controls remain inside trend component', files.trend.includes('rundeckServerTrendPanelV1234') && files.trend.includes('rundeckTrendToolbar') && files.trend.includes('rundeckAdvancedControls') && files.trend.includes('rundeckTrendChart')],
  ['trend chart defeats legacy compact height', files.closure.includes('height:176px!important') && files.closure.includes('min-height:176px!important')],
  ['row 1 evidence top offset is neutralized', files.closure.includes('.rundeckOperationalBandV1234 .rundeckEvidenceTimeline') && files.closure.includes('border-top:0!important')],
  ['mobile bands stack explicitly', files.closure.includes('@media (max-width:1180px)') && files.closure.includes('display:block!important')],
  ['pinned workload suppresses selected-time context in JSX', files.trend.includes('!selectedJob?.pinned')],
  ['availability remains trust-aware', files.availability.includes('rundeckAvailabilityDataTrust') && files.availability.includes('Collection gap')],
  ['SAP Issues remains operator-readable', files.issues.includes('<th>APP</th><th>Issue</th><th>Now</th><th>Peak</th><th>Duration</th>')],
  ['Performance Review remains lean', files.review.includes('Performance Review') && files.review.includes('<th>Workload</th><th>Why</th><th>Avg CPU</th><th>Peak</th><th>PSS</th>')],
  ['critical workload without impact remains ATTENTION', hostResourceState(criticalWorkload) === 'NORMAL' && sapWorkloadState(criticalWorkload) === 'CRITICAL' && systemHealthState([criticalWorkload], { availabilityState: 'NORMAL' }) === 'ATTENTION'],
  ['critical OS remains CRITICAL', systemHealthState(criticalResource) === 'CRITICAL' || systemHealthState([criticalResource], { availabilityState: 'NORMAL' }) === 'CRITICAL'],
  ['v1.21 evidence compatibility remains exported', files.backendEvidence.includes('def availability_transition_events')],
  ['Collect Now remains credential guarded', files.backendRunner.includes('RUNNER_CREDENTIAL_MISSING') && files.backendRunner.includes('_discover_job_id')],
  ['PDF preview remains non-destructive', files.source.includes("pdf.output('blob')") && !files.source.includes('pdf.save(')],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (failed.length) {
  console.error(`\n${failed.length} Rundeck v1.23.5 contract check(s) failed.`)
  process.exit(1)
}
console.log('\nRundeck v1.23.5 contract checks passed.')

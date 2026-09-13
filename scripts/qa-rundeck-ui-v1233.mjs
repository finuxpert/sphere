import fs from 'node:fs'
import { systemHealthState } from '../src/tools/components/rundeckSystemHealth.js'
import { hostResourceState, sapWorkloadState } from '../src/tools/components/rundeckStatusSemantics.js'

const read = (path) => fs.readFileSync(path, 'utf8')
const files = {
  version: read('src/app/version.js'),
  workspace: read('src/tools/ToolLogWorkspace.jsx'),
  structural: read('src/tools/components/RundeckStructuralBandsV1233.css'),
  wrapper: read('src/tools/components/RundeckMonitoringHistory.jsx'),
  availability: read('src/tools/components/RundeckAvailability.jsx'),
  issues: read('src/tools/components/RundeckSapIssuesV1231.jsx'),
  review: read('src/tools/components/RundeckPerformanceReviewV1231.jsx'),
  source: read('src/tools/components/RundeckSource.jsx'),
  backendEvidence: read('backend/rundeck_evidence.py'),
  backendRunner: read('backend/rundeck_runner.py'),
}

const v1232Index = files.workspace.indexOf("./components/RundeckLayoutNormalizationV1232.css")
const v1233Index = files.workspace.indexOf("./components/RundeckStructuralBandsV1233.css")
const normalHost = { cpu_pct: 20, ram_pct: 55, io_wait_pct: 0, wp_critical: 0 }
const criticalWorkload = { ...normalHost, wp_critical: 3 }
const criticalResource = { ...normalHost, cpu_pct: 95 }

const checks = [
  ['version is v1.23.3 structural bands', files.version.includes("APP_VERSION = '1.23.3'") && files.version.includes("APP_PREVIOUS_VERSION = '1.23.2'") && files.version.includes("LOG_UI_REVISION = 'structural-bands-v1.23.3'")],
  ['v1.23.3 structural layer loads after v1.23.2', v1232Index >= 0 && v1233Index > v1232Index],
  ['parent dashboard is not converted to a grid', !files.structural.includes('.rundeckPanel {\n    display: grid') && !files.structural.includes('.rundeckPanel {\n  display: grid')],
  ['operational context is a scoped 45/55 grid', files.structural.includes('.rundeckIncident.is-lean') && files.structural.includes('minmax(0, 45fr) minmax(0, 55fr)')],
  ['availability is mounted beside operational events', files.wrapper.includes("document.querySelector('.rundeckPanel .rundeckIncident')") && files.wrapper.includes('rundeckAvailabilitySlotV1233') && files.structural.includes('.rundeckAvailabilitySlotV1233')],
  ['legacy standalone availability slot is retired', files.wrapper.includes("rundeckAvailabilitySlotV1231')?.remove()") && files.structural.includes('.rundeckAvailabilitySlotV1231') && files.structural.includes('display: none !important')],
  ['server and trend use deterministic 40/60 rails', files.structural.includes('width: calc(40% - 10px)') && files.structural.includes('width: calc(60% - 10px)') && files.structural.includes('.rundeckTrendChart')],
  ['workload band clears both upper rails', files.structural.includes('.rundeckCurrentWorkload') && files.structural.includes('clear: both !important')],
  ['operational events remain height bounded', files.structural.includes('.rundeckEvidenceTimeline[open] > .rundeckEvidenceBody') && files.structural.includes('max-height: 228px') && files.structural.includes('overflow-y: auto')],
  ['pinned workload still suppresses unrelated selected-time context', files.wrapper.includes('is-workload-pinned-v1232') && files.wrapper.includes('props.selectedJob?.pinned')],
  ['availability remains role-aware and data-trust aware', files.availability.includes('rundeckAvailabilityDataTrust') && files.availability.includes('Collection gap') && files.availability.includes('technicalDownCount > 0')],
  ['SAP Issues remains operator-readable', files.issues.includes('<th>APP</th><th>Issue</th><th>Now</th><th>Peak</th><th>Duration</th>')],
  ['Performance Review remains lean', files.review.includes('Performance Review') && files.review.includes('<th>Workload</th><th>Why</th><th>Avg CPU</th><th>Peak</th><th>PSS</th>')],
  ['critical workload without impact remains ATTENTION', hostResourceState(criticalWorkload) === 'NORMAL' && sapWorkloadState(criticalWorkload) === 'CRITICAL' && systemHealthState([criticalWorkload], { availabilityState: 'NORMAL' }) === 'ATTENTION'],
  ['critical OS resource remains CRITICAL', systemHealthState([criticalResource], { availabilityState: 'NORMAL' }) === 'CRITICAL'],
  ['v1.21 evidence compatibility remains exported', files.backendEvidence.includes('def availability_transition_events')],
  ['Collect Now remains server-side fixed and credential guarded', files.backendRunner.includes('RUNNER_CREDENTIAL_MISSING') && files.backendRunner.includes('RUNDECK_JOB_GROUP') && files.backendRunner.includes('_discover_job_id')],
  ['PDF preview remains non-destructive', files.source.includes("pdf.output('blob')") && files.source.includes('Report Preview') && !files.source.includes('pdf.save(')],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)

if (failed.length) {
  console.error(`\n${failed.length} Rundeck v1.23.3 contract check(s) failed.`)
  process.exit(1)
}

console.log('\nRundeck v1.23.3 contract checks passed.')

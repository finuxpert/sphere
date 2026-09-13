import fs from 'node:fs'
import { systemHealthState } from '../src/tools/components/rundeckSystemHealth.js'
import { hostResourceState, sapWorkloadState } from '../src/tools/components/rundeckStatusSemantics.js'

const read = (path) => fs.readFileSync(path, 'utf8')
const files = {
  version: read('src/app/version.js'),
  workspace: read('src/tools/ToolLogWorkspace.jsx'),
  layout: read('src/tools/components/RundeckLayoutNormalizationV1232.css'),
  wrapper: read('src/tools/components/RundeckMonitoringHistory.jsx'),
  availability: read('src/tools/components/RundeckAvailability.jsx'),
  issues: read('src/tools/components/RundeckSapIssuesV1231.jsx'),
  review: read('src/tools/components/RundeckPerformanceReviewV1231.jsx'),
  source: read('src/tools/components/RundeckSource.jsx'),
  backendEvidence: read('backend/rundeck_evidence.py'),
  backendRunner: read('backend/rundeck_runner.py'),
}

const clarityIndex = files.workspace.indexOf("./components/RundeckOperatorClarityV1231.css")
const normalizationIndex = files.workspace.indexOf("./components/RundeckLayoutNormalizationV1232.css")
const normalHost = { cpu_pct: 20, ram_pct: 55, io_wait_pct: 0, wp_critical: 0 }
const criticalWorkload = { ...normalHost, wp_critical: 3 }
const criticalResource = { ...normalHost, cpu_pct: 95 }

const checks = [
  ['version is v1.23.2 layout normalization', files.version.includes("APP_VERSION = '1.23.2'") && files.version.includes("APP_PREVIOUS_VERSION = '1.23.1'") && files.version.includes("LOG_UI_REVISION = 'layout-normalization-v1.23.2'")],
  ['v1.23.2 CSS loads after operator clarity', clarityIndex >= 0 && normalizationIndex > clarityIndex],
  ['normalization does not convert the parent panel into a grid', !files.layout.includes('.rundeckPanel {\n  display: grid') && !files.layout.includes('grid-template-columns: minmax(0, 40fr)')],
  ['server rail establishes the shared first-band baseline', files.layout.includes('.rundeckServerSection') && files.layout.includes('clear: both !important') && files.layout.includes('.rundeckMonitoringHead') && files.layout.includes('clear: none !important')],
  ['availability slot is a deterministic full-width clear band', files.layout.includes('.rundeckAvailabilitySlotV1231') && files.layout.includes('float: left !important') && files.layout.includes('clear: both !important') && files.layout.includes('width: 100% !important')],
  ['pinned workload context suppresses unrelated selected-time context', files.wrapper.includes('is-workload-pinned-v1232') && files.wrapper.includes('props.selectedJob?.pinned') && files.layout.includes('.rundeckRcaSection') && files.layout.includes('.rundeckRcaHint')],
  ['operational events are height-capped when expanded', files.layout.includes('.rundeckEvidenceTimeline[open] > .rundeckEvidenceBody') && files.layout.includes('max-height: 238px') && files.layout.includes('overflow-y: auto')],
  ['standalone availability remains role-aware and data-trust aware', files.availability.includes('rundeckAvailabilityDataTrust') && files.availability.includes('Collection gap') && files.availability.includes('technicalDownCount > 0')],
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
  console.error(`\n${failed.length} Rundeck v1.23.2 contract check(s) failed.`)
  process.exit(1)
}

console.log('\nRundeck v1.23.2 contract checks passed.')

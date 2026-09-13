import fs from 'node:fs'
import { systemHealthState } from '../src/tools/components/rundeckSystemHealth.js'
import { hostResourceState, sapWorkloadState } from '../src/tools/components/rundeckStatusSemantics.js'
import { evaluationReasonText } from '../src/tools/components/rundeckEvaluationExplain.js'

const read = (path) => fs.readFileSync(path, 'utf8')
const files = {
  version: read('src/app/version.js'),
  workspace: read('src/tools/ToolLogWorkspace.jsx'),
  clarityCss: read('src/tools/components/RundeckOperatorClarityV1231.css'),
  wrapper: read('src/tools/components/RundeckMonitoringHistory.jsx'),
  availability: read('src/tools/components/RundeckAvailability.jsx'),
  incident: read('src/tools/components/RundeckPerformanceIncident.jsx'),
  issues: read('src/tools/components/RundeckSapIssuesV1231.jsx'),
  review: read('src/tools/components/RundeckPerformanceReviewV1231.jsx'),
  healthUi: read('src/tools/components/RundeckSystemHealthV1231.jsx'),
  healthLogic: read('src/tools/components/rundeckSystemHealth.js'),
  source: read('src/tools/components/RundeckSource.jsx'),
  backendRunner: read('backend/rundeck_runner.py'),
  backendEvidence: read('backend/rundeck_evidence.py'),
  backendConsumers: read('backend/rundeck_consumers.py'),
}

const v123Index = files.workspace.indexOf("./components/RundeckLeanOpsV123.css")
const v1231Index = files.workspace.indexOf("./components/RundeckOperatorClarityV1231.css")
const normalHost = { cpu_pct: 20, ram_pct: 55, io_wait_pct: 0, wp_critical: 0 }
const criticalWorkload = { ...normalHost, wp_critical: 3 }
const warningResource = { ...normalHost, cpu_pct: 80 }
const criticalResource = { ...normalHost, cpu_pct: 95 }
const reviewAboveBaseline = {
  status: 'REVIEW REQUIRED',
  signals: { sustained_high_cpu: true, baseline_anomaly: true },
  anomaly_status: 'ABOVE BASELINE',
}

const checks = [
  ['version is v1.23.1 operator clarity', files.version.includes("APP_VERSION = '1.23.1'") && files.version.includes("APP_PREVIOUS_VERSION = '1.23.0'") && files.version.includes("LOG_ANALYTICS_ENGINE = 'operational-evidence-v1.23.0'") && files.version.includes("LOG_UI_REVISION = 'operator-clarity-v1.23.1'")],
  ['v1.23.1 clarity layer loads after v1.23.0', v123Index >= 0 && v1231Index > v123Index],
  ['clarity CSS does not replace the parent console with a grid', !files.clarityCss.includes('.rundeckPanel {\n  display: grid') && !files.clarityCss.includes('grid-template-columns: minmax(0, 40fr)')],
  ['navbar is right aligned and active state is underline based', files.clarityCss.includes('.sphereToolTabs') && files.clarityCss.includes('justify-self: end') && files.clarityCss.includes('border-bottom-color: var(--sphere-accent')],
  ['top header is lean and old explanatory ornaments are suppressed', files.clarityCss.includes("content: 'SAP Performance'") && files.clarityCss.includes('.rundeckLandscapeMeta::before') && files.clarityCss.includes('.rundeckTitleBlock::after')],
  ['primary issue keeps top workload as context and not root cause', files.incident.includes('Top Active Workload') && files.incident.includes('not a direct root-cause mapping')],
  ['system health UI replaces legacy top state', files.healthUi.includes('System Health') && files.clarityCss.includes('.rundeckOperationalState') && files.clarityCss.includes('display: none !important')],
  ['critical SAP workload with healthy OS and availability maps to ATTENTION', hostResourceState(criticalWorkload) === 'NORMAL' && sapWorkloadState(criticalWorkload) === 'CRITICAL' && systemHealthState([criticalWorkload], { availabilityState: 'NORMAL' }) === 'ATTENTION'],
  ['OS warning maps system health to WARNING', systemHealthState([warningResource], { availabilityState: 'NORMAL' }) === 'WARNING'],
  ['OS critical maps system health to CRITICAL', systemHealthState([criticalResource], { availabilityState: 'NORMAL' }) === 'CRITICAL'],
  ['critical availability maps system health to CRITICAL', systemHealthState([normalHost], { availabilityState: 'CRITICAL' }) === 'CRITICAL'],
  ['healthy sources map system health to NORMAL', systemHealthState([normalHost], { availabilityState: 'NORMAL' }) === 'NORMAL'],
  ['availability is portaled as a standalone section before workload anchors', files.wrapper.includes('AvailabilityPortal') && files.wrapper.includes('rundeckAvailabilitySlotV1231') && files.wrapper.includes(".rundeckCurrentWorkload, .rundeckJobHistory")],
  ['availability separates health from abnormal data trust', files.availability.includes('rundeckAvailabilityDataTrust') && files.availability.includes('Collection gap') && !files.availability.includes('Source gap') && files.availability.includes('technicalDownCount > 0')],
  ['historical implementation copy is hidden from Server Trend', files.clarityCss.includes('.rundeckMonitoringHead::after') && files.clarityCss.includes('content: none !important')],
  ['legacy paired review sections are hidden', files.clarityCss.includes('.rundeckSapIssues,') && files.clarityCss.includes('.rundeckEvaluation {') && files.clarityCss.includes('display: none !important')],
  ['SAP Issues uses operator-readable columns', files.issues.includes('<th>APP</th><th>Issue</th><th>Now</th><th>Peak</th><th>Duration</th>') && !files.issues.includes('<th>State</th>')],
  ['SAP Issues shows current numeric value with severity', files.issues.includes('rundeckIssueNowV1231') && files.issues.includes('<InlineStatus value={severity}')],
  ['Performance Review is lean and full-width capable', files.review.includes('Performance Review') && files.review.includes('<th>Workload</th><th>Why</th><th>Avg CPU</th><th>Peak</th><th>PSS</th>') && files.clarityCss.includes('.rundeckPerformanceReviewV1231')],
  ['Performance Review only surfaces quality warning when degraded', files.review.includes('showQualityWarning') && files.review.includes('LIMITED DATA') && !files.review.includes('CPU Spike') && !files.review.includes('CPU Increase')],
  ['evaluation reason remains deterministic', evaluationReasonText(reviewAboveBaseline) === 'High CPU · Above Baseline'],
  ['workload identity v2 retention remains intact', files.backendConsumers.includes('"client": _first(representative') && files.backendConsumers.includes('"transaction": _first(representative') && files.backendConsumers.includes('"report": _first(representative')],
  ['v1.21 evidence compatibility remains exported', files.backendEvidence.includes('def availability_transition_events')],
  ['Collect Now remains server-side fixed and credential guarded', files.backendRunner.includes('RUNNER_CREDENTIAL_MISSING') && files.backendRunner.includes('RUNDECK_JOB_GROUP') && files.backendRunner.includes('_discover_job_id')],
  ['PDF preview flow remains non-destructive', files.source.includes("pdf.output('blob')") && files.source.includes('Report Preview') && !files.source.includes('pdf.save(')],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)

if (failed.length) {
  console.error(`\n${failed.length} Rundeck v1.23.1 contract check(s) failed.`)
  process.exit(1)
}

console.log('\nRundeck v1.23.1 contract checks passed.')

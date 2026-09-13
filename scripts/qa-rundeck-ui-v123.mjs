import fs from 'node:fs'
import {
  hostResourceState,
  overallOperationalState,
  sapWorkloadState,
} from '../src/tools/components/rundeckStatusSemantics.js'
import { evaluationReasonText } from '../src/tools/components/rundeckEvaluationExplain.js'

const read = (path) => fs.readFileSync(path, 'utf8')
const files = {
  version: read('src/app/version.js'),
  workspace: read('src/tools/ToolLogWorkspace.jsx'),
  leanCss: read('src/tools/components/RundeckLeanOpsV123.css'),
  operatorDensity: read('src/tools/components/RundeckOperatorDensityV1222.css'),
  incident: read('src/tools/components/RundeckPerformanceIncident.jsx'),
  workload: read('src/tools/components/RundeckCurrentWorkload.jsx'),
  availability: read('src/tools/components/RundeckAvailability.jsx'),
  evidenceUi: read('src/tools/components/RundeckEvidenceTimeline.jsx'),
  evaluation: read('src/tools/components/RundeckPerformanceEvaluation.jsx'),
  backendAvailability: read('backend/rundeck_availability.py'),
  backendEvidence: read('backend/rundeck_evidence.py'),
  backendConsumers: read('backend/rundeck_consumers.py'),
  backendRunner: read('backend/rundeck_runner.py'),
  source: read('src/tools/components/RundeckSource.jsx'),
}

const oldDensityIndex = files.workspace.indexOf("./components/RundeckOperatorDensityV1222.css")
const leanOpsIndex = files.workspace.indexOf("./components/RundeckLeanOpsV123.css")
const wpAttention = { cpu_pct: 20, ram_pct: 55, io_wait_pct: 0, wp_critical: 2 }
const wpCritical = { ...wpAttention, wp_critical: 3 }
const reviewAboveBaseline = {
  status: 'REVIEW REQUIRED',
  signals: { sustained_high_cpu: true, baseline_anomaly: true },
  anomaly_status: 'ABOVE BASELINE',
}

const checks = [
  ['version is v1.23.0 Lean Operations & Data Trust', files.version.includes("APP_VERSION = '1.23.0'") && files.version.includes("APP_PREVIOUS_VERSION = '1.22.2'") && files.version.includes("LOG_ANALYTICS_ENGINE = 'operational-evidence-v1.23.0'") && files.version.includes("LOG_UI_REVISION = 'lean-operations-v1.23.0'")],
  ['v1.23 overrides load after the stable v1.22.2 density layer', oldDensityIndex >= 0 && leanOpsIndex > oldDensityIndex],
  ['v1.23 CSS does not replace the parent console with a grid', !files.leanCss.includes('.rundeckPanel {\n  display: grid') && !files.leanCss.includes('grid-template-columns: minmax(0, 40fr)')],
  ['primary issue names the workload as observational context', files.incident.includes('Top Active Workload') && files.incident.includes('not a direct root-cause mapping') && !files.incident.includes('function WorkloadFacts')],
  ['primary issue avoids repeating host CPU memory and IO values', files.incident.includes('<b>OS</b>') && files.incident.includes('<b>SAP Workload</b>') && !files.incident.includes('<b>Memory</b>') && !files.incident.includes('<b>I/O Wait</b>')],
  ['current workload hides freshness copy until stale and keeps identity in tooltip', files.workload.includes('STALE_MINUTES = 15') && files.workload.includes('showFreshness') && files.workload.includes("push('SAP User'") && files.workload.includes("push('Client'") && files.workload.includes("push('Transaction'")],
  ['backend retains optional client transaction and report identity when supplied', files.backendConsumers.includes('"client": _first(representative') && files.backendConsumers.includes('"transaction": _first(representative') && files.backendConsumers.includes('"report": _first(representative')],
  ['availability consumes role-aware backend issue wording', files.availability.includes('summary?.issue_text') && files.availability.includes('technical_down_count') && !files.availability.includes('primary service')],
  ['availability preserves DR operator casing', files.availability.includes("replace(/\\bDr\\b/g, 'DR')")],
  ['availability surfaces stale data and large source skew only when abnormal', files.availability.includes('STALE_MINUTES = 20') && files.availability.includes('skew >= 300') && files.availability.includes('Source gap')],
  ['availability backend separates service and technical failures', files.backendAvailability.includes('SERVICE_CATEGORIES') && files.backendAvailability.includes('TECHNICAL_CATEGORIES') && files.backendAvailability.includes('service_down_count') && files.backendAvailability.includes('technical_down_count') && files.backendAvailability.includes('issue_text')],
  ['availability history exposes explicit transitions without treating missing checks as down', files.backendAvailability.includes('availability_change_events') && files.backendAvailability.includes('"transitions": availability_change_events') && files.backendAvailability.includes('Missing checks are not treated as DOWN')],
  ['operational events replace verbose evidence summary copy', files.evidenceUi.includes('Operational Events') && files.evidenceUi.includes('Correlation details') && !files.evidenceUi.includes('Evidence interpretation')],
  ['evidence backend reuses availability transition semantics', files.backendEvidence.includes('availability_change_events') && files.backendEvidence.includes('availability_change_count') && files.backendEvidence.includes('supporting evidence only')],
  ['evaluation visibly shows reason once while status remains semantic', files.leanCss.includes('.rundeckEvaluationAssessment') && files.leanCss.includes('display: none !important') && files.evaluation.includes('aria-label={`${status}. ${reason')],
  ['historical process aggregate is labelled Avg Processes', files.leanCss.includes("content: 'Avg Processes'")],
  ['Collect Now remains fixed server-side and credential guarded', files.backendRunner.includes('RUNNER_CREDENTIAL_MISSING') && files.backendRunner.includes('RUNDECK_JOB_GROUP') && files.backendRunner.includes('_discover_job_id')],
  ['PDF preview behavior remains intact', files.source.includes("pdf.output('blob')") && files.source.includes('Report Preview') && !files.source.includes('pdf.save(')],
  ['WP semantics remain unchanged', hostResourceState(wpAttention) === 'NORMAL' && sapWorkloadState(wpAttention) === 'ATTENTION' && overallOperationalState([wpCritical]) === 'CRITICAL'],
  ['evaluation reason remains deterministic', evaluationReasonText(reviewAboveBaseline) === 'High CPU · Above Baseline'],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)

if (failed.length) {
  console.error(`\n${failed.length} Rundeck v1.23.0 contract check(s) failed.`)
  process.exit(1)
}

console.log('\nRundeck v1.23.0 contract checks passed.')

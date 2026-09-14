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
  jobHistory: read('src/tools/components/RundeckJobHistory.jsx'),
  incident: read('src/tools/components/RundeckPerformanceIncident.jsx'),
  trend: read('src/tools/components/RundeckServerTrendV1234.jsx'),
  observation: read('src/tools/components/RundeckObservationHistoryV1234.jsx'),
  observationCss: read('src/tools/components/RundeckObservationHistory.css'),
  evidence: read('src/tools/components/RundeckEvidenceTimeline.jsx'),
  evidenceCss: read('src/tools/components/RundeckEvidenceTimeline.css'),
  css: read('src/tools/components/RundeckWorkspaceV1236.css'),
  availabilityPolish: read('src/tools/components/RundeckAvailabilityPolishV1206.css'),
  availability: read('src/tools/components/RundeckAvailability.jsx'),
  issues: read('src/tools/components/RundeckSapIssuesV1231.jsx'),
  review: read('src/tools/components/RundeckPerformanceReviewV1231.jsx'),
  backendEvidence: read('backend/rundeck_evidence.py'),
  backendRunner: read('backend/rundeck_runner.py'),
}

const runtimeGuardPath = 'src/tools/components/RundeckRuntimeDedupV1237.css'
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
  ['version is v1.23.10', files.version.includes("APP_VERSION = '1.23.10'") && files.version.includes("APP_PREVIOUS_VERSION = '1.23.9'") && files.version.includes('selected-workload-width-ownership-v1.23.10')],
  ['single structural authority remains active', files.workspace.includes('RundeckWorkspaceV1236.css')],
  ['legacy structural imports remain retired', forbiddenStructuralImports.every((name) => !files.workspace.includes(name))],
  ['runtime CSS dedup guard is retired', !fs.existsSync(runtimeGuardPath) && !files.wrapper.includes('RundeckRuntimeDedupV1237.css')],
  ['canonical APP server owner remains in monitoring core', files.core.includes('<RundeckAppServersV1234') && files.core.includes('is-app-servers')],
  ['legacy direct APP runtime is physically removed', !files.source.includes('wpDrilldown') && !files.source.includes('toggleCriticalWp') && !files.source.includes('workloadTypeLabel') && !files.source.includes('const wpText') && !files.source.includes('operationalHosts.length > 0 && <section className="rundeckServerSection"')],
  ['canonical observation history remains full width', files.core.includes('<RundeckObservationHistoryV1234') && files.css.includes('.rundeckObservationHistoryV1234')],
  ['embedded observation history is physically removed', !files.jobHistory.includes('rundeckJobExecutionHistory') && !files.jobHistory.includes('Observation History')],
  ['observation history owns its table styling', files.observation.includes("import './RundeckObservationHistory.css'") && files.observationCss.includes('width: 100%') && files.observationCss.includes('position: sticky')],
  ['operational events are always visible', files.evidence.includes('return <section className="rundeckEvidenceTimeline"') && !files.evidence.includes('return <details className="rundeckEvidenceTimeline"')],
  ['operational event list is compact and scrollable', files.evidenceCss.includes('max-height: 292px') && files.evidenceCss.includes('overflow-y: auto')],
  ['row 1 keeps 45/55 band', files.incident.includes('rundeckOperationalBandV1234') && files.css.includes('45fr') && files.css.includes('55fr')],
  ['row 2 and row 3 keep 40/60 bands', files.core.includes('rundeckServerTrendBandV1235') && files.core.includes('rundeckWorkloadBandV1235') && files.css.includes('40fr') && files.css.includes('60fr')],
  ['selected workload owns full right pane width', files.css.includes('.is-selected-workload .rundeckJobHistoryHead') && files.css.includes('.is-selected-workload .rundeckJobPerformanceWrap') && files.css.includes('.is-selected-workload .rundeckJobPerformanceChart') && files.css.includes('width: 100% !important')],
  ['legacy trend lift is retired', !files.availabilityPolish.includes('translateY(-') && !files.availabilityPolish.includes('Lift only the trend band visually')],
  ['canonical CSS has no float rail ownership', !files.css.includes('float: left') && !files.css.includes('float: right') && !files.css.includes('display: contents')],
  ['canonical CSS has no negative layout lift', !/margin-top:\s*-/.test(files.css)],
  ['server trend remains closed formatting context', files.trend.includes('rundeckServerTrendPanelV1234') && files.css.includes('display: flow-root')],
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
  console.error(`\n${failed.length} Rundeck v1.23.10 contract check(s) failed.`)
  process.exit(1)
}
console.log('\nRundeck v1.23.10 contract checks passed.')

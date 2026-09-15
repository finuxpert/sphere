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
  operationalEvidence: read('src/tools/components/RundeckOperationalEvidence.jsx'),
  investigation: read('src/tools/components/RundeckInvestigationContext.jsx'),
  investigationCss: read('src/tools/components/RundeckInvestigationFlow.css'),
  appServers: read('src/tools/components/RundeckAppServers.jsx'),
  trend: read('src/tools/components/RundeckServerTrend.jsx'),
  observation: read('src/tools/components/RundeckObservationHistory.jsx'),
  observationCss: read('src/tools/components/RundeckObservationHistory.css'),
  evidence: read('src/tools/components/RundeckEvidenceTimeline.jsx'),
  evidenceCss: read('src/tools/components/RundeckEvidenceTimeline.css'),
  css: read('src/tools/components/RundeckWorkspace.css'),
  availabilityPolish: read('src/tools/components/RundeckAvailabilityPolishV1206.css'),
  availability: read('src/tools/components/RundeckAvailability.jsx'),
  issues: read('src/tools/components/RundeckSapIssues.jsx'),
  review: read('src/tools/components/RundeckPerformanceReview.jsx'),
  backendEvidence: read('backend/rundeck_evidence.py'),
  backendRunner: read('backend/rundeck_runner.py'),
}

const runtimeGuardPath = 'src/tools/components/RundeckRuntimeDedupV1237.css'
const retiredVersionedRuntimeFiles = [
  'src/tools/components/RundeckAppServersV1234.jsx',
  'src/tools/components/RundeckServerTrendV1234.jsx',
  'src/tools/components/RundeckObservationHistoryV1234.jsx',
  'src/tools/components/RundeckSapIssuesV1231.jsx',
  'src/tools/components/RundeckPerformanceReviewV1231.jsx',
  'src/tools/components/RundeckSystemHealthV1231.jsx',
  'src/tools/components/RundeckWorkspaceV1236.css',
]
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

const hierarchy = {
  servers: files.core.indexOf('rundeckServerTrendBandV1235'),
  workload: files.core.indexOf('rundeckWorkloadBandV1235'),
  evidence: files.core.indexOf('operationalEvidenceContent'),
  observation: files.core.indexOf('<RundeckObservationHistory'),
}

const checks = [
  ['version is v1.23.14', files.version.includes("APP_VERSION = '1.23.14'") && files.version.includes("APP_PREVIOUS_VERSION = '1.23.13'") && files.version.includes('trend-top-workload-auto-inspect-v1.23.14')],
  ['canonical workspace stylesheet is active', files.workspace.includes('RundeckWorkspace.css') && !files.workspace.includes('RundeckWorkspaceV1236.css')],
  ['versioned runtime files are retired', retiredVersionedRuntimeFiles.every((path) => !fs.existsSync(path))],
  ['legacy structural imports remain retired', forbiddenStructuralImports.every((name) => !files.workspace.includes(name))],
  ['runtime CSS dedup guard is retired', !fs.existsSync(runtimeGuardPath) && !files.wrapper.includes('RundeckRuntimeDedupV1237.css')],
  ['canonical APP server owner remains in monitoring core', files.core.includes("from './RundeckAppServers.jsx'") && files.core.includes('<RundeckAppServers') && files.core.includes('is-app-servers')],
  ['canonical Server Trend owner remains in monitoring core', files.core.includes("from './RundeckServerTrend.jsx'") && files.core.includes('<RundeckServerTrend') && files.core.includes('is-server-trend')],
  ['canonical observation history remains full width', files.core.includes("from './RundeckObservationHistory.jsx'") && files.core.includes('<RundeckObservationHistory') && files.css.includes('.rundeckObservationHistoryV1234')],
  ['wrapper uses canonical supporting components', files.wrapper.includes("from './RundeckSystemHealth.jsx'") && files.wrapper.includes("from './RundeckSapIssues.jsx'") && files.wrapper.includes("from './RundeckPerformanceReview.jsx'")],
  ['primary issue no longer owns evidence or availability layout', !files.incident.includes('RundeckEvidenceTimeline') && !files.incident.includes('RundeckAvailability') && !files.incident.includes('rundeckOperationalBandV1234')],
  ['operational evidence owns availability row', files.wrapper.includes("from './RundeckOperationalEvidence.jsx'") && files.operationalEvidence.includes('rundeckOperationalBandV1234') && files.operationalEvidence.includes('<RundeckEvidenceTimeline') && files.operationalEvidence.includes('<RundeckAvailability')],
  ['operator hierarchy is servers then workload then evidence then observation', hierarchy.servers >= 0 && hierarchy.workload > hierarchy.servers && hierarchy.evidence > hierarchy.workload && hierarchy.observation > hierarchy.evidence],
  ['operational evidence keeps 45/55 ratio', files.css.includes('grid-template-columns: minmax(0, 45fr) minmax(0, 55fr)')],
  ['row 2 and row 3 keep 40/60 bands', files.core.includes('rundeckServerTrendBandV1235') && files.core.includes('rundeckWorkloadBandV1235') && files.css.includes('grid-template-columns: minmax(0, 40fr) minmax(0, 60fr)')],
  ['SAP Issues and Performance Review share 35/65 band', files.wrapper.includes('rundeckIssuesReviewBand') && files.css.includes('grid-template-columns: minmax(0, 35fr) minmax(0, 65fr)')],
  ['Supporting Data uses 65/35 split', files.css.includes('.rundeckSupportingData') && files.css.includes('grid-template-columns: minmax(0, 65fr) minmax(0, 35fr)')],
  ['Critical WP APP drilldown is inline and collection aligned', files.appServers.includes('wpCount > 0') && files.appServers.includes('rundeckWpInlineRow') && files.appServers.includes('Workloads observed while Critical WP active') && files.appServers.includes('history/jobs/current?collection_id=')],
  ['Critical WP drilldown wording avoids root-cause claim', files.appServers.includes('Correlation only; not a direct root-cause mapping.')],
  ['Critical WP workload click opens Selected Workload', files.appServers.includes("source: 'critical-wp-inline-drilldown'") && files.appServers.includes("querySelector('.rundeckJobHistory')")],
  ['cross-panel context indicator is active', files.core.includes("from './RundeckInvestigationContext.jsx'") && files.core.includes('<RundeckInvestigationContext') && files.wrapper.includes("import './RundeckInvestigationFlow.css'")],
  ['context distinguishes live trend history and review', files.investigation.includes("label: 'LIVE'") && files.investigation.includes("label: 'TREND'") && files.investigation.includes("label: 'HISTORY'") && files.investigation.includes("label: 'REVIEW'") && files.investigation.includes('Current dashboard state remains live.')],
  ['SAP Issues can focus the corresponding APP', files.wrapper.includes('appFocusRequest') && files.wrapper.includes('onInspectApp={inspectApp}') && files.issues.includes("source: 'sap-issues'") && files.issues.includes('onInspectApp') && files.appServers.includes('focusRequest') && files.appServers.includes('data-app-key') && files.appServers.includes('is-cross-panel-focus')],
  ['Observation History can inspect a historical point', files.core.includes('onSelectJob={props.onSelectJob}') && files.observation.includes("source: 'observation-history'") && files.observation.includes('at: row.collected_at') && files.observation.includes('executionId: row.execution_id') && files.observation.includes('Current dashboard state remains live.')],
  ['Performance Review selection uses cross-panel inspector', files.wrapper.includes('<RundeckPerformanceReview') && files.wrapper.includes('onSelectJob={inspectJob}') && files.review.includes("source: 'performance-review'")],
  ['Server Trend selection uses TREND investigation context', files.core.includes('<RundeckServerTrend') && files.core.includes('onSelectJob={props.onSelectJob}') && files.trend.includes("source: 'trend'")],
  ['Server Trend click auto-opens rank 1 workload', files.trend.includes('top_consumers?.[0]') && files.trend.includes('topConsumerContext(point, result)') && files.trend.includes('if (context) onSelectJob?.(context)') && files.trend.includes('Top Workload · auto-opened')],
  ['Server Trend Peak uses exact peak collection and timestamp', files.trend.includes("mode === 'max' ? (item.peakAt || item.bucket) : item.bucket") && files.trend.includes("mode === 'max' ? (item.peakCollectionId || '') : ''") && files.trend.includes('collection_id=${encodeURIComponent(point.collectionId)}')],
  ['Server Trend Avg resolves nearest collection instead of peak collection', files.trend.includes("const selectedCollectionId = availability ? '' : (mode === 'max' ? (item.peakCollectionId || '') : '')") && files.trend.includes('window_minutes=5')],
  ['Server Trend ignores stale point responses', files.trend.includes('timelineRequestSequence') && files.trend.includes('timelineRequestSequence.current !== requestSequence')],
  ['cross-panel workload selection scrolls to Selected Workload', files.wrapper.includes("querySelector('.rundeckJobHistory')") && files.wrapper.includes('scrollToSelectedWorkload')],
  ['legacy direct APP runtime is physically removed', !files.source.includes('wpDrilldown') && !files.source.includes('toggleCriticalWp') && !files.source.includes('workloadTypeLabel') && !files.source.includes('const wpText') && !files.source.includes('operationalHosts.length > 0 && <section className="rundeckServerSection"')],
  ['embedded observation history is physically removed', !files.jobHistory.includes('rundeckJobExecutionHistory') && !files.jobHistory.includes('Observation History')],
  ['observation history owns its table styling', files.observation.includes("import './RundeckObservationHistory.css'") && files.observationCss.includes('width: 100%') && files.observationCss.includes('position: sticky')],
  ['operational events are always visible when incident is active', files.evidence.includes('return <section className="rundeckEvidenceTimeline"') && !files.evidence.includes('return <details className="rundeckEvidenceTimeline"')],
  ['operational event list is compact and scrollable', files.evidenceCss.includes('max-height: 292px') && files.evidenceCss.includes('overflow-y: auto')],
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
  console.error(`\n${failed.length} Rundeck v1.23.14 contract check(s) failed.`)
  process.exit(1)
}
console.log('\nRundeck v1.23.14 contract checks passed.')

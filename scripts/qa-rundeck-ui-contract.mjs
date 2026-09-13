import fs from 'node:fs'
import {
  hostResourceState,
  overallOperationalState,
  sapWorkloadState,
} from '../src/tools/components/rundeckStatusSemantics.js'
import { evaluationReasonText } from '../src/tools/components/rundeckEvaluationExplain.js'

const read = (path) => fs.readFileSync(path, 'utf8')
const files = {
  app: read('src/App.jsx'),
  v120Css: read('src/app/rundeck-v120.css'),
  source: read('src/tools/components/RundeckSource.jsx'),
  sourceCss: read('src/tools/components/RundeckSource.css'),
  incident: read('src/tools/components/RundeckPerformanceIncident.jsx'),
  workload: read('src/tools/components/RundeckCurrentWorkload.jsx'),
  history: read('src/tools/components/RundeckJobHistory.jsx'),
  monitoring: read('src/tools/components/RundeckMonitoringHistory.jsx'),
  availability: read('src/tools/components/RundeckAvailability.jsx'),
  availabilityPolish: read('src/tools/components/RundeckAvailabilityPolishV1206.css'),
  uiFreeze: read('src/tools/components/RundeckUiFreezeV1207.css'),
  v122Css: read('src/tools/components/RundeckFreshCollectionIdentityV122.css'),
  operationalUx: read('src/tools/components/RundeckOperationalUxV1221.css'),
  operatorDensity: read('src/tools/components/RundeckOperatorDensityV1222.css'),
  evidenceUi: read('src/tools/components/RundeckEvidenceTimeline.jsx'),
  evidenceCss: read('src/tools/components/RundeckEvidenceTimeline.css'),
  workspace: read('src/tools/ToolLogWorkspace.jsx'),
  evaluation: read('src/tools/components/RundeckPerformanceEvaluation.jsx'),
  explain: read('src/tools/components/rundeckEvaluationExplain.js'),
  backendStatus: read('backend/rundeck_status.py'),
  backendLatest: read('backend/rundeck_latest.py'),
  backendIncidents: read('backend/rundeck_alert_incidents.py'),
  backendConsumers: read('backend/rundeck_consumers.py'),
  backendEvaluation: read('backend/rundeck_evaluation.py'),
  backendTrends: read('backend/rundeck_trends.py'),
  backendApi: read('backend/rundeck_api.py'),
  backendRunner: read('backend/rundeck_runner.py'),
  backendEvidence: read('backend/rundeck_evidence.py'),
  backfill: read('ops/rundeck/backfill-consumers.py'),
  deployDev: read('ops/rundeck/deploy-dev.sh'),
  nginxUpdater: read('ops/rundeck/update-nginx-block.py'),
  visualConfig: read('playwright.config.mjs'),
  visualSpec: read('tests/visual/rundeck.visual.spec.mjs'),
  version: read('src/app/version.js'),
}

const wpAttention = { cpu_pct: 20, ram_pct: 55, io_wait_pct: 0, wp_critical: 2 }
const wpCritical = { ...wpAttention, wp_critical: 3 }
const resourceWarning = { cpu_pct: 80, ram_pct: 55, io_wait_pct: 0, wp_critical: 0 }
const resourceCritical = { cpu_pct: 95, ram_pct: 55, io_wait_pct: 0, wp_critical: 0 }
const reviewAboveBaseline = {
  status: 'REVIEW REQUIRED',
  signals: { sustained_high_cpu: true, baseline_anomaly: true },
  anomaly_status: 'ABOVE BASELINE',
}
const reviewCriticalWp = {
  status: 'REVIEW REQUIRED',
  signals: { sustained_high_cpu: true, critical_wp_correlated: true },
}
const spikeOnly = { status: 'CPU SPIKE', signals: { cpu_spike: true } }

const monitoringSapIssuesIndex = files.monitoring.indexOf('<SapIssues')
const monitoringEvaluationIndex = files.monitoring.indexOf('<RundeckPerformanceEvaluation')
const releaseCandidateIndex = files.workspace.indexOf("./components/RundeckReleaseCandidatePolish.css")
const uiFreezeIndex = files.workspace.indexOf("./components/RundeckUiFreezeV1207.css")
const v122Index = files.workspace.indexOf("./components/RundeckFreshCollectionIdentityV122.css")
const operationalUxIndex = files.workspace.indexOf("./components/RundeckOperationalUxV1221.css")
const operatorDensityIndex = files.workspace.indexOf("./components/RundeckOperatorDensityV1222.css")

const checks = [
  ['version is v1.22.2 with the operator density revision', files.version.includes("APP_VERSION = '1.22.2'") && files.version.includes("APP_PREVIOUS_VERSION = '1.22.1'") && files.version.includes("LOG_ANALYTICS_ENGINE = 'evidence-correlation-v1.21.1'") && files.version.includes("LOG_UI_REVISION = 'operator-density-v1.22.2'")],
  ['v1.20 operational CSS remains loaded', files.app.includes("./app/rundeck-v120.css")],
  ['v1.20.6 availability polish remains loaded', files.workspace.includes("./components/RundeckAvailabilityPolishV1206.css")],
  ['UI overrides remain ordered from freeze through v1.22.2 operator density', uiFreezeIndex > releaseCandidateIndex && v122Index > uiFreezeIndex && operationalUxIndex > v122Index && operatorDensityIndex > operationalUxIndex],
  ['v1.22.1 UX quiets normal states and allocates practical 40/60 operator rails', files.operationalUx.includes('.rundeckServerTable .rundeckStatus.is-normal') && files.operationalUx.includes('--sphere-left-rail: calc(40% - 10px)') && files.operationalUx.includes('--sphere-right-rail: calc(60% - 10px)')],
  ['v1.22.2 raises scan readability and compresses the trend canvas', files.operatorDensity.includes('--sphere-font-body: 10.6px') && files.operatorDensity.includes('height: 136px !important') && files.operatorDensity.includes('.rundeckCurrentWorkloadName small')],
  ['v1.22.2 collapses selected workload facts and hides redundant latest badge', files.operatorDensity.includes('.rundeckJobHistoryGroup') && files.operatorDensity.includes('display: contents !important') && files.operatorDensity.includes('.rundeckJobHistoryHead em.is-current') && files.operatorDensity.includes('display: none !important')],
  ['production-safe report URL uses current origin and base', files.source.includes('window.location.origin') && files.source.includes('import.meta.env.BASE_URL')],
  ['PDF trend context follows selected metric instead of stale trend response', files.monitoring.includes('metricLabelForTrend') && files.monitoring.includes('selectedMetric') && files.monitoring.includes('onTrendContext={forwardTrendContext}')],

  ['host resource excludes WP-only attention', hostResourceState(wpAttention) === 'NORMAL'],
  ['WP 1-2 maps to ATTENTION', sapWorkloadState(wpAttention) === 'ATTENTION' && overallOperationalState([wpAttention]) === 'ATTENTION'],
  ['WP 3+ maps to CRITICAL', sapWorkloadState(wpCritical) === 'CRITICAL' && overallOperationalState([wpCritical]) === 'CRITICAL'],
  ['resource warning remains WARNING', hostResourceState(resourceWarning) === 'WARNING' && overallOperationalState([resourceWarning]) === 'WARNING'],
  ['resource critical remains CRITICAL', hostResourceState(resourceCritical) === 'CRITICAL' && overallOperationalState([resourceCritical]) === 'CRITICAL'],
  ['resolved SAP issue closes as CLEARED', files.backendIncidents.includes('"CLEARED" if incident.get("state") == "RESOLVED"')],
  ['overall dashboard state is explicitly labelled', files.source.includes('rundeckOperationalState') && files.source.includes('Operational State')],
  ['legacy operational state readability remains available beneath operator overrides', files.uiFreeze.includes('.rundeckOperationalState > span:first-child') && files.uiFreeze.includes('font-size: 8.4px !important')],

  ['short trend ranges are exposed in UI', ['30M', '1H', '3H', '6H', '24H', '7D', '30D'].every((value) => files.monitoring.includes(`'${value}'`))],
  ['short trend ranges are accepted by API', files.backendApi.includes('30m|1h|3h|6h|24h|7d|30d|90d')],
  ['short trend auto mode uses raw collection resolution', files.backendTrends.includes('"30m": {"hours": 0.5, "auto_bucket": "raw"}') && files.backendTrends.includes('"1h": {"hours": 1, "auto_bucket": "raw"}') && files.backendTrends.includes('"3h": {"hours": 3, "auto_bucket": "raw"}') && files.backendTrends.includes('if resolved_bucket == "raw"')],
  ['load is moved out of primary metric controls', !files.monitoring.includes("['load', 'Load'],") && files.monitoring.includes("setMetric('load')")],

  ['primary issue uses operator wording and inline host state', files.incident.includes('Primary Issue') && files.incident.includes('Critical WP Active') && files.incident.includes('rundeckIncidentOpsLine') && files.incident.includes('<b>OS Resource</b>') && !files.incident.includes('rundeckIncidentHostContext')],
  ['primary issue removes recurring workload block', !files.incident.includes('Recurring Workload') && files.incident.includes('Current Workload')],
  ['current workloads use lean columns', files.workload.includes('Current Workloads') && files.workload.includes('CPU Usage') && files.workload.includes('PSS Memory') && files.workload.includes('Processes') && !files.workload.includes('<th>Type</th>')],
  ['current workload type remains available as fallback sublabel', files.workload.includes('workloadTypeLabel(row.consumer_type)')],
  ['current workload shows retained snapshot freshness', files.workload.includes('rundeckWorkloadFreshness') && files.workload.includes('Snapshot ${formatWib(latestObservedAt, true)} WIB') && files.workload.includes('relativeAge')],
  ['current workload uses concise visible identity while keeping full SAP identity in tooltip', files.workload.includes('`${processes} proc`') && files.workload.includes("push('Job Name'") && files.workload.includes("push('ABAP Program'") && files.workload.includes("push('PID'") && files.workload.includes("push('SAP User'")],
  ['legacy latest-snapshot marker remains available beneath v1.22.2 suppression', files.v122Css.includes("content: 'LATEST SNAPSHOT'") && files.v122Css.includes('.rundeckJobHistoryHead em.is-current')],
  ['selected workload keeps observation performance and issue timeline', files.history.includes('>Observation<') && files.history.includes('>Performance<') && files.history.includes('Issue Timeline') && files.history.includes('Observed Checks')],
  ['timeline wording stays observational not causal', files.history.includes('Workload was already observed') && files.history.includes('Workload first observed') && !files.history.includes('before issue start')],
  ['observation history remains collapsed by default', files.history.includes('<details className="rundeckJobExecutionHistory">')],
  ['SAP Issues appears before Performance Evaluation', monitoringSapIssuesIndex >= 0 && monitoringEvaluationIndex >= 0 && monitoringSapIssuesIndex < monitoringEvaluationIndex],
  ['active SAP Issues open automatically', files.monitoring.includes('open={activeCount > 0}')],
  ['SAP Issues table uses lean six-column view', files.monitoring.includes('<th>APP</th><th>SAP Signal</th><th>State</th><th>Current</th><th>Peak</th><th>Duration</th>') && !files.monitoring.includes('<th>First Seen</th><th>Last Seen</th><th>Duration</th><th>Evidence</th>')],

  ['availability keeps primary SAP APP HANA and Web grouping', ['SAP App', 'HANA', 'Web'].every((value) => files.availability.includes(value))],
  ['availability technical checks use Primary Secondary DR matrix', files.availability.includes('rundeckAvailabilityMatrix') && files.availability.includes('<span>Check</span><span>Primary</span><span>Secondary</span><span>DR</span>') && files.availability.includes('<b>Replication</b>') && files.availability.includes('<b>SSH</b>')],
  ['availability keeps SAP App SSH separate', files.availability.includes('SAP App SSH') && files.availability.includes('appSsh')],
  ['availability distinguishes primary service and technical down counts', files.availability.includes('primaryServiceDownCount') && files.availability.includes('primary service') && files.availability.includes('technicalDownCount') && files.availability.includes('More technical checks')],
  ['availability shows concise operator freshness while retaining bundle detail in title', files.availability.includes('Updated ${formatWib(data.collected_at, true)} WIB') && files.availability.includes("? 'Refreshing…'") && files.availability.includes('source gap ${skew}s') && !files.availability.includes('Fresh Collection · Performance')],
  ['availability final polish preserves four-column matrix', files.availabilityPolish.includes('.rundeckAvailabilityMatrix > div') && files.availabilityPolish.includes('repeat(3, minmax(72px, .72fr))') && files.availabilityPolish.includes('.rundeckAvailabilityMoreBody > .rundeckAvailabilityTechnicalRow') && !files.availabilityPolish.includes('.rundeckAvailabilityMoreBody > div {')],
  ['technical check count remains visible after legacy pseudo label', files.uiFreeze.includes('.rundeckAvailabilityMore > summary::after') && files.uiFreeze.includes('content: none !important') && files.uiFreeze.includes('.rundeckAvailabilityMore > summary > span')],

  ['v1.21 evidence API is exposed', files.backendApi.includes('@app.get("/analysis/evidence")') && files.backendApi.includes('evidence_timeline')],
  ['evidence correlation has configurable source skew', files.backendEvidence.includes('SPHERE_CORRELATION_MAX_SKEW_MIN') && files.backendEvidence.includes('"ALIGNED"') && files.backendEvidence.includes('"LIMITED"') && files.backendEvidence.includes('"INSUFFICIENT DATA"')],
  ['evidence workload uses latest continuous observation episode', files.backendEvidence.includes('SPHERE_EVIDENCE_WORKLOAD_GAP_MINUTES') && files.backendEvidence.includes('_latest_episode')],
  ['availability first DOWN is not misreported as a transition', files.backendEvidence.includes('availability-observed-down') && files.backendEvidence.includes('earlier state is unknown') && files.backendEvidence.includes('availability-transition')],
  ['evidence wording stays correlation-safe', files.backendEvidence.includes('supporting evidence') && files.backendEvidence.includes('does not establish automatic root cause') && files.backendEvidence.includes('root cause still requires validation')],
  ['evidence timeline stays secondary and collapsed', files.incident.includes('<RundeckEvidenceTimeline') && files.evidenceUi.includes('<details className="rundeckEvidenceTimeline">') && !files.evidenceUi.includes('<details open')],
  ['evidence timeline exposes alignment coverage and interpretation', files.evidenceUi.includes('Evidence Timeline') && files.evidenceUi.includes('max skew') && files.evidenceUi.includes('Availability History') && files.evidenceUi.includes('Evidence interpretation')],
  ['evidence alignment explicitly means timing not causation', files.evidenceUi.includes('Alignment Window') && files.evidenceUi.includes('Timing alignment supports correlation only') && files.evidenceUi.includes('timing only · not causation')],
  ['evidence timeline semantic states are styled without dashboard redesign', files.evidenceCss.includes('.rundeckEvidenceAlignment.is-aligned') && files.evidenceCss.includes('.rundeckEvidenceAlignment.is-limited') && files.evidenceCss.includes('.rundeckEvidenceTimeline > summary')],

  ['Collect Now is visible by default but remains runner-credential guarded', files.backendApi.includes('RUNDECK_COLLECT_NOW_ENABLED') && files.backendApi.includes('setdefault') && files.backendRunner.includes('RUNNER_CREDENTIAL_MISSING') && files.backendRunner.includes('"allowed": ready and not running and not cooldown')],
  ['Collect Now resolves only fixed server-side Rundeck identity', files.backendRunner.includes('RUNDECK_JOB_GROUP') && files.backendRunner.includes('RUNDECK_JOB_NAME') && files.backendRunner.includes('_discover_job_id') && files.backendRunner.includes('groupPathExact') && files.backendRunner.includes('jobFilter')],
  ['Collect Now uses dedicated runner credential and never browser job id', files.backendRunner.includes('rundeck-runner') && files.backendRunner.includes('RUNDECK_RUNNER_TOKEN_FILE') && files.backendRunner.includes('actor: str | None = None')],
  ['Collect Now watches execution and ingests fresh result with poller fallback', files.backendRunner.includes('_watch_execution') && files.backendRunner.includes('output_text') && files.backendRunner.includes('ingest(') && files.backendRunner.includes('PENDING_POLLER')],
  ['Collect Now UI keeps cooldown and approved action header', files.source.includes('/collect-now/status') && files.source.includes("'X-SPHERE-Action': 'collect-now'") && files.source.includes('Cooldown') && files.source.includes('Running #')],

  ['evaluation defaults to one day in UI and API', files.evaluation.includes("useState('1d')") && files.backendApi.includes('period: str = Query("1d"') && files.backendEvaluation.includes('evaluation_report(period: str = "1d"')],
  ['evaluation quality header is lean', ['Data Coverage', 'Collection Checks', 'Historical Baseline'].every((value) => files.evaluation.includes(value)) && !files.evaluation.includes('Persisted Depth')],
  ['low coverage limits conclusions explicitly', files.evaluation.includes('Historical window is not fully covered. Conclusions are limited.')],
  ['evaluation summary focuses on review spike and increase', files.evaluation.includes('Review Required') && files.evaluation.includes('CPU Spike') && files.evaluation.includes('CPU Increase') && !files.evaluation.includes('<span>CPU Shift</span>') && !files.evaluation.includes('<span>Workloads</span>')],
  ['review card does not imply high CPU and memory are a breakdown', files.evaluation.includes('workloads requiring review') && !files.evaluation.includes('summary.sustained_high_cpu') && !files.evaluation.includes('summary.high_memory')],
  ['evaluation table is reason-first and lean', files.evaluation.includes('<th>Reason</th>') && ['Observed Checks', 'Avg CPU', 'Peak CPU', 'PSS Memory'].every((value) => files.evaluation.includes(value)) && !files.evaluation.includes('<th>Data Confidence</th>') && !files.evaluation.includes('label="Critical WP Overlap"')],
  ['legacy evaluation density remains available below operator overrides', files.availabilityPolish.includes('grid-template-columns: repeat(3, minmax(0, 1fr))') && files.availabilityPolish.includes('.rundeckEvaluationTable thead th') && files.availabilityPolish.includes('position: sticky !important')],
  ['evaluation row readability micro-polish remains', files.uiFreeze.includes('.rundeckEvaluationTable.is-lean td') && files.uiFreeze.includes('padding-top: 7px !important') && files.uiFreeze.includes('.rundeckEvaluationAssessmentWrap')],
  ['status shows deterministic reason before the secondary operational status', files.evaluation.includes('<span className="rundeckEvaluationReason">{reason || status}</span>') && files.evaluation.includes("status !== 'NORMAL'") && files.evaluation.includes('evaluationReasonText(row)')],
  ['review reason explains high CPU and baseline evidence', evaluationReasonText(reviewAboveBaseline) === 'High CPU · Above Baseline'],
  ['review reason qualifies Critical WP as supporting evidence', evaluationReasonText(reviewCriticalWp) === 'High CPU · Critical WP Evidence'],
  ['CPU spike explanation remains distinct from sustained high CPU', evaluationReasonText(spikeOnly) === 'Peak only'],
  ['historical CPU context exposes average P95 and difference', files.evaluation.includes('baselineCpuContext(row)') && files.explain.includes('Difference:') && files.explain.includes('Historical P95:')],
  ['observed checks are capped to complete collection checks', files.evaluation.includes('Math.min(observed, complete)')],
  ['display confidence is recomputed from visible checks and period quality', files.evaluation.includes('effectiveConfidence') && files.evaluation.includes("checks >= 20 ? 'HIGH' : checks >= 4 ? 'MEDIUM' : 'LOW'")],
  ['Critical WP wording states timing evidence without causation', files.evaluation.includes('same SAP App Server during the workload observation window') && files.evaluation.includes('not direct causation or direct workload-to-WP mapping')],
  ['evaluation keeps familiar operational statuses', ['REVIEW REQUIRED', 'HIGH CPU', 'HIGH MEMORY', 'CPU SPIKE', 'INCREASING CPU', 'RECURRING', 'INSUFFICIENT DATA', 'NORMAL'].every((value) => files.backendEvaluation.includes(value))],
  ['historical baseline uses median and P95', files.backendEvaluation.includes('_historical_baseline') && files.backendEvaluation.includes('percentile_cont(0.5)') && files.backendEvaluation.includes('percentile_cont(0.95)')],
  ['WP overlap remains normalized against APP baseline', files.backendEvaluation.includes('app_wp_baseline_pct') && files.backendEvaluation.includes('wp_excess_association_pct')],
  ['evaluation excludes incomplete collections', files.backendEvaluation.includes("status = 'READY'") && files.backendEvaluation.includes('received_host_count >=')],

  ['lean CSS removes duplicate header and server status columns visually', files.v120Css.includes('.rundeckLandscapeMeta span:nth-child(n+2)') && files.v120Css.includes('.rundeckServerTable th:nth-child(3)')],
  ['semantic colors reserve review and high states away from danger red', files.v120Css.includes('.is-review-required') && files.v120Css.includes('--sphere-review') && files.v120Css.includes('.is-high-cpu') && files.v120Css.includes('--sphere-high')],
  ['PDF preview still replaces immediate save', files.source.includes("pdf.output('blob')") && !files.source.includes('pdf.save(') && files.source.includes('Report Preview') && files.source.includes('Download PDF')],
  ['PDF summary contains only current workload', files.source.includes("pdf.text('CURRENT WORKLOAD'") && !files.source.includes("pdf.text('RECURRING WORKLOAD'")],
  ['PDF SAP App Server status uses lean columns', files.source.includes("['APP', 'OS RESOURCE', 'CPU', 'MEMORY', 'I/O WAIT', 'CRIT WP']") && !files.source.includes("['APP', 'OS RESOURCE', 'SAP WORKLOAD', 'CPU', 'MEMORY', 'I/O WAIT', 'CRIT WP']")],
  ['PDF keeps one-page triage sections', ['PRIMARY ISSUE', 'SAP APP SERVER STATUS', 'SERVER ${trendMetric} TREND', 'SELECTED WORKLOAD', 'TOP ACTIVE WORKLOADS'].every((value) => files.source.includes(value))],
  ['PDF adds explicit operational state domains', files.source.includes("pdf.text('OPERATIONAL STATE'") && files.source.includes('OS Resource ${osState}') && files.source.includes('SAP Workload ${sapState}') && files.source.includes('Availability ${availabilityState}')],
  ['PDF adds compact Availability summary from current endpoint', files.source.includes('/availability/latest') && files.source.includes("pdf.text('AVAILABILITY'") && files.source.includes('availabilityAppUp') && files.source.includes("availabilityStatus(hanaRows, 'PRIMARY')")],
  ['PDF balances Selected Workload and Top Active Workloads', files.source.includes('const leftW = contentW * .66')],
  ['PDF carries the same qualified evaluation reason when available', files.source.includes('/evaluation/workloads?period=1d&type=ALL&limit=100') && files.source.includes('evaluationReasonText(evaluation)') && files.explain.includes('Critical WP Evidence')],

  ['deployment uses isolated managed nginx block updater', files.nginxUpdater.includes('BEGIN SPHERE') && files.nginxUpdater.includes('END SPHERE') && files.deployDev.includes('update-nginx-block.py') && files.deployDev.includes('--name DEV')],
  ['DEV deploy protects production routing', files.deployDev.includes('# SPHERE production Rundeck API routing') && files.deployDev.includes('# BEGIN SPHERE PROD ROUTING')],
  ['DEV deploy validates production JSON endpoints', files.deployDev.includes('https://sphere.astraotoparts.co.id/api/collections/latest') && files.deployDev.includes('https://sphere.astraotoparts.co.id/api/history/hosts/latest') && files.deployDev.includes('https://sphere.astraotoparts.co.id/api/platform/health') && files.deployDev.includes('HTML returned where JSON was required')],
  ['DEV deploy validates DEV JSON endpoint', files.deployDev.includes('https://sphere.astraotoparts.co.id/dev/api/collections/latest')],

  ['adaptive layout remains enabled', files.sourceCss.includes('container-type: inline-size') && files.sourceCss.includes('clamp(')],
  ['visual config still covers desktop and laptop', files.visualConfig.includes('desktop-1920') && files.visualConfig.includes('laptop-1366')],
  ['backend still exposes explicit OS and SAP status domains', files.backendStatus.includes('resource_health') && files.backendStatus.includes('sap_workload_state') && files.backendLatest.includes('enrich_host_state')],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)

if (failed.length) {
  console.error(`\n${failed.length} Rundeck v1.22.2 contract check(s) failed.`)
  process.exit(1)
}

console.log('\nRundeck v1.22.2 contract checks passed.')

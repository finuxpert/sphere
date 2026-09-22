import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const files = {
  version: read('src/app/version.js'),
  wrapper: read('src/tools/components/RundeckMonitoringHistory.jsx'),
  core: read('src/tools/components/RundeckMonitoringHistoryCore.jsx'),
  workspace: read('src/tools/components/RundeckWorkspace.css'),
  jobMonitor: read('src/tools/components/RundeckJobMonitor.jsx'),
  jobMonitorCss: read('src/tools/components/RundeckJobMonitor.css'),
  sm37: read('src/tools/components/RundeckSm37Verification.jsx'),
  sm37Portal: read('src/tools/components/RundeckSm37LivePortal.jsx'),
  sm37Css: read('src/tools/components/RundeckSm37Verification.css'),
  explorer: read('src/tools/components/RundeckWorkloadExplorer.jsx'),
  serverTrend: read('src/tools/components/RundeckServerTrend.jsx'),
  jobHistory: read('src/tools/components/RundeckJobHistory.jsx'),
  api: read('backend/rundeck_api.py'),
  intelligence: read('backend/rundeck_job_intelligence.py'),
  migration: read('backend/db/migrations/versions/20260916_0004_sap_job_executions.py'),
  importer: read('ops/rundeck/import-sm37.py'),
  smoke: read('ops/rundeck/smoke-job-intelligence-dev.sh'),
  envExample: read('ops/rundeck/rundeck-dev.env.example'),
  watchdog: read('backend/rundeck_watchdog.py'),
  metrics: read('backend/rundeck_metrics.py'),
}

const checks = [
  ['collector reliability version is v1.30.0', files.version.includes("APP_VERSION = '1.30.0'") && files.version.includes('collector-reliability-ui-v1.30.0')],
  ['Live Monitoring remains available', files.wrapper.includes('Live Monitoring')],
  ['Job and Program History remains available', files.wrapper.includes('Job &amp; Program History')],
  ['SAP Job Monitor is wired as a third mode', files.wrapper.includes('RundeckJobMonitor') && files.wrapper.includes("monitoringMode === 'jobs'") && files.wrapper.includes('SAP Job Monitor')],
  ['primary 40/60 layout is preserved', files.workspace.includes('grid-template-columns: minmax(0, 40fr) minmax(0, 60fr)')],
  ['operational 45/55 layout is preserved', files.workspace.includes('grid-template-columns: minmax(0, 45fr) minmax(0, 55fr)')],
  ['issues review 35/65 layout is preserved', files.workspace.includes('grid-template-columns: minmax(0, 35fr) minmax(0, 65fr)')],
  ['SM37 execution schema is authoritative and separate from WP sampling', files.migration.includes('sap_job_executions') && files.intelligence.includes('never promoted to an authoritative')],
  ['SM37 import supports dry run before apply', files.importer.includes('MODE=DRY-RUN') && files.importer.includes('--apply')],
  ['SM37 HTTP import is disabled by default and secret protected', files.api.includes('SPHERE_SM37_IMPORT_ENABLED') && files.api.includes('SPHERE_SM37_IMPORT_TOKEN') && files.api.includes('secrets.compare_digest') && files.api.includes('5000 records')],
  ['SM37 settings are documented without a committed secret', files.envExample.includes('SPHERE_SM37_IMPORT_ENABLED=false') && files.envExample.includes('SPHERE_SM37_IMPORT_TOKEN=')],
  ['SM37 verification supports matched partial and not verified', files.intelligence.includes('MATCHED') && files.intelligence.includes('PARTIAL_MATCH') && files.intelligence.includes('NOT_VERIFIED')],
  ['dynamic SM37 component never infers root cause', files.sm37.includes('not root cause') && files.sm37.includes('/jobs/verify')],
  ['live Selected Workload receives dynamic SM37 verification', files.wrapper.includes('RundeckSm37LivePortal') && files.sm37Portal.includes('createPortal') && files.sm37Portal.includes('/history/job') && files.sm37Css.includes('has-dynamic-verification')],
  ['Job Monitor exposes long running failed and performance signals', files.jobMonitor.includes('Long Running') && files.jobMonitor.includes('Failed or Canceled') && files.jobMonitor.includes('Peak CPU') && files.jobMonitor.includes('Critical WP')],
  ['Job Monitor has analytics baseline and correlation drilldown', files.jobMonitor.includes('/jobs/analytics') && files.jobMonitor.includes('/jobs/baseline') && files.jobMonitor.includes('/jobs/correlation')],
  ['Job Monitor uses authoritative verification component', files.jobMonitor.includes('RundeckSm37Verification')],
  ['Job Monitor can export investigation evidence', files.jobMonitor.includes('/reports/investigation') && files.jobMonitor.includes('SPHERE_Job_Investigation_')],
  ['Review queue endpoint exists', files.api.includes('@app.get("/review/queue")')],
  ['Investigation report endpoint exists', files.api.includes('@app.get("/reports/investigation")')],
  ['Platform readiness endpoint exists', files.api.includes('@app.get("/platform/readiness")')],
  ['Historical explorer supports 24H through 30D', ['24h', '3d', '7d', '30d'].every((value) => files.explorer.includes(`'${value}'`))],
  ['Baseline requires retained evidence and Basis validation', files.intelligence.includes('Baseline signals compare retained observations and require Basis validation.')],
  ['Correlation wording avoids causation claim', files.intelligence.includes('Temporal alignment narrows investigation; it does not prove causation.')],
  ['Investigation report preserves root-cause boundary', files.intelligence.includes('Root-cause validation remains a Basis investigation step.')],
  ['Job Monitor CSS exists and keeps responsive fallback', files.jobMonitorCss.includes('@media(max-width:1180px)') && files.jobMonitorCss.includes('.rundeckJobIntelligence')],
  ['SM37 evidence styling is subdued', files.sm37Css.includes('background:transparent') && files.sm37Css.includes('border-left-width:1px')],
  ['Selected workload still hides zero-value I/O noise in multi-series profile', files.jobHistory.includes('some((value) => Math.abs(value) > 0)')],
  ['Job Intelligence smoke covers readiness source monitor and review queue', files.smoke.includes('/platform/readiness') && files.smoke.includes('/jobs/source') && files.smoke.includes('/jobs/monitor') && files.smoke.includes('/review/queue')],
  ['Server Trend pins selected range and marks collection gaps', files.serverTrend.includes('gapThresholdMs') && files.serverTrend.includes("formatter: 'NO DATA'") && files.serverTrend.includes('min: Number.isFinite(rangeStart)')],
  ['watchdog uses exact job identity and confirmation guard', files.watchdog.includes('job_matches') && files.watchdog.includes('required_confirmations') && files.watchdog.includes('SPHERE_WATCHDOG_AUTO_ABORT')],
  ['Prometheus exposes collector reliability metrics', files.metrics.includes('sphere_collection_age_seconds') && files.metrics.includes('sphere_rundeck_execution_stuck') && files.metrics.includes('sphere_watchdog_auto_abort_total')],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (failed.length) {
  console.error(`\n${failed.length} Basis investigation contract check(s) failed.`)
  process.exit(1)
}
console.log('\nSPHERE v1.30.0 collector reliability contract checks passed.')

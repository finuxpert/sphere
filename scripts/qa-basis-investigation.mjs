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
  sm37Css: read('src/tools/components/RundeckSm37Verification.css'),
  explorer: read('src/tools/components/RundeckWorkloadExplorer.jsx'),
  jobHistory: read('src/tools/components/RundeckJobHistory.jsx'),
  api: read('backend/rundeck_api.py'),
  intelligence: read('backend/rundeck_job_intelligence.py'),
  migration: read('backend/db/migrations/versions/20260916_0004_sap_job_executions.py'),
  importer: read('ops/rundeck/import-sm37.py'),
}

const checks = [
  ['final campaign version is v1.29.0', files.version.includes("APP_VERSION = '1.29.0'") && files.version.includes('basis-investigation-workspace-v1.29.0')],
  ['Live Monitoring remains available', files.wrapper.includes('Live Monitoring')],
  ['Job and Program History remains available', files.wrapper.includes('Job &amp; Program History')],
  ['SAP Job Monitor is wired as a third mode', files.wrapper.includes("RundeckJobMonitor") && files.wrapper.includes("monitoringMode === 'jobs'") && files.wrapper.includes('SAP Job Monitor')],
  ['primary 40/60 layout is preserved', files.workspace.includes('grid-template-columns: minmax(0, 40fr) minmax(0, 60fr)')],
  ['operational 45/55 layout is preserved', files.workspace.includes('grid-template-columns: minmax(0, 45fr) minmax(0, 55fr)')],
  ['issues review 35/65 layout is preserved', files.workspace.includes('grid-template-columns: minmax(0, 35fr) minmax(0, 65fr)')],
  ['SM37 execution schema is authoritative and separate from WP sampling', files.migration.includes('sap_job_executions') && files.intelligence.includes('never promoted to an authoritative')],
  ['SM37 import supports dry run before apply', files.importer.includes('MODE=DRY-RUN') && files.importer.includes('--apply')],
  ['SM37 verification supports matched partial and not verified', files.intelligence.includes('MATCHED') && files.intelligence.includes('PARTIAL_MATCH') && files.intelligence.includes('NOT_VERIFIED')],
  ['dynamic SM37 component never infers root cause', files.sm37.includes('not root cause') && files.sm37.includes('/jobs/verify')],
  ['Job Monitor exposes long running failed and performance signals', files.jobMonitor.includes('Long Running') && files.jobMonitor.includes('Failed or Canceled') && files.jobMonitor.includes('Peak CPU') && files.jobMonitor.includes('Critical WP')],
  ['Job Monitor has analytics baseline and correlation drilldown', files.jobMonitor.includes('/jobs/analytics') && files.jobMonitor.includes('/jobs/baseline') && files.jobMonitor.includes('/jobs/correlation')],
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
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (failed.length) {
  console.error(`\n${failed.length} Basis investigation contract check(s) failed.`)
  process.exit(1)
}
console.log('\nSPHERE v1.29.0 Basis investigation contract checks passed.')

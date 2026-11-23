import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read = name => readFileSync(new URL('../../src/tools/components/' + name, import.meta.url), 'utf8')
const entry = read('RundeckMonthlyReview.jsx')
const panels = read('RundeckMonthlyManagement.jsx')

test('entry orchestrates data, export, evidence, and UI styles; report panels are isolated',()=>{
  assert.match(entry,/import MonthlyManagementDashboard from '\.\/RundeckMonthlyManagement\.jsx'/)
  assert.match(entry,/export default function RundeckMonthlyReview\(/)
  assert.match(entry,/async function buildManagementMonthlyPng\(/)
  assert.match(entry,/import '\.\/RundeckMonthlyReview\.css'/)
  assert.match(entry,/import '\.\/RundeckMonthlyFinal20261030\.css'/)
  assert.match(entry,/<MonthlyManagementDashboard month=\{month\}/)
  assert.doesNotMatch(entry,/function MonthlyManagementDashboard\(/)
  assert.doesNotMatch(entry,/function MonthlyRanking\(/)
  assert.doesNotMatch(entry,/function HostTrend\(/)
  assert.match(panels,/export default function MonthlyManagementDashboard\(/)
  assert.match(panels,/function MonthlyRanking\(/)
  assert.match(panels,/function HostTrend\(/)
  assert.equal((panels.match(/export default function MonthlyManagementDashboard\(/g)||[]).length,1)
  assert.doesNotMatch(panels,/fetch\(|\/evaluation\/workloads|\/api\//)
  assert.doesNotMatch(panels,/import '\.\/RundeckMonthlyReview\.css'/)
})

test('chart lazy loading, zero/missing samples and export preloading remain intact',()=>{
  assert.match(panels,/React\.lazy\(loadTimeHostTrend\)/)
  assert.match(panels,/Array\.isArray\(pressure\.trend_hosts\)/)
  assert.match(entry,/await loadTimeHostTrend\(\)/)
  assert.match(panels,/firstObservedDay/)
  assert.match(panels,/fitObserved=\{false\}/)
  assert.match(panels,/Missing dates are not zero/)
  assert.match(panels,/monthlyRankMetricValue\(row,metric\)/)
  assert.match(panels,/savedPeriodPeak\(pressure,metric,month,weekStart,customStart,customEnd\)/)
  assert.match(panels,/monthlyEnterpriseReportModel\(month,\{\.\.\.full,monthly_storage:storage\}\)/)
})

test('management report retains the saved period and source-backed fields',()=>{
  for(const label of [
    'Top 5 Workloads — Peak WP CPU','Top 5 Workloads — Peak PSS',
    'Application Server Utilization','Top 5 Workloads for Review',
    'CPU Warning Checks','RAM Warning Checks','Observations',
    'Suggested Review','Filesystem Capacity','Available (df)',
  ])assert.ok(panels.includes(label),'Source-backed label missing: '+label)
  assert.match(panels,/row\.availability_source==='EXPLICIT'/)
  assert.match(panels,/snapshot>=Date\.parse\(reportWindow\.startUtc\)/)
  assert.match(panels,/snapshot<Date\.parse\(reportWindow\.exclusiveEndUtc\)/)
  assert.match(panels,/monthlyReviewBasis\(row\)/)
})

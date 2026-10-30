import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (name, extension = 'jsx') =>
  readFileSync(new URL(`../../src/tools/components/${name}.${extension}`, import.meta.url), 'utf8')

test('the monitoring UI avoids duplicate labels while preserving verified states', () => {
  const navigation = read('RundeckPerformanceNavigation')
  const issues = read('RundeckSapIssues')
  const trends = read('RundeckServerTrend')
  const availability = read('RundeckAvailability')

  assert.match(navigation, /<strong>Menu<\/strong>/)
  assert.match(navigation, /APP_DISPLAY_VERSION/)
  assert.match(navigation, /sphereSidebarRelease/)
  assert.match(read('RundeckEnterpriseShellV143', 'css'), /\.spherePerformanceSidebar\.is-collapsed \.sphereSidebarRelease/)
  assert.match(read('RundeckEnterpriseShellV143', 'css'), /margin-top:auto/)
  assert.match(readFileSync(new URL('../../src/app/version.js', import.meta.url), 'utf8'), /slice\(0, 8\)/)
  assert.doesNotMatch(navigation, /<strong>SPHERE<\/strong>/)

  assert.match(issues, /<b>Active findings<\/b><strong>\{activeFindings\}<\/strong>/)
  assert.match(issues, /<b>Critical<\/b><strong>\{criticalCount\}<\/strong>/)
  assert.match(issues, /<b>No Data<\/b><strong>\{unknownCount\}<\/strong>/)
  assert.doesNotMatch(issues, /rundeckSapIssueBreakdown/)
  assert.doesNotMatch(issues, /label: `Issues \$\{activeFindings\}/)
  assert.match(issues, /SM37 readiness/)

  assert.match(trends, /\{panelPeak && !clippedLoad && !clippedNetwork &&/)
  assert.match(trends, /\{panelPeak\.host\} · \{formatTrendPeakWib\(panelPeak\.timestamp\)\} WIB/)
  assert.doesNotMatch(trends, /'Selected ' \+ activeFocus : 'All APPs'/)

  assert.match(availability, /Last recorded availability snapshot/)
  assert.doesNotMatch(availability, /Last check: /)
  assert.match(availability, /current service state not verified/i)
})

test('embedded reports and collector tabs do not repeat panel titles', () => {
  const monitor = read('RundeckMonitoringHistory')
  const monthly = read('RundeckMonthlyReview')
  const collector = read('RundeckSystemData')
  const manual = read('RundeckDataCollection')
  const styles = read('RundeckSystemData', 'css')

  assert.equal((monitor.match(/<RundeckMonthlyReview /g) || []).length, 2)
  assert.match(monitor, /<RundeckMonthlyReview[^>]*showTitle=\{false\}/)
  assert.match(monthly, /showTitle = true/)
  assert.match(monthly, /showTitle && <div><strong>Monthly Review<\/strong>/)

  assert.match(collector, /hideTabs && <strong>Collection History<\/strong>/)
  assert.match(collector, /hideTabs && <strong>SPHERE Services<\/strong>/)
  assert.match(collector, /hideTabs && <strong>Token Management<\/strong>/)
  assert.doesNotMatch(collector, /Renew Now · Locked/)
  assert.match(collector, /Renewal by administrator/)
  assert.match(styles, /\.rundeckTokenRenewNote\{/)
  assert.doesNotMatch(manual, /<h3>Manual Upload<\/h3>/)
})

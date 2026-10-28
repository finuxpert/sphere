import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

test('performance history has distinct rolling and calendar presets', () => {
  const trend = read('src/tools/components/RundeckServerTrend.jsx')
  assert.match(trend, /\['24h', '1D'\]/)
  assert.match(trend, /\['7d', '7D'\]/)
  assert.match(trend, /\['30d', '30D'\]/)
  assert.match(trend, /\['last_month', 'Last Month'\]/)
  assert.match(trend, /\['90d', '3M'\]/)
  assert.match(trend, /\['180d', '6M'\]/)
  assert.match(trend, /aria-label="Short performance ranges"/)
  assert.match(trend, /\['180d', '6M'\]/)
  assert.match(trend, /<h3>Performance Trends<\/h3>/)
  assert.match(trend, /connectNulls: false/)
  assert.match(trend, /serverTrend1\?\.items\?\.length > 0/)
  assert.match(trend, /const longHistoricalRange = LONG_RANGES\.has\(range\)/)
  assert.match(trend, /longHistoricalRange \? 'auto' : bucket/)
  assert.match(trend, /configured_retention_days/)
  assert.match(trend, /title=\{longHistoricalRange && serverTrend1\?\.range === range/)
  assert.match(trend, /Missing days are unknown, not zero/)
  assert.doesNotMatch(trend, /rundeckHistoricalCoverage/)
})

test('long-range queries are bounded and unsupported SAP availability is explicit', () => {
  const api = read('backend/rundeck_api_core.py')
  const ranges = read('backend/rundeck_trends.py')
  const network = read('backend/rundeck_network_trends.py')
  const ui = read('src/tools/components/RundeckServerTrend.jsx')
  assert.match(api, /180d\|last_month/)
  assert.match(api, /previous_calendar_month\(\)/)
  assert.match(api, /configured_retention_days/)
  assert.match(ranges, /daily buckets/)
  assert.match(ranges, /last_month/)
  assert.match(ranges, /CAST\(:origin AS timestamptz\)/)
  assert.match(network, /if until is not None:/)
  assert.match(ui, /no verified daily summary/)
  assert.match(ui, /<h3>Performance Trends<\/h3>/)
})

test('existing current view, custom raw window and evaluation review remain unchanged', () => {
  const trend = read('src/tools/components/RundeckServerTrend.jsx')
  const review = read('src/tools/components/RundeckPerformanceReview.jsx')
  const api = read('backend/rundeck_api_core.py')
  assert.match(trend, /validateCustomRange\(customStart, customEnd\)/)
  assert.match(trend, /range === 'custom' \? 'auto' : bucket|range === 'custom' \|\| LONG_RANGES\.has\(range\)/)
  assert.match(review, /const PERIODS = \[\['1d', '1D'\], \['7d', '7D'\], \['30d', '30D'\]\]/)
  assert.match(api, /pattern="\^\(1d\|7d\|30d\)\$"/)
})

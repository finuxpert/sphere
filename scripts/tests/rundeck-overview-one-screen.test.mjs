import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveOverviewTrendMetrics, resolveServerTrendMetrics } from '../../src/tools/components/rundeckTrendPreferences.js'

const component = name => readFileSync(new URL('../../src/tools/components/' + name, import.meta.url), 'utf8')

test('legacy two-chart API preserves intentional duplicates', () => {
  assert.deepEqual(resolveServerTrendMetrics({}), {first:'cpu',second:'ram'})
  assert.deepEqual(resolveServerTrendMetrics({serverMetric1:'cpu',serverMetric2:'cpu'}), {first:'cpu',second:'cpu'})
})

test('four chart defaults remain distinct and preserve user-selected valid metrics', () => {
  assert.deepEqual(resolveOverviewTrendMetrics({}), {first:'cpu',second:'ram',third:'network',fourth:'wp'})
  const saved = resolveOverviewTrendMetrics({
    serverMetric1:'cpu',serverMetric2:'cpu',technicalMetric:'network',fourthMetric:'cpu',
  })
  assert.deepEqual(saved, {first:'cpu',second:'ram',third:'network',fourth:'wp'})
  assert.deepEqual(resolveOverviewTrendMetrics({
    serverMetric1:'swap',serverMetric2:'ram',technicalMetric:'network',fourthMetric:'wp',
  }), {first:'swap',second:'ram',third:'network',fourth:'wp'})
  assert.equal(new Set(Object.values(saved)).size, 4)
})

test('historical compatibility and invalid values never create duplicate charts', () => {
  const result = resolveOverviewTrendMetrics({serverMetric:'ram',serverMetric2:'invalid',technicalMetric:'ram',fourthMetric:'ram'})
  assert.equal(result.first,'ram')
  assert.equal(new Set(Object.values(result)).size,4)
})

test('last-loaded layout owns lower two columns and preserves natural overflow', () => {
  const wrapper = component('RundeckMonitoringHistory.jsx')
  const css = component('RundeckOneScreenDev.css')
  const bootstrap = component('RundeckBootstrapTrend.css')
  assert.match(wrapper, /import '\.\/RundeckBootstrapTrend\.css'\s*\nimport '\.\/RundeckOneScreenDev\.css'/)
  assert.match(css, /grid-template-columns:\s*minmax\(0,44fr\) minmax\(0,56fr\)/)
  assert.match(css, /\.sphereOverviewBottomRow\.row\s*>/)
  assert.doesNotMatch(css, /\.sphereOverviewBottomRow[^}]*overflow:\s*hidden/s)
  assert.doesNotMatch(bootstrap, /\.sphereOverviewBottomRow\.row\s*\{\s*display:flex/)
})

test('peak scope, four dropdowns and reset remain source-preserving', () => {
  const trend = component('RundeckServerTrend.jsx')
  assert.match(trend, /Reset charts/)
  assert.match(trend, /All APPs peak/)
  assert.match(trend, /Selected ' \+ activeFocus/)
  assert.match(trend, /savedTrendPeak\(panel\.trend, mode, activeFocus\)/)
  assert.match(trend, /<select className="rundeckTrendMetricSelect/)
  assert.match(trend, /<InfrastructureGapBand trend=\{panel\.trend\} \/>/)
})

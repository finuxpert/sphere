import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { trendGaps } from '../../src/tools/components/rundeckServerTrendGaps.js'
import { BUCKETS, metricLabel, palette } from '../../src/tools/components/rundeckServerTrendShared.js'

const stamp = minutes => new Date(Date.UTC(2026, 9, 13, 0, minutes)).toISOString()

test('APP performance gaps preserve interval, missing buckets and no fabricated zero', () => {
  const trend = { metric: 'cpu', bucket: '10m', since: stamp(0), window_end: stamp(61),
    items: [{ bucket: stamp(0), avg_value: 0 }, { bucket: stamp(10), avg_value: null }, { bucket: stamp(40), avg_value: 12 }] }
  const before = structuredClone(trend)
  const value = trendGaps(trend)
  assert.deepEqual(value.gaps, [[Date.parse(stamp(20)), Date.parse(stamp(30))]])
  assert.equal(value.intervalMs, 600000)
  assert.equal(value.historyStartedAt, null)
  assert.deepEqual(trend, before)
})

test('inferred performance retention start is a coverage boundary, not outage', () => {
  const result = trendGaps({ metric: 'ram', bucket: '10m', since: stamp(0), window_end: stamp(60), items: [{ bucket: stamp(30) }, { bucket: stamp(40) }] })
  assert.equal(result.historyStartedAt, Date.parse(stamp(30)))
  assert.deepEqual(result.gaps, [])
})

test('availability gaps are exclusively explicit saved observation evidence', () => {
  const observed = trendGaps({ metric: 'availability', bucket: '10m', since: stamp(0), window_end: stamp(60), observation_gaps: [
    { from: stamp(20), to: stamp(30) }, { from: 'invalid', to: stamp(45) }, { from: stamp(40), to: stamp(40) }], items: [] })
  assert.deepEqual(observed.gaps, [[Date.parse(stamp(20)), Date.parse(stamp(30))]])
  assert.equal(observed.historyStartedAt, null)
  const unknown = trendGaps({ metric: 'availability', since: stamp(0), window_end: stamp(60), items: [{ bucket: stamp(0) }, { bucket: stamp(40) }] })
  assert.deepEqual(unknown.gaps, [])
  assert.equal(unknown.historyStartedAt, null)
})

test('explicit collection cadence and no observations stay well-defined', () => {
  const trend = trendGaps({ metric: 'wp', bucket_interval_seconds: 900, since: stamp(0), window_end: stamp(60), items: [] })
  assert.equal(trend.intervalMs, 900000)
  assert.deepEqual(trend.gaps, [])
})

test('shared legend and dark fallback palette preserve current semantics', () => {
  assert.equal(metricLabel('cpu'), 'CPU')
  assert.equal(metricLabel('fs:/SAP_ARCH'), 'Filesystem /SAP_ARCH')
  assert.equal(metricLabel('network_rx'), 'Network RX')
  assert.equal(BUCKETS[0][0], 'auto')
  assert.equal(BUCKETS.at(-1)[0], '1d')
  assert.equal(palette().series.length, 5)
})

test('ECharts selection/tooltip and saved evidence remain in isolated chart module', () => {
  const component = readFileSync(new URL('../../src/tools/components/RundeckServerTrend.jsx', import.meta.url), 'utf8')
  const chart = readFileSync(new URL('../../src/tools/components/RundeckServerTrendChart.jsx', import.meta.url), 'utf8')
  assert.match(component, /import TrendChart from '\.\/RundeckServerTrendChart\.jsx'/)
  assert.match(component, /<TrendChart trend=\{trend\}/)
  assert.match(chart, /chart\.dispatchAction\(\{ type: 'hideTip' \}\)/)
  assert.match(chart, /const visible = focused/)
  assert.match(chart, /buildHostTrendSeries\(/)
  assert.match(chart, /selectedKey, availabilityMode/)
  assert.match(chart, /collection_gaps/)
  assert.match(chart, /new MutationObserver/)
  assert.match(chart, /chart\.dispose\(\)/)
})

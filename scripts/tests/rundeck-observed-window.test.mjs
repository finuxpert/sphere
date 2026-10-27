import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { observedTrendWindow } from '../../src/tools/components/rundeckObservedWindow.js'

const source = () => readFileSync(new URL('../../src/tools/components/RundeckServerTrend.jsx', import.meta.url), 'utf8')
const sample = (at, n) => ({ bucket: at, avg_value: n, max_value: n })

test('fit observed samples respects timestamps and keeps every source reading untouched', () => {
  const first = sample('2026-09-10T00:00:00+07:00', 11)
  const second = sample('2026-10-27T00:00:00+07:00', 12)
  const trend = Object.freeze({ items: Object.freeze([Object.freeze(first), Object.freeze(second)]) })
  const before = JSON.stringify(trend)
  const result = observedTrendWindow([trend])
  assert.equal(result.sampleCount, 2)
  assert.equal(result.first, Date.parse(first.bucket))
  assert.equal(result.last, Date.parse(second.bucket))
  assert.ok(result.from < result.first)
  assert.ok(result.to > result.last)
  assert.equal(JSON.stringify(trend), before)
})

test('unobserved, null, invalid and synthetic zero-looking empty readings cannot create history', () => {
  assert.equal(observedTrendWindow([null, {}, { items: [] }]), null)
  assert.equal(observedTrendWindow([{ items: [
    { bucket:'2026-04-01T00:00:00Z', avg_value:null, max_value:null },
    { bucket:'2026-06-01T00:00:00Z', avg_value:'', max_value:undefined },
    { bucket:'not-a-date', avg_value:11, max_value:12 },
  ] }]), null)
  const res = observedTrendWindow([{ items: [
    sample('2026-09-01T00:00:00Z', 0), { bucket:'2026-10-10T00:00:00Z', status:'DOWN' },
  ] }])
  assert.equal(res.sampleCount, 2)
})

test('different APP and infrastructure trend sources share one observed time axis', () => {
  const rows = [
    { items: [sample('2026-09-09T12:00:00Z', 6)] },
    { items: [sample('2026-10-26T12:00:00Z', 13)] },
    { items: [sample('2026-10-27T18:00:00Z', 99)] },
  ]
  const common = observedTrendWindow(rows)
  assert.equal(common.first, Date.parse(rows[0].items[0].bucket))
  assert.equal(common.last, Date.parse(rows[2].items[0].bucket))
  assert.equal(common.sampleCount, 3)
})

test('short observation windows keep a bounded minimum visible duration', () => {
  const point = sample('2026-10-27T12:00:00Z', 5)
  const bounds = observedTrendWindow([{ items:[point] }])
  assert.ok(bounds.to - bounds.from >= 24 * 60 * 60 * 1000)
})

test('historical axis fitting is explicit, accessible and leaves source checks intact', () => {
  const s = source()
  assert.match(s, /const \[fitObserved, setFitObserved\] = React\.useState\(false\)/)
  assert.match(s, /aria-label="Historical display window"/)
  assert.match(s, /aria-pressed=\{Boolean\(displayWindow\)\}/)
  assert.match(s, /displayWindow\?\.from \?\? \(Number\.isFinite\(rangeStart\)/)
  assert.match(s, /displayWindow\?\.to \?\? rangeEnd/)
  assert.match(s, /earlier intervals remain unknown/)
  assert.match(s, /markLine: index === 0 && visibleThresholds\.length/)
  assert.match(s, /markArea: index === 0 && gaps\.length/)
})

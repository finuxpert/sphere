import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { retainedAmbientPoints } from '../../src/tools/components/rundeckTrendAmbient.js'

test('ambient motion only selects actual numeric retained chart samples', () => {
  const series = [{ name: 'APP1', data: [
    { value: ['2026-10-19T01:00:00Z', 0] },
    { value: ['2026-10-19T01:10:00Z', null], gap: true },
    { value: ['2026-10-19T01:20:00Z', null] },
    { value: ['2026-10-19T01:30:00Z', 83] },
  ] }, { name: 'APP2', data: [{ value: ['2026-10-19T01:00:00Z', 45] }] }]
  assert.deepEqual(retainedAmbientPoints(series, 8).map(item => item.value[1]), [0, 83, 45])
  assert.deepEqual(retainedAmbientPoints([], 5), [])
  assert.deepEqual(retainedAmbientPoints(null, 5), [])
  assert.ok(retainedAmbientPoints([{ data: Array.from({ length: 100 }, (_, i) =>
    ({ value: [i, i] })) }], 5).length <= 5)
})

test('motion is decorative, bounded, and preserves source ECharts interaction', () => {
  const read = file => readFileSync(new URL('../../src/tools/components/' + file, import.meta.url), 'utf8')
  const trend = read('RundeckServerTrend.jsx')
  const layer = read('rundeckTrendAmbient.js')
  const css = read('RundeckTrendAmbient.css')
  assert.match(trend, /chart\.on\('click', exactClick\)/)
  assert.match(trend, /chart\.getZr\(\)\.on\('click', fallbackClick\)/)
  assert.match(trend, /attachTrendAmbient\(/)
  assert.match(trend, /motionPaused=\{Boolean\(selected \|\| windowModal \|\| customOpen\)\}/)
  assert.match(css, /pointer-events:none!important/)
  assert.match(css, /prefers-reduced-motion:reduce/)
  assert.match(layer, /IntersectionObserver/)
  assert.match(layer, /datazoom/)
  assert.match(layer, /chart\.convertToPixel/)
  assert.doesNotMatch(layer, /fetch\(/)
})

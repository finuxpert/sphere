import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { globeVisualOrder, globeStatusOpacity, globeFrontHitPoints, nearestEvaluationHex } from '../../src/tools/components/rundeckEvaluationGlobeLayout.js'

test('404 actual evaluation identities are preserved exactly once in the decorative globe', () => {
  const positions = globeVisualOrder(404)
  assert.equal(positions.length, 404)
  assert.equal(new Set(positions).size, 404)
  assert.equal(Math.min(...positions), 0)
  assert.equal(Math.max(...positions), 403)
  // Source order: review, attention, unknown, normal. Their visual latitudes
  // should overlap, while the row selectors and counts remain unchanged.
  const categories = indices => new Set(indices.map(i => i < 23 ? 'review' : i < 178 ? 'attention' : i < 309 ? 'unknown' : 'normal'))
  assert.equal(categories(positions.slice(0, 100)).size, 4)
  assert.equal(categories(positions.slice(200, 300)).size, 4)
  assert.deepEqual(globeVisualOrder(0), [])
})

test('idle touch chooses only the nearest source-backed hex, never a decorative blank area', () => {
  const points = [{ index: 7, x: 90, y: 50, size: 4 }, { index: 19, x: 120, y: 70, size: 5 }]
  assert.equal(nearestEvaluationHex(points, 91, 50), 7)
  assert.equal(nearestEvaluationHex(points, 120, 70), 19)
  assert.equal(nearestEvaluationHex(points, 30, 50), null)
  assert.equal(nearestEvaluationHex([], 90, 50), null)
})

test('globe preserves existing source-backed selection and reduced-motion fallback', () => {
  const read = file => readFileSync(new URL('../../src/tools/components/' + file, import.meta.url), 'utf8')
  const globe = read('RundeckEvaluationGlobe.jsx')
  const health = read('RundeckWorkloadHealth.jsx')
  const css = read('RundeckSphereMotion.css')
  assert.match(health, /onClick=\{\(\) => openWorkload\(row\)\}/)
  assert.match(health, /onSelectIndex=\{index => \{ if \(rows\[index\]\) openWorkload\(rows\[index\]\) \}\}/)
  assert.match(globe, /globeVisualOrder\(levels\.length\)/)
  assert.match(globe, /nearestEvaluationHex/)
  assert.match(css, /prefers-reduced-motion:reduce/)
  assert.match(css, /pointer-events:auto!important/)
})

test('depth shading makes backside hexagons calmer while keeping severity categories', () => {
  for (const level of ['review', 'attention', 'unknown', 'normal']) {
    assert.ok(globeStatusOpacity(level, -1) < globeStatusOpacity(level, 1))
    assert.ok(globeStatusOpacity(level, 1) <= .92)
  }
  assert.ok(globeStatusOpacity('review', 1) > globeStatusOpacity('unknown', 1))
  assert.deepEqual(globeFrontHitPoints([
    { index: 0, depth: -.5, x: 4, y: 2 }, { index: 1, depth: .4, x: 9, y: 5 },
  ]).map(point => point.index), [1])
  assert.deepEqual(globeFrontHitPoints([{ index: 0, depth: NaN, x: 0, y: 0 }]), [])
})
test('calm sphere only samples visible source-backed evaluation hexagons', () => {
  const read = file => readFileSync(new URL('../../src/tools/components/' + file, import.meta.url), 'utf8')
  const globe = read('RundeckEvaluationGlobe.jsx')
  const style = read('RundeckSphereMotion.css')
  assert.match(globe, /globeFrontHitPoints\(plotted\)/)
  assert.match(globe, /globeStatusOpacity\(point\.level, depth\)/)
  assert.match(globe, /time - last < 40/)
  assert.match(globe, /event\.preventDefault\(\)/)
  assert.match(style, /prefers-reduced-motion:reduce/)
  assert.match(style, /font-variant-numeric:tabular-nums/)
})

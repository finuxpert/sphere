import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveServerTrendMetrics } from '../../src/tools/components/rundeckTrendPreferences.js'

const source = (name) => readFileSync(new URL('../../src/tools/components/' + name, import.meta.url), 'utf8')

test('first-load trends default to CPU and RAM', () => {
  assert.deepEqual(resolveServerTrendMetrics(), { first: 'cpu', second: 'ram' })
})

test('legacy duplicate CPU preferences are normalized without a stale second CPU chart', () => {
  assert.deepEqual(resolveServerTrendMetrics({ serverMetric1: 'cpu', serverMetric2: 'cpu' }), { first: 'cpu', second: 'ram' })
  assert.deepEqual(resolveServerTrendMetrics({ serverMetric: 'cpu', serverMetric2: 'cpu' }), { first: 'cpu', second: 'ram' })
  assert.deepEqual(resolveServerTrendMetrics({ serverMetric1: 'ram', serverMetric2: 'ram' }), { first: 'ram', second: 'cpu' })
})

test('valid distinct operator preferences remain respected', () => {
  assert.deepEqual(resolveServerTrendMetrics({ serverMetric1: 'wp', serverMetric2: 'iowait' }), { first: 'wp', second: 'iowait' })
  assert.deepEqual(resolveServerTrendMetrics({ serverMetric1: 'unknown', serverMetric2: 'unknown' }), { first: 'cpu', second: 'ram' })
})

test('cockpit layout only constrains large short desktop windows; long tables scroll internally', () => {
  const css = source('RundeckCockpitPolish.css')
  assert.match(css, /min-width:1281px/)
  assert.match(css, /min-height:780px/)
  assert.match(css, /max-height:1100px/)
  assert.match(css, /100dvh/)
  assert.match(css, /\.rundeckCurrentWorkloadTableWrap/)
  assert.match(css, /overflow-y: auto !important/)
  assert.match(source('RundeckMonitoringHistory.jsx'), /import '\.\/RundeckCockpitPolish\.css'/)
})

test('System Data modal has scrim, focus trap, Escape close and restores prior scroll and focus', () => {
  const jsx = source('RundeckWorkspaceDrawer.jsx')
  const css = source('RundeckCockpitPolish.css')
  assert.match(jsx, /size === 'system-data'/)
  assert.match(jsx, /aria-modal=\{isModal\}/)
  assert.match(jsx, /event\.key === 'Escape'/)
  assert.match(jsx, /event\.key !== 'Tab'/)
  assert.match(jsx, /document\.body\.style\.overflow = previousOverflow/)
  assert.match(jsx, /previousFocus\?\.focus\?\.\(\)/)
  assert.match(jsx, /rundeckWorkspaceModalBackdrop/)
  assert.match(css, /\.rundeckWorkspaceDrawer\.is-system-data/)
})

test('motion is short, non-looping and honors reduced-motion preferences', () => {
  const css = source('RundeckCockpitPolish.css')
  const chart = source('RundeckServerTrend.jsx')
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.doesNotMatch(css, /animation-iteration-count:\s*infinite|animation:[^;]*infinite/)
  assert.match(chart, /animationDuration: reduceMotion \? 0 : 560/)
  assert.match(chart, /animationDurationUpdate: reduceMotion \? 0 : 200/)
})

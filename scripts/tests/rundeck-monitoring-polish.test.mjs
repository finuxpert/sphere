import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = name => readFileSync(new URL('../../src/tools/components/' + name, import.meta.url), 'utf8')

test('monitoring uses a source-preserving final stylesheet after Bootstrap foundation', () => {
  const page = read('RundeckMonitoringHistory.jsx')
  assert.match(page, /import '\.\/RundeckBootstrapFoundation\.css'\s*\nimport '\.\/RundeckMonitoringPolish\.css'/)
  assert.match(page, /Backup monitor:/)
  assert.match(page, /Backup monitoring configuration only/)
})

test('desktop overview allocates room for jobs and presents health as flat rows', () => {
  const base = read('RundeckOneScreenDev.css')
  const polish = read('RundeckMonitoringPolish.css')
  assert.match(base, /grid-template-columns:\s*minmax\(0,58fr\) minmax\(0,42fr\)/)
  assert.match(polish, /\.sphereOverviewDetails \.sphereHealthSummaryGrid/)
  assert.match(polish, /grid-template-columns:\s*minmax\(0, 1fr\)/)
  assert.match(polish, /\.sphereHealthInlineBlock:last-child/)
  assert.match(polish, /@media \(max-width: 699px\)/)
  assert.doesNotMatch(polish, /display:\s*none\s*!important|visibility:\s*hidden\s*!important/)
})

test('four selectable trends retain source timestamps and 24h dates', () => {
  const source = read('RundeckServerTrend.jsx')
  assert.match(source, /row-cols-1 row-cols-md-2 row-cols-xxl-4 g-2/)
  assert.match(source, /const dateLabel = new Intl\.DateTimeFormat/)
  assert.ok(source.includes("return dateLabel + '\\n' + clockLabel"))
  assert.ok(source.includes("if (range === '24h') return 4"))
  assert.match(source, /formatTrendPeakWib\(panelPeak\.timestamp\)/)
  assert.match(source, /No matching saved observation/)
})

test('compact review keeps evidence-backed counts and drilldowns', () => {
  const source = read('RundeckWorkloadHealth.jsx')
  assert.match(source, /Programs for Review/)
  assert.match(source, /saved performance review|Saved evaluation/)
  assert.match(source, /onReview\?\.\(level\.health\)/)
  assert.match(source, /onClick=\{\(\) => openWorkload\(row\)\}/)
})

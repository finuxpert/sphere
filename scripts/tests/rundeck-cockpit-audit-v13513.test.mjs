import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../../src/tools/components/' + path, import.meta.url), 'utf8')

test('selected APP retains SAP severity color; cyan is only a selection ring', () => {
  const css = read('RundeckCockpitHexV13512.css')
  assert.match(css, /\.rundeckAppHexSelector\.is-active::before\{/)
  assert.match(css, /\.rundeckAppHexSelector\.is-sap-critical\{/)
  assert.match(css, /\.rundeckAppHexSelector:is\(\.is-sap-attention,\.is-sap-warning\)/)
  assert.doesNotMatch(css, /\.rundeckAppHexSelector\.is-active\{\s*--hex-border/)
})

test('paginated Current table has no nested scrollbar, Review/Search remain untouched', () => {
  const css = read('RundeckCockpitHexV13512.css')
  assert.match(css, /\.rundeckJobsProgramsWorkspaceBody\.is-live \.rundeckCurrentWorkloadTableWrap\{[\s\S]*?overflow:visible!important/)
  assert.doesNotMatch(css, /\.rundeckJobsProgramsWorkspaceBody\.is-review \.rundeckReviewTableWrap/)
  const current = read('RundeckCurrentWorkload.jsx')
  assert.match(current, /workloadRowsThatFit\(/)
  assert.match(current, /reserveBelow: 44/)
  assert.match(current, /Showing \$\{currentPage \* pageSize \+ 1\}/)
})

test('host trends keep all metrics in accessible compact selectors', () => {
  const trend = read('RundeckServerTrend.jsx')
  assert.match(trend, /className="rundeckTrendMetricSelect" aria-label="Server Trend 1 metric"/)
  assert.match(trend, /className="rundeckTrendMetricSelect" aria-label="Server Trend 2 metric"/)
  assert.match(trend, /METRICS\.map\(\(\[key, label\]\) => <option/)
  assert.match(trend, /Host load average/)
  assert.match(trend, /APP host/)
})

test('live workload semantics and evidence population remain honest', () => {
  const current = read('RundeckCurrentWorkload.jsx')
  const health = read('RundeckWorkloadHealth.jsx')
  assert.match(current, /not APP host CPU/)
  assert.match(current, /PSS \(GB\)/)
  assert.match(current, /current observations/)
  assert.match(health, /validatedWorkloadDots\(first, following, 0, completePageSize\)/)
  assert.match(health, /onClick=\{\(\) => openWorkload\(row\)\}/)
  assert.match(health, /not SM37 status/)
})

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
  const modalCss = read('RundeckAppThreePanel.css')
  // The later modal CSS must not re-introduce overflow-x:auto, which also
  // computes overflow-y:visible as auto and creates a nested vertical scroller.
  assert.match(modalCss, /\.rundeckJobsProgramsWorkspaceBody\.is-live \.rundeckCurrentWorkloadTableWrap \{[\s\S]*?overflow: visible !important/)
  assert.match(modalCss, /\.rundeckJobsProgramsWorkspaceBody :is\(\.rundeckReviewTableWrapV1231\) \{[\s\S]*?overflow-x: auto !important/)
  assert.doesNotMatch(modalCss, /:is\(\.rundeckCurrentWorkloadTableWrap,\.rundeckReviewTableWrapV1231\)/)
  const current = read('RundeckCurrentWorkload.jsx')
  assert.match(current, /workloadRowsThatFit\(/)
  // Reserve the actual pager height: a hardcoded 44px clips pages on
  // shorter windows and when labels wrap.
  assert.match(current, /reserveBelow: workloadPagerReserve\(pagerRef\.current\?\.getBoundingClientRect\(\)\.height\)/)
  assert.match(current, /if \(pagerRef\.current\) resizeObserver\?\.observe\(pagerRef\.current\)/)
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
  assert.match(current, /coverageLabel/)
  assert.match(health, /validatedWorkloadDots\(first, following, 0, completePageSize\)/)
  assert.match(health, /onClick=\{\(\) => openWorkload\(row\)\}/)
  assert.match(health, /not SAP SM37 job status/)
  assert.match(health, /\$\{insufficient\} insufficient/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = name => readFileSync(new URL('../../src/tools/components/' + name, import.meta.url), 'utf8')
test('Network fits the Technical Trend controls with RX/TX and APP focus', () => {
  const src = read('RundeckServerTrend.jsx')
  assert.match(src, /\["network","Network"\]/)
  assert.match(src, /networkDirection === 'rx'/)
  assert.match(src, /networkDirection === 'tx'/)
  assert.match(src, /queriedMetric = metric === 'network' \? 'network_' \+ direction/)
  assert.match(src, /networkDirection, refreshToken, technicalMetric/)
  assert.match(src, /technicalNetwork \? 'Network ' \+ networkDirection\.toUpperCase\(\) \+ ' · Mbps'/)
  assert.match(src, /trend\.network_source/)
})
test('Network preserves NIC provenance, shows Mbps and avoids SAP timeline', () => {
  const src = read('RundeckServerTrend.jsx')
  assert.match(src, /peakInterface: row\.peak_interface/)
  assert.match(src, /sourceHost: row\.source_host/)
  assert.match(src, /if \(point\?\.network\) \{/)
  assert.match(src, /This is network throughput evidence/)
  assert.match(src, /highest-throughput single interface/)
  assert.match(src, /No saved Infrastructure network samples/)
  assert.match(src, /trend\?\.unit \? ' ' \+ trend\.unit/)
})

test('Network scale, freshness and independent gap keep original collection evidence', () => {
  const src = read('RundeckServerTrend.jsx')
  assert.match(src, /networkTrendScale\(technicalTrend\?\.items, mode\)/)
  assert.match(src, /networkScaleMode === 'full' \? 'full' : 'typical'/)
  assert.match(src, /Network Y ·/)
  assert.match(src, /Last Network Sample:/)
  assert.match(src, /InfrastructureGapBand trend=\{technicalTrend\}/)
  assert.match(src, /collection_gaps/)
  assert.match(src, /networkScale\.peakInterface/)
  assert.match(src, /typicalNetworkActive \? networkScale\.axisMax/)
})

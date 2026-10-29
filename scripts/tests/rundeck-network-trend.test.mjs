import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = name => readFileSync(new URL('../../src/tools/components/' + name, import.meta.url), 'utf8')
test('Network is selectable on all three independent charts with RX/TX and APP focus', () => {
  const src = read('RundeckServerTrend.jsx')
  assert.match(src, /\['network', 'Network'\]/)
  assert.match(src, /panel.direction === 'rx'/)
  assert.match(src, /panel.direction === 'tx'/)
  assert.match(src, /queriedMetric = metric === 'network' \? 'network_' \+ direction/)
  assert.match(src, /networkDirection, refreshToken, technicalMetric/)
  assert.match(src, /networkDirection1, refreshToken, serverMetric1/)
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
  assert.match(src, /networkScaleMode === 'typical' \? 'typical' : 'full'/)
  assert.match(src, /<option value="typical">Y: Typical<\/option>/)
  assert.match(src, /Last stored AOP Infrastructure Network observation/)
  assert.doesNotMatch(src, /InfrastructureGapBand/)
  assert.match(src, /gapPoints.map/)
  assert.match(src, /!trend\?\.network_source && !\['network_rx','network_tx'\]/)
  assert.match(src, /collection_gaps/)
  assert.match(src, /networkInfo\.peakInterface/)
  assert.match(src, /clippedNetwork \? networkInfo\.axisMax/)
})

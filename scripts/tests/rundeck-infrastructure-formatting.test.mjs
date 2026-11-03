import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { metric, formatTime, formatAxisTime, hasNumericSample } from '../../src/tools/components/rundeckInfrastructureFormatting.js'

const source = name => readFileSync(new URL('../../src/tools/components/' + name, import.meta.url), 'utf8')

test('numeric sample gate preserves missing, negative and nonfinite treatment', () => {
  for (const value of [null, undefined, '', '  ', -1, '-0.2', 'n/a', Number.POSITIVE_INFINITY]) {
    assert.equal(hasNumericSample(value), false, String(value))
  }
  for (const value of [0, '0', 0.1, '12.5', 100]) {
    assert.equal(hasNumericSample(value), true, String(value))
  }
})

test('infrastructure metric formatter preserves saved numeric display', () => {
  assert.equal(metric(null, ' GB'), '—')
  assert.equal(metric(undefined, '%'), '—')
  assert.equal(metric('', '%'), '—')
  assert.equal(metric(0, '%'), '0%')
  assert.equal(metric(2048.58, ' MB'), '2,048.6 MB')
})

test('WIB chart and timestamp labels keep previous scope and missing semantics', () => {
  assert.equal(formatTime(null), '—')
  assert.equal(formatAxisTime(null, '6h'), '—')
  const noonWib = '2026-11-03T05:00:00Z'
  assert.match(formatTime(noonWib), /12:00/)
  assert.match(formatAxisTime(noonWib, '1h'), /12:00/)
  assert.match(formatAxisTime(noonWib, '6h'), /12:00/)
  assert.match(formatAxisTime(noonWib, '24h'), /12:00/)
  assert.notEqual(formatAxisTime(noonWib, '7d'), '—')
})

test('chart extraction keeps retained-gap segmentation, SVG thresholds and mounting', () => {
  const ui = source('RundeckInfrastructure.jsx')
  const trend = source('RundeckInfrastructureTrend.jsx')
  assert.match(ui, /import SparkChart from '.\/RundeckInfrastructureTrend.jsx'/)
  assert.match(ui, /<SparkChart items=\{trend\}/)
  assert.doesNotMatch(ui, /function SparkChart\(/)
  assert.match(trend, /const maxGap=Math.max\(15\*60\*1000,typicalGap\*3\)/)
  assert.match(trend, /segments\.map\(/)
  assert.match(trend, /OPERATOR_THRESHOLDS\.filesystem\.warning/)
  assert.match(trend, /OPERATOR_THRESHOLDS\.filesystem\.critical/)
  assert.match(trend, /aria-label="Infrastructure trend"/)
})

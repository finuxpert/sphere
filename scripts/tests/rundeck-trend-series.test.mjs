import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHostTrendSeries } from '../../src/tools/components/rundeckTrendSeries.js'
import { gapTimeRangeText, gapDurationText, gapLabel, resolvedGapIntervalMs, numericTrendSample, formatSavedBucketWindow, trendAxisSplitNumber, formatTrendAxis } from '../../src/tools/components/rundeckTrendFormatting.js'

const stamp = minutes => new Date(Date.UTC(2026,9,13,0,minutes)).toISOString()
const point = (minutes, value) => ({ value: [stamp(minutes), value] })

test('APP-specific missing bucket separates its line without inventing zero', () => {
  const app1 = [point(0,12),point(10,15),point(30,18)]
  const result = buildHostTrendSeries(app1,600000)
  assert.equal(result.length,4)
  assert.deepEqual(result[2].value,[Date.parse(stamp(20)),null])
  assert.equal(result[2].appGap,true)
  assert.equal(app1.length,3)
})
test('other APP presence does not fill a missing APP bucket', () => {
  const app2 = [point(0,11),point(10,14),point(20,16),point(30,18)]
  const app1 = [point(0,12),point(30,19)]
  assert.equal(buildHostTrendSeries(app2,600000).length,4)
  assert.equal(buildHostTrendSeries(app1,600000).filter(p=>p.gap).length,1)
})
test('retained null and overall collection gap remain null', () => {
  const missing = { value:[Date.parse(stamp(20)),null],gap:true }
  const result = buildHostTrendSeries([point(0,11),point(10,null)],600000,[missing])
  assert.ok(result.some(p=>p.gap && p.value[1]===null))
  assert.equal(result.filter(p=>p.value[1]===0).length,0)
})
test('gap labels carry start and end dates with WIB, including same-day intervals', () => {
  const from = Date.parse('2026-10-13T00:00:00Z')
  const to = Date.parse('2026-10-13T00:30:00Z')
  const label = gapTimeRangeText(from, to)
  assert.match(label, /^.+ - .+ WIB$/)
  assert.equal((label.match(/13 /g) || []).length, 2)
  assert.match(gapLabel(from, to), /^COLLECTION GAP - /)
  assert.ok(gapLabel(from, to).includes(label))
  assert.equal(gapDurationText(from, to), '30m')
  assert.equal(gapDurationText(from, from + 90 * 60_000), '1h 30m')
  assert.equal(gapTimeRangeText(Number.NaN, to), '—')
})

test('bucket interval precedence and numeric null semantics stay unchanged', () => {
  assert.equal(resolvedGapIntervalMs({bucket_interval_seconds: 120, bucket: '1h'}), 120_000)
  assert.equal(resolvedGapIntervalMs({bucket: '30m'}), 1_800_000)
  assert.equal(resolvedGapIntervalMs({bucket: 'unknown', collection_cadence_seconds: 900}), 900_000)
  assert.equal(resolvedGapIntervalMs({bucket: 'unknown', collection_cadence_seconds: 'invalid'}), 600_000)
  assert.equal(numericTrendSample(null), null)
  assert.equal(numericTrendSample(''), null)
  assert.equal(numericTrendSample('invalid'), null)
  assert.equal(numericTrendSample('0'), 0)
})

test('display formatting leaves missing and invalid timestamps explicit', () => {
  assert.equal(formatSavedBucketWindow({}, 'invalid'), 'Bucket unavailable')
  assert.match(formatSavedBucketWindow({ bucket: '30m' }, '2026-10-13T00:00:00Z'), /^Bucket .+ WIB$/)
  assert.equal(formatTrendAxis('invalid', '24h'), '')
  assert.equal(trendAxisSplitNumber('24h'), 4)
  assert.equal(trendAxisSplitNumber('30d'), 6)
})

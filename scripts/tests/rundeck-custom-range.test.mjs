import test from 'node:test'
import assert from 'node:assert/strict'
import { wibMinuteInput, validateCustomRange, initialCustomRangeInputs, customBucketForDuration, customRangeSearch, customRangeCaption } from '../../src/tools/components/rundeckCustomRange.js'
import { readFileSync } from 'node:fs'

test('WIB minute picker ignores the browser timezone', () => {
  assert.equal(wibMinuteInput(new Date('2026-10-15T05:49:00Z')), '2026-10-15T12:49')
})

test('12:49 through 12:52 WIB includes selected end minute but no next-minute samples', () => {
  const result = validateCustomRange('2026-10-15T12:49','2026-10-15T12:52',Date.parse('2026-10-15T09:00:00Z'))
  assert.equal(result.error,undefined)
  assert.equal(result.from_at,'2026-10-15T05:49:00.000Z')
  assert.equal(result.to_at,'2026-10-15T05:53:00.000Z')
  assert.equal(new URLSearchParams(customRangeSearch(result)).get('to_at'),result.to_at)
  assert.match(customRangeCaption(result),/12:49 – 12:52 WIB/)
})

test('custom range rejects future, invalid, reversed, too long and too old windows', () => {
  const now=Date.parse('2026-10-15T09:00:00Z')
  const cases=[
    ['2026-10-15T12:52','2026-10-15T12:49'],
    ['2026-04-15T12:49','2026-10-15T12:52'],
    ['2026-01-01T12:49','2026-01-01T12:52'],
    ['2026-10-15T12:49','2026-10-15T20:52'],
    ['2026-02-30T12:49','2026-02-30T12:52'],
  ]
  for(const [from,to] of cases)assert.ok(validateCustomRange(from,to,now).error,from+' '+to)
})

test('custom 180-day window and preset-prefilled dates retain inclusive WIB minute semantics', () => {
  const now=Date.parse('2026-10-15T09:00:00Z')
  const thirtyDays=initialCustomRangeInputs('30d',null,now)
  const validated=validateCustomRange(thirtyDays.start,thirtyDays.end,now)
  assert.equal(validated.error,undefined)
  assert.equal(validated.bucket,'6h')
  assert.equal(Date.parse(validated.to_at)-Date.parse(validated.from_at),30*24*60*60*1000)
  assert.equal(initialCustomRangeInputs('custom',validated,now).start,thirtyDays.start)
  const lastMonth=initialCustomRangeInputs('last_month',null,now)
  assert.equal(lastMonth.start,'2026-09-01T00:00')
  assert.equal(lastMonth.end,'2026-09-30T23:59')
  const sixMonths=initialCustomRangeInputs('180d',null,now)
  const sixValidated=validateCustomRange(sixMonths.start,sixMonths.end,now)
  assert.equal(sixValidated.error,undefined)
  assert.equal(sixValidated.bucket,'1d')
  assert.equal(customBucketForDuration(24*60*60*1000),'raw')
  assert.equal(customBucketForDuration(7*24*60*60*1000),'1h')
})

test('custom API window and UI are wired without defaulting to latest collection', () => {
  const trend=readFileSync(new URL('../../src/tools/components/RundeckServerTrend.jsx',import.meta.url),'utf8')
  const modal=readFileSync(new URL('../../src/tools/components/RundeckCustomWindowDetails.jsx',import.meta.url),'utf8')
  const dialog=readFileSync(new URL('../../src/tools/components/RundeckCustomRangeDialog.jsx',import.meta.url),'utf8')
  assert.match(trend,/customRangeSearch\(customWindow\)/)
  assert.match(trend,/history\/window/)
  assert.match(trend,/onApply=\{applyCustom\}/)
  assert.match(dialog,/onSubmit=\{onApply\}/)
  assert.match(dialog,/new range not applied/)
  assert.match(dialog,/aria-modal="true"/)
  assert.match(dialog,/disabled=\{Boolean\(inputError\)\}/)
  assert.match(trend,/initialCustomRangeInputs\(range, customWindow\)/)
  assert.doesNotMatch(trend,/className="rundeckCustomRangeForm"/)
  assert.match(trend,/Custom<\/button>/)
  assert.match(modal,/No stored APP samples/)
  assert.match(modal,/SM37/)
})

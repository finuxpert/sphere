import test from 'node:test'
import assert from 'node:assert/strict'
import { wibMinuteInput, validateCustomRange, customRangeSearch, customRangeCaption } from '../../src/tools/components/rundeckCustomRange.js'
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
    ['2026-10-15T12:49','2026-10-17T12:52'],
    ['2026-01-01T12:49','2026-01-01T12:52'],
    ['2026-10-15T12:49','2026-10-15T20:52'],
    ['2026-02-30T12:49','2026-02-30T12:52'],
  ]
  for(const [from,to] of cases)assert.ok(validateCustomRange(from,to,now).error,from+' '+to)
})

test('custom API window and UI are wired without defaulting to latest collection', () => {
  const trend=readFileSync(new URL('../../src/tools/components/RundeckServerTrend.jsx',import.meta.url),'utf8')
  const modal=readFileSync(new URL('../../src/tools/components/RundeckCustomWindowDetails.jsx',import.meta.url),'utf8')
  assert.match(trend,/customRangeSearch\(customWindow\)/)
  assert.match(trend,/history\/window/)
  assert.match(trend,/onSubmit=\{applyCustom\}/)
  assert.match(trend,/Custom<\/button>/)
  assert.match(modal,/No stored APP samples/)
  assert.match(modal,/SM37/)
})

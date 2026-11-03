import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { monthOptions, weekOptions, customDateError, customDayCount } from '../../src/tools/components/rundeckMonthlyPeriod.js'

test('month selector retains seven reverse-chronological UTC month values and WIB ongoing label', () => {
  const rows = monthOptions()
  assert.equal(rows.length, 7)
  assert.match(rows[0].label, / · ongoing$/)
  assert.equal(rows.filter(row => row.label.includes(' · ongoing')).length, 1)
  for (const [index, row] of rows.entries()) {
    assert.match(row.value, /^20\\d{2}-\\d{2}$/)
    if (index) {
      const [year, month] = rows[index - 1].value.split('-').map(Number)
      assert.equal(row.value, new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7))
    }
  }
})

test('week selector retains 26 Monday-start seven-day UTC windows', () => {
  const rows = weekOptions()
  assert.equal(rows.length, 26)
  assert.match(rows[0].label, / · ongoing$/)
  assert.equal(rows.filter(row => row.label.includes(' · ongoing')).length, 1)
  for (const [index, row] of rows.entries()) {
    assert.equal(new Date(row.value + 'T00:00:00Z').getUTCDay(), 1)
    if (index) {
      assert.equal(Date.parse(rows[index - 1].value + 'T00:00:00Z') - Date.parse(row.value + 'T00:00:00Z'), 7 * 86400000)
    }
  }
})

test('custom date validation preserves WIB future gate, 31-day limit and date ordering', () => {
  const todayWib = '2026-11-03'
  assert.equal(customDateError('2026-10-04', '2026-11-03', todayWib), '')
  assert.equal(customDayCount('2026-10-04', '2026-11-03'), 31)
  assert.equal(customDateError('2026-10-03', '2026-11-03', todayWib), 'Maximum custom period is 31 days')
  assert.equal(customDateError('2026-11-03', '2026-11-02', todayWib), 'End date must not precede start date')
  assert.equal(customDateError('2026-11-04', '2026-11-04', todayWib), 'Future dates are unavailable')
  assert.equal(customDateError('2026-02-30', '2026-03-01', todayWib), 'Select start and end dates')
  assert.equal(customDateError('', '2026-10-31', todayWib), 'Select start and end dates')
  assert.equal(customDayCount('2026-02-28', '2026-03-01'), 2)
  assert.equal(customDayCount('2024-02-28', '2024-03-01'), 3)
})

test('monthly UI keeps the existing closed-over WIB date and all period inputs', () => {
  const ui = readFileSync(new URL('../../src/tools/components/RundeckMonthlyReview.jsx', import.meta.url), 'utf8')
  assert.match(ui, /const MONTHS = monthOptions\\(\\)/)
  assert.match(ui, /const WEEKS = weekOptions\\(\\)/)
  assert.match(ui, /validateCustomDate\\(start,end,TODAY_WIB\\)/)
  assert.match(ui, /customDateError\\(draftStart,draftEnd\\)/)
  assert.match(ui, /customDayCount\\(customStart,customEnd\\)/)
  assert.match(ui, /max=\\{TODAY_WIB\\}/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

test('monthly workload API is additive; existing rolling review remains unchanged', () => {
  const api = read('backend/rundeck_api_core.py')
  const monthly = api.slice(api.indexOf('@app.get("/evaluation/workloads/monthly")'))
  assert.match(api, /period: str = Query\("1d", pattern="\^\(1d\|7d\|30d\)\$"\)/)
  assert.match(api, /@app.get\("\/evaluation\/workloads\/monthly"\)/)
  assert.match(monthly, /pressure: str = Query\("ALL", pattern="\^\(ALL\|CPU\|RAM\|WP\)\$"\)/)
  const evalSource = read('backend/rundeck_evaluation.py')
  assert.match(evalSource, /anchor_key = end\.isoformat\(\)/)
  assert.match(evalSource, /cache_key = \(period_key, type_key, anchor_key\)/)
  assert.match(evalSource, /_calendar_month_collection_anchor\(conn, start, end\)/)
})

test('monthly pressure queries remain complete-collection and APP-specific', () => {
  const pressure = read('backend/rundeck_monthly_pressure.py')
  assert.match(pressure, /hm\.collection_id = tc\.collection_id AND hm\.host = tc\.host/)
  assert.match(pressure, /COALESCE\(c\.finished_at, c\.started_at\) >= :start/)
  assert.match(pressure, /COALESCE\(c\.finished_at, c\.started_at\) < :end/)
  assert.match(pressure, /ram_pct/)
  assert.match(pressure, /cpu_pct/)
  assert.match(pressure, /detect_pressure_episodes/)
  assert.match(pressure, /"daily_hosts": daily_hosts/)
})

test('manual assessment removed; monthly report keeps historical CPU RAM WP and evidence selection', () => {
  const ui = read('src/tools/components/RundeckMonthlyReview.jsx')
  assert.doesNotMatch(ui, /Basis Assessment|Not assessed|Reviewed by|Manual SAP Basis Assessment/)
  for (const term of ['CPU Pressure', 'RAM Pressure', 'Critical WP', 'Performance Impact', 'Report']) assert.ok(ui.includes(term), term)
  assert.match(ui, /buildMonthlyPdf/)
  assert.match(ui, /pressure:pressureFilter/)
  assert.match(ui, /URL\.revokeObjectURL/)
  const pdf = read('src/tools/components/rundeckMonthlyPdf.js')
  assert.match(pdf, /orientation: 'landscape'/)
  assert.match(pdf, /branding\/logo\/sphere-logo-navbar-dark\.png/)
  assert.match(pdf, /JOB \/ PROGRAM SAAT RAM TINGGI/)
  assert.match(pdf, /JOB \/ PROGRAM SAAT CPU TINGGI/)
  assert.match(pdf, /splitTextToSize/)
  assert.doesNotMatch(pdf, /Not assessed|Manual Basis Assessment/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildHostTrendSeries } from '../../src/tools/components/rundeckTrendSeries.js'

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
test('gap labels must carry calendar dates even for a same-day interval', () => {
  const source=readFileSync(new URL('../../src/tools/components/RundeckServerTrend.jsx',import.meta.url),'utf8')
  assert.match(source,/return \`\$\{startDate\} \$\{startTime\} - \$\{endDate\} \$\{endTime\} WIB\`/)
  assert.match(source,/buildHostTrendSeries\(/)
})

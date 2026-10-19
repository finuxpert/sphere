import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { retainedVortexSamples, savedVortexPeak, vortexAppLabel, unifiedVortexOrigin, vortexDestination } from '../../src/tools/components/rundeckTrendAmbient.js'

test('unified vortex only uses exact retained numeric ECharts samples', () => {
  const inputs=[{ name:'APP1',data:[
    {value:['2026-10-19T01:00:00Z',0]},
    {value:['2026-10-19T01:10:00Z',null],gap:true},
    {value:['2026-10-19T01:20:00Z',null]},
    {value:['2026-10-19T01:30:00Z',83]},
  ]},{name:'APP2',data:[{value:['2026-10-19T01:00:00Z',45]},{value:['2026-10-19T01:10:00Z',48]}]}]
  const result=retainedVortexSamples(inputs,48)
  assert.deepEqual(result.flatMap(series=>series.values.map(item=>item[1])),[0,83,45,48])
  assert.deepEqual(retainedVortexSamples(null),[])
  assert.deepEqual(retainedVortexSamples([]),[])
  assert.ok(retainedVortexSamples([{data:Array.from({length:200},(_,i)=>({value:[i,i]}))}],36)[0].values.length<=36)
})


test('unified vortex disconnects traces at every explicit or APP-specific gap', () => {
  const data = [{ name: 'APP1', data: [
    { value: [1000, 0] }, { value: [2000, 12] },
    { value: [3000, null], gap: true, appGap: true },
    { value: [4000, 40] }, { value: [5000, 45] },
    { value: [6000, null], gap: true },
    { value: [7000, 55] },
  ] }]
  const rows = retainedVortexSamples(data, 48)
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0].segments.map(part => part.map(item => item.value[0])),
    [[1000, 2000], [4000, 5000], [7000]])
  assert.equal(rows[0].segments[0][0].value[1], 0)
  assert.ok(rows[0].segments[1][0].t > rows[0].segments[0][1].t)
  assert.ok(rows[0].segments.every(part => part.length <= 48))
})

test('idle peak summaries use saved buckets, not fabricated current host state', () => {
  assert.deepEqual(savedVortexPeak({ unit: '%', items: [
    { bucket: '2026-10-17T04:00:00Z', max_value: 0, avg_value: 0 },
    { bucket: '2026-10-17T05:00:00Z', max_value: 76, avg_value: 18 },
    { bucket: '2026-10-17T06:00:00Z', max_value: null, avg_value: null },
  ] }, 'max'), { value: 76, bucket: '2026-10-17T05:00:00Z', unit: '%', host: '' })
  assert.equal(savedVortexPeak({ items: [{ max_value: null }] }), null)
  assert.equal(savedVortexPeak({ items: [] }), null)
  assert.equal(savedVortexPeak({ items: [{ max_value: 0, bucket: 'abc' }] }).value, 0)
})

test('vortex interpolation preserves destinations and never adjusts chart values',()=>{
  const point={originX:200,originY:100,destX:83,destY:52}
  assert.deepEqual(vortexDestination(point,0),{x:200,y:100})
  assert.deepEqual(vortexDestination(point,1),{x:83,y:52})
  assert.deepEqual(vortexDestination(point,.5),{x:141.5,y:76})
})

test('idle braid uses three interlaced ribbons within one horizontal field',()=>{
  const width=1320,height=200
  const times=Array.from({length:41},(_,i)=>i/40)
  const points=times.flatMap(t=>Array.from({length:3},(_,metric)=>
    unifiedVortexOrigin({width,height,t,metric,host:2,phase:.18})))
  assert.ok(Math.min(...points.map(point=>point.x)) > width*.20)
  assert.ok(Math.max(...points.map(point=>point.x)) < width*.80)
  assert.ok(Math.max(...points.map(point=>point.x))-Math.min(...points.map(point=>point.x)) > width*.48)
  assert.ok(points.every(point=>point.y>height*.38&&point.y<height*.94))
  assert.equal(new Set(Array.from({length:3},(_,metric)=>
    Math.round(unifiedVortexOrigin({width,height,t:.28,metric,host:2,phase:.18}).y))).size,3)
})

test('single shared grid motion keeps original ECharts tools, statuses and source provenance',()=>{
  const read=file=>readFileSync(new URL('../../src/tools/components/'+file,import.meta.url),'utf8')
  const trend=read('RundeckServerTrend.jsx')
  const layer=read('rundeckTrendAmbient.js')
  const css=read('RundeckTrendAmbient.css')
  assert.match(trend,/chart\.on\('click', exactClick\)/)
  assert.match(trend,/chart\.getZr\(\)\.on\('click', fallbackClick\)/)
  assert.match(trend,/attachUnifiedVortex\(/)
  assert.match(trend,/className="rundeckUnifiedVortexCanvas"/)
  assert.doesNotMatch(trend,/attachTrendAmbient\(/)
  assert.doesNotMatch(trend,/rundeckTrendAmbientCanvas/)
  assert.match(css,/\.rundeckTripleTrendGrid\.is-unified-vortex/)
  assert.match(css,/pointer-events:none!important/)
  assert.match(css,/prefers-reduced-motion/)
  assert.match(layer,/IntersectionObserver/)
  assert.match(layer,/ResizeObserver/)
  assert.match(layer,/max-width:1280px/)
  assert.match(layer,/convertToPixel/)
  assert.match(layer,/vortexReady/)
  assert.match(css,/data-vortex-ready="true"/)
  assert.match(css,/\.is-unified-vortex\[data-vortex-ready="true"\]::before/)
  assert.match(css,/\.is-expanded::before/)
  assert.match(trend,/rundeckUnifiedVortexCore/)
  assert.match(trend,/rundeckUnifiedVortexLabels/)
  assert.match(trend,/savedVortexPeak\(/)
  assert.match(trend,/Highest bucket avg/)
  assert.match(trend,/activeFocus \|\| item\.peak\.host/)
  assert.match(layer,/row\.segments\.forEach/)
  assert.match(layer,/if\(placed\.length>1\)/)
  assert.match(layer,/ctx\.quadraticCurveTo/)
  assert.match(layer,/vortexReady = 'false'/)
  assert.match(css,/\(hover:none\)/)
  assert.match(trend,/!event\.currentTarget\.contains\(document\.activeElement\)/)
  assert.match(trend,/technicalMetric === 'load' \? 'Host Load'/)
  assert.match(trend,/Linux load avg · not %/)
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/)
  assert.match(css,/min-width:1281px/)
  assert.match(layer,/max-width:1280px/)
  assert.match(css,/z-index:3/)
  assert.match(css,/pointer-events:none!important/)
  assert.match(layer,/datazoom/)
  assert.doesNotMatch(layer,/fetch\(/)
})

test('cockpit finishing reserves pager and expands APP spacing without modifying SAP status',()=>{
  const read = name => readFileSync(new URL('../../src/tools/components/' + name, import.meta.url), 'utf8')
  const pager = read('RundeckCurrentWorkload.jsx')
  const orbit = read('RundeckUnifiedAppInfrastructure.jsx')
  const motion = read('RundeckSphereMotion.css')
  const css = read('RundeckTrendAmbient.css')
  assert.match(pager, /reserveBelow: workloadPagerReserve\(pagerRef\.current\?\.getBoundingClientRect\(\)\.height\)/)
  assert.match(pager, /resizeObserver\?\.observe\(trendPanel\)/)
  assert.match(pager, /window\.visualViewport\?\.addEventListener\('resize'/)
  assert.match(orbit, /const rx = Math\.min\(width \* \.35, 118\)/)
  assert.match(orbit, /const ry = Math\.min\(height \* \.34, 40\)/)
  assert.match(orbit, /openAppAnalysis\(host\)/)
  assert.match(motion, /\.rundeckAppMotionRings span/)
  assert.match(css, /font-variant-numeric:tabular-nums/)
  assert.match(read('RundeckServerTrend.jsx'), /Highest bucket avg/)
})

test('motion refinements preserve lint-safe hooks and non-blocking graph interactions', () => {
  const read = name => readFileSync(new URL('../../src/tools/components/' + name, import.meta.url), 'utf8')
  const globe = read('RundeckEvaluationGlobe.jsx')
  const ambient = read('rundeckTrendAmbient.js')
  const orbit = read('RundeckUnifiedAppInfrastructure.jsx')
  const styles = read('RundeckSphereMotion.css')
  assert.match(globe, /const \{ columns, size, gap, fits \} = layout/)
  assert.match(globe, /\[levels, size, gap, columns, fits\]/)
  assert.doesNotMatch(globe, /\[levels, layout\.size/)
  assert.match(ambient, /const target=expandedRef\?\.current\?1:0/)
  assert.doesNotMatch(ambient, /Boolean\(expandedRef\?\.current\)/)
  assert.match(ambient, /morph\*morph\*morph/)
  assert.match(orbit, /openAppAnalysis\(host\)/)
  assert.match(styles, /prefers-reduced-motion:reduce/)
})

test('APP Focus constrains historical peaks; Avg is the highest bucket average', () => {
  const trend = { unit: '%', items: [
    { host: 'AOPH1PAPPDC', bucket: '2026-10-18T00:00:00Z', max_value: 97, avg_value: 55 },
    { host: 'AOPH3PAPPDC', bucket: '2026-10-18T01:00:00Z', max_value: 21, avg_value: 16 },
    { host: 'AOPH3PAPPDC', bucket: '2026-10-18T02:00:00Z', max_value: 70, avg_value: 45 },
    { host: 'APP4', bucket: '2026-10-18T03:00:00Z', max_value: 81, avg_value: 60 },
    { host: '', bucket: '2026-10-18T04:00:00Z', max_value: 120, avg_value: 75 },
  ] }
  assert.equal(vortexAppLabel('AOPH3PAPPDC'), 'APP3')
  assert.equal(vortexAppLabel('APP3'), 'APP3')
  assert.equal(savedVortexPeak(trend, 'max', 'APP3')?.value, 70)
  assert.equal(savedVortexPeak(trend, 'avg', 'AOPH3PAPPDC')?.value, 45)
  assert.equal(savedVortexPeak(trend, 'avg', 'APP2'), null)
  assert.equal(savedVortexPeak(trend, 'max', 'APP4')?.host, 'APP4')
  assert.equal(savedVortexPeak(trend, 'max')?.value, 120)
  assert.equal(savedVortexPeak(trend, 'avg', 'UNVERIFIED'), null)
})

test('many collection gaps retain first and last historical segments without connectors', () => {
  const items = []
  for (let i = 0; i < 95; i++) {
    items.push({ value: [i * 2000, i] })
    items.push({ value: [i * 2000 + 1000, null], gap: true })
  }
  const result = retainedVortexSamples([{ name: 'APP3', data: items }], 26)[0]
  assert.equal(result.segments.length, 26)
  assert.equal(result.values.length, 26)
  assert.equal(result.segments[0][0].value[0], 0)
  assert.equal(result.segments.at(-1)[0].value[0], 94 * 2000)
  assert.ok(result.segments[12][0].t > .30 && result.segments[12][0].t < .70)
  assert.ok(result.segments.every(part => part.length === 1))
})

test('restrained vortex motion keeps real ECharts and asymmetric hover return', () => {
  const read = file => readFileSync(new URL('../../src/tools/components/' + file, import.meta.url), 'utf8')
  const motion = read('rundeckTrendAmbient.js')
  const style = read('RundeckTrendAmbient.css')
  assert.match(motion, /target\?7\.2:3\.6/)
  assert.match(motion, /const stride=p>\.95\?4:3/)
  assert.match(style, /transition-duration:\.36s/)
  assert.match(style, /prefers-reduced-motion:reduce/)
  assert.doesNotMatch(motion, /fetch\(/)
})

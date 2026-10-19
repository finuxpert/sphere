import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { retainedVortexSamples, savedVortexPeak, unifiedVortexOrigin, vortexDestination } from '../../src/tools/components/rundeckTrendAmbient.js'

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
  ] }, 'max'), { value: 76, bucket: '2026-10-17T05:00:00Z', unit: '%' })
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

test('idle vortex is centered and leaves a header lane for all three trends',()=>{
  const width=1320,height=200
  const points=Array.from({length:3},(_,metric)=>
    Array.from({length:5},(_,host)=>
      unifiedVortexOrigin({width,height,t:1,metric,host,phase:.18}))).flat()
  assert.ok(Math.min(...points.map(point=>point.x)) > width*.20)
  assert.ok(Math.max(...points.map(point=>point.x)) < width*.80)
  assert.ok(Math.max(...points.map(point=>point.x))-Math.min(...points.map(point=>point.x)) > width*.40)
  assert.ok(points.every(point=>point.y>height*.35&&point.y<height*.93))
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
  assert.match(trend,/Saved peak · bucket/)
  assert.match(layer,/row\.segments\.forEach/)
  assert.match(layer,/if\(placed\.length>1\)/)
  assert.match(trend,/technicalMetric === 'load' \? 'Host Load'/)
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
  assert.match(pager, /reserveBelow: 90/)
  assert.match(pager, /resizeObserver\?\.observe\(trendPanel\)/)
  assert.match(pager, /window\.visualViewport\?\.addEventListener\('resize'/)
  assert.match(orbit, /const rx = Math\.min\(width \* \.35, 118\)/)
  assert.match(orbit, /const ry = Math\.min\(height \* \.34, 40\)/)
  assert.match(orbit, /openAppAnalysis\(host\)/)
  assert.match(motion, /\.rundeckAppMotionRings span/)
  assert.match(css, /font-variant-numeric:tabular-nums/)
  assert.match(read('RundeckServerTrend.jsx'), /Saved peak · bucket/)
})

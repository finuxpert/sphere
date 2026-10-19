import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { retainedVortexSamples, vortexDestination } from '../../src/tools/components/rundeckTrendAmbient.js'

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

test('vortex interpolation preserves destinations and never adjusts chart values',()=>{
  const point={originX:200,originY:100,destX:83,destY:52}
  assert.deepEqual(vortexDestination(point,0),{x:200,y:100})
  assert.deepEqual(vortexDestination(point,1),{x:83,y:52})
  assert.deepEqual(vortexDestination(point,.5),{x:141.5,y:76})
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
  assert.match(layer,/max-width:899px/)
  assert.match(layer,/convertToPixel/)
  assert.match(layer,/datazoom/)
  assert.doesNotMatch(layer,/fetch\(/)
})

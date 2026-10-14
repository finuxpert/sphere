import test from 'node:test'
import assert from 'node:assert/strict'
import { technicalLoadScale } from '../../src/tools/components/rundeckTechnicalLoadScale.js'

test('Technical Load Full evidence keeps the true saved outlier and exact peak time',()=>{
  const rows=Array.from({length:100},(_,i)=>({
    host:'AOPH1PAPPDC',bucket:`2026-10-14T10:${String(i%60).padStart(2,'0')}:00Z`,
    peak_at:`2026-10-14T10:${String(i%60).padStart(2,'0')}:20Z`,max_value:2+i%7,avg_value:1+i%4
  }))
  rows[53]={...rows[53],host:'AOPH3PAPPDC',max_value:90,peak_at:'2026-10-14T11:23:14Z'}
  const unchanged=JSON.parse(JSON.stringify(rows))
  const focus=technicalLoadScale(rows,'max')
  assert.ok(focus.axisMax<90)
  assert.equal(focus.peak,90)
  assert.equal(focus.peakAt,'2026-10-14T11:23:14Z')
  assert.equal(focus.peakHost,'AOPH3PAPPDC')
  assert.ok(focus.outliers>=1)
  assert.deepEqual(rows,unchanged)
})
test('Technical Load ordinary samples require no artificial zoom',()=>{
  const rows=Array.from({length:60},(_,i)=>({bucket:String(i),max_value:10+i%3}))
  const result=technicalLoadScale(rows,'max')
  assert.equal(result.axisMax,null)
  assert.equal(result.outliers,0)
  assert.equal(result.peak,12)
})
test('Technical Load respects selected Avg/Peak evidence and fails safely for missing samples',()=>{
  const rows=Array.from({length:30},(_,i)=>({avg_value:1+i%2,max_value:i===17?70:4,host:'APP2',bucket:String(i)}))
  assert.equal(technicalLoadScale(rows,'avg').peak,2)
  assert.equal(technicalLoadScale(rows,'max').peak,70)
  assert.deepEqual(technicalLoadScale([], 'max'),{axisMax:null,peak:null,peakHost:'',peakAt:'',outliers:0})
  assert.equal(technicalLoadScale([{max_value:null},{max_value:''},{max_value:'n/a'}]).peak,null)
})

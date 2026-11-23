import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read=(name,extension='css')=>readFileSync(
  new URL('../../src/tools/components/'+name+'.'+extension,import.meta.url),'utf8')

// Locks the original source order byte-for-byte. CSS refactoring must never
// silently erase rules, alter specificity, re-order media queries or break
// theme/focus/print coverage to make a shorter stylesheet.
const fnv32=source=>{
  let value=2166136261
  for(let i=0;i<source.length;i++){
    value^=source.charCodeAt(i)
    value=Math.imul(value,16777619)>>>0
  }
  return value.toString(16).padStart(8,'0')
}

test('Reports CSS foundation and review concatenate to original pre-refactor CSS',()=>{
  const concat=read('RundeckMonthlyCore')+read('RundeckMonthlyReview')
  assert.equal(concat.length,27019)
  assert.equal(fnv32(concat),'8d6fa7fa')
})

test('Reports enterprise theme and management concatenate to original pre-refactor CSS',()=>{
  const concat=read('RundeckMonthlyFinal20261030')+read('RundeckMonthlyManagement')
  assert.equal(concat.length,21485)
  assert.equal(fnv32(concat),'21e7e2bf')
})

test('Reports stylesheet injection preserves all four original cascade sections',()=>{
  const source=read('RundeckMonthlyReview','jsx')
  const files=[
    'RundeckMonthlyCore.css',
    'RundeckMonthlyReview.css',
    'RundeckMonthlyFinal20261030.css',
    'RundeckMonthlyManagement.css',
  ]
  const locations=files.map(file=>source.indexOf("import './"+file+"'"))
  for(let i=0;i<locations.length;i++){
    assert.ok(locations[i]>=0,'Missing stylesheet import: '+files[i])
    if(i)assert.ok(locations[i]>locations[i-1],'CSS cascade order changed: '+files[i])
  }
  assert.equal((source.match(/import '\.\/RundeckMonthly[^']+\.css'/g)||[]).length,files.length)
})

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

test('Reports CSS bundles preserve the two original Vite chunk boundaries and source order',()=>{
  const source=read('RundeckMonthlyReview','jsx')
  const base=read('RundeckMonthlyStyleBundle')
  const enterprise=read('RundeckMonthlyEnterpriseStyleBundle')
  const baseImport="import './RundeckMonthlyStyleBundle.css'"
  const enterpriseImport="import './RundeckMonthlyEnterpriseStyleBundle.css'"
  const a=source.indexOf(baseImport)
  const b=source.indexOf(enterpriseImport)
  const c=source.indexOf("import './RundeckUnifiedExperience20261030.css'")
  assert.ok(a>=0 && b>a && c>b,'Report CSS entry order must remain original')
  assert.match(base,/@import '\.\/RundeckMonthlyCore\.css';[\s\S]*@import '\.\/RundeckMonthlyReview\.css';/)
  assert.match(enterprise,/@import '\.\/RundeckMonthlyFinal20261030\.css';[\s\S]*@import '\.\/RundeckMonthlyManagement\.css';/)
  assert.equal((source.match(/import '\.\/RundeckMonthly[^']+\.css'/g)||[]).length,2)
})

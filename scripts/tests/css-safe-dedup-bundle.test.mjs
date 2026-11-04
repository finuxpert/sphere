import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {duplicateDeclarations} from '../css-duplicate-declarations.mjs'
import {assessBundleSizes,BUNDLE_BUDGETS} from '../qa-bundle-budget.mjs'

const cssFiles=[
  'RundeckMonitoringHistory.css',
  'RundeckSource.css',
  'RundeckMockupParity.css',
  'RundeckSixChartMonitoring.css',
  'RundeckJobHistory.css',
  'RundeckCockpitHexV13512.css',
]

test('exact adjacent CSS duplicates are identified but distinct cascade overrides are left intact',()=>{
  const source='.x{height:70px!important;height:70px!important;color:red;color:blue}' +
    '@media(min-width:800px){.x{height:70px!important;height:60px!important}}'
  assert.deepEqual(duplicateDeclarations(source).map(row=>row.property),['height'])
  assert.equal(duplicateDeclarations('.x{color:red; /* intentional */ color:red;}').length,0)
  assert.equal(duplicateDeclarations('.x{color:red}@media(min-width:800px){.x{color:red}}').length,0)
})

for(const file of cssFiles){
  test('no exact adjacent duplicate CSS declarations in '+file,()=>{
    const source=readFileSync(new URL('../../src/tools/components/'+file,import.meta.url),'utf8')
    assert.deepEqual(duplicateDeclarations(source),[])
  })
}

test('bundle budget checks stable chunk prefixes, exact presence and measured bytes',()=>{
  const entries=BUNDLE_BUDGETS.map((rule,i)=>({
    name:rule.prefix+'hashed'+i+rule.suffix,
    size:rule.limitBytes,
  }))
  assert.equal(assessBundleSizes(entries).pass,true)
  const tooLarge=entries.map((entry,i)=>i===0?{...entry,size:entry.size+1}:entry)
  assert.equal(assessBundleSizes(tooLarge).pass,false)
  const missing=entries.slice(1)
  assert.equal(assessBundleSizes(missing).pass,false)
  const duplicate=[...entries,{...entries[0],name:BUNDLE_BUDGETS[0].prefix+'different'+BUNDLE_BUDGETS[0].suffix}]
  assert.equal(assessBundleSizes(duplicate).pass,false)
})

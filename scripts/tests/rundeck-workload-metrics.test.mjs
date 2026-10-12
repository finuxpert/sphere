import test from 'node:test'
import assert from 'node:assert/strict'
import { processCount } from '../../src/tools/components/rundeckWorkloadMetrics.js'

test('process count does not invent one process for missing samples',()=>{
  for(const sample of [{},{process_count:null},{process_count:''},{process_count:'NaN'},{process_count:-1},{process_count:1.2}]){
    assert.equal(processCount(sample),null)
  }
})
test('observed zero, one, multicore groups remain distinct',()=>{
  assert.equal(processCount({process_count:0}),0)
  assert.equal(processCount({process_count:1}),1)
  assert.equal(processCount({process_count:'6'}),6)
})

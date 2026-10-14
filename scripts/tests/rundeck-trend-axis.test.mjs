import test from 'node:test'
import assert from 'node:assert/strict'
import { trendPercentAxisMax } from '../../src/tools/components/rundeckTrendAxis.js'

test('Full percent trend is fixed 0–100 regardless of saved observations', () => {
  const sample=[{avg_value:7},{avg_value:24},{avg_value:94}]
  assert.equal(trendPercentAxisMax(sample,'avg_value','full'),100)
  assert.deepEqual(sample,[{avg_value:7},{avg_value:24},{avg_value:94}])
})

test('Focus zoom expands low values and never truncates retained percent samples', () => {
  assert.equal(trendPercentAxisMax([{avg_value:7.1},{avg_value:12}],'avg_value','focus'),20)
  assert.equal(trendPercentAxisMax([{avg_value:25}],'avg_value','focus'),30)
  assert.equal(trendPercentAxisMax([{max_value:70.1}],'max_value','focus'),80)
  assert.equal(trendPercentAxisMax([{max_value:84.5}],'max_value','focus'),100)
  assert.equal(trendPercentAxisMax([{avg_value:99}],'avg_value','focus'),100)
})

test('Focus ignores missing and invalid samples, applies a 10 percent minimum', () => {
  assert.equal(trendPercentAxisMax([{avg_value:null},{avg_value:'bad'},{avg_value:''}],'avg_value','focus'),10)
  assert.equal(trendPercentAxisMax([], 'avg_value', 'focus'),10)
  assert.equal(trendPercentAxisMax([{avg_value:0}], 'avg_value', 'focus'),10)
})

test('SAP threshold source is never modified by the zoom helper', () => {
  const sample=[{avg_value:25,warning:75,critical:90}]
  assert.equal(trendPercentAxisMax(sample,'avg_value','focus'),30)
  assert.equal(sample[0].warning,75)
  assert.equal(sample[0].critical,90)
})

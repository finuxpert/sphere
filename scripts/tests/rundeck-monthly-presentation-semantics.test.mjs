import assert from 'node:assert/strict'
import test from 'node:test'
import {
  monthlyRankMetricValue, monthlyTrendIntervalLabel, monthlyReviewBasis,
} from '../../src/tools/components/rundeckMonthlyPresentation.js'
import { monthlyStorageNote } from '../../src/tools/components/rundeckMonthlyEvidence.js'

test('missing WP PSS is not silently transformed to 0 GB',()=>{
  for (const raw of [null,undefined,'',Number.NaN,'uncollected']) {
    assert.equal(monthlyRankMetricValue({peak_pss_gb:raw},'ram'),null)
  }
  assert.equal(monthlyRankMetricValue({},'ram'),null)
  assert.equal(monthlyRankMetricValue({peak_pss_gb:0},'ram'),0,
    'an explicitly reported numeric zero remains zero')
  assert.equal(monthlyRankMetricValue({peak_pss_gb:60.94},'ram'),60.94)
  assert.equal(monthlyRankMetricValue({peak_cpu_pct:250},'cpu'),2.5)
  assert.equal(monthlyRankMetricValue({peak_cpu_pct:null},'cpu'),null)
})

test('time-bucket reporting label correctly describes actual backend intervals',()=>{
  assert.equal(monthlyTrendIntervalLabel(30),'30-minute peak per APP · WIB')
  assert.equal(monthlyTrendIntervalLabel(60),'Hourly peak per APP · WIB')
  assert.equal(monthlyTrendIntervalLabel(360),'6-hour peak per APP · WIB')
  assert.equal(monthlyTrendIntervalLabel(1440),'Daily peak per APP · WIB')
  assert.equal(monthlyTrendIntervalLabel(null),'Saved APP peak per bucket · WIB')
})

test('signal-based review reasons never claim confirmed SAP root cause',()=>{
  assert.equal(monthlyReviewBasis({signals:{high_memory:true}}),'Memory signal')
  assert.equal(monthlyReviewBasis({signals:{sustained_high_cpu:true,baseline_anomaly:true}}),
    'Sustained WP CPU · Baseline deviation')
  assert.equal(monthlyReviewBasis({signals:{cpu_spike:true}}),'WP CPU spike')
  assert.equal(monthlyReviewBasis({signals:{}}),'Evidence review')
})

test('storage completeness note declares single actual APP scope',()=>{
  const storage={items:[
    {status:'COLLECTED',host:'AOPH1PAPPDC'},
    {status:'COLLECTED',host:'AOPH1PAPPDC'},
    {status:'COLLECTED',host:'AOPH1PAPPDC'},
    {status:'COLLECTED',host:'AOPH1PAPPDC'},
  ]}
  assert.equal(monthlyStorageNote(storage,false,''),'APP1 · 4/4 mapped filesystems collected')
  assert.equal(monthlyStorageNote({items:[]},false,''),'No filesystem mapping evidence for this reporting period')
})

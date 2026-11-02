import test from 'node:test'
import assert from 'node:assert/strict'
import {
 observedNumber,workloadMetric,topResourceConsumers,storageDevices,
 storageDevicePoints,splitObservedPoints,
} from '../../src/tools/components/rundeckResourceMiniCharts.js'

const examples=[
 {consumer_type:'PROGRAM',consumer_key:'X',avg_cpu_pct:33,avg_pss_gb:.2},
 {consumer_type:'JOB',consumer_key:'Y',avg_cpu_pct:5,avg_pss_gb:2.2},
 {consumer_type:'PROGRAM',consumer_key:'Z',avg_cpu_pct:75,avg_pss_gb:.4},
 {consumer_type:'PROGRAM',consumer_key:'BAD',avg_cpu_pct:null,avg_pss_gb:null},
]
test('Top five uses only observed numeric CPU/PSS; no fabricated zero',()=>{
 assert.equal(observedNumber(null),null)
 assert.equal(observedNumber(''),null)
 assert.equal(observedNumber(-1),null)
 assert.equal(observedNumber('0'),0)
 assert.equal(workloadMetric(examples[0],'cpu'),33)
 assert.deepEqual(topResourceConsumers(examples,'cpu').map(r=>r.consumer_key),['Z','X','Y'])
 assert.deepEqual(topResourceConsumers(examples,'pss').map(r=>r.consumer_key),['Y','Z','X'])
 assert.deepEqual(topResourceConsumers(examples,'fake'),[])
})
test('per-device I/O keeps original host, device, timestamps and null metrics',()=>{
 const rows=[
 {host:'APP1',series_key:'dm-0',read_mbps:5,write_mbps:null,collected_at:'2026-11-02T00:00:00Z'},
 {host:'APP1',series_key:'dm-2',read_mbps:2,write_mbps:3,collected_at:'2026-11-02T00:10:00Z'},
 {host:'APP2',series_key:'dm-0',read_mbps:17,write_mbps:18,collected_at:'2026-11-02T00:15:00Z'},
 {host:'APP1',series_key:'dm-0',read_mbps:0,write_mbps:7,collected_at:'2026-11-02T00:20:00Z'},
 {host:'APP1',series_key:'dm-0',read_mbps:null,write_mbps:null,collected_at:'2026-11-02T00:25:00Z'},
 ]
 assert.deepEqual(storageDevices(rows),['dm-0','dm-2'])
 const points=storageDevicePoints(rows,'dm-0','APP1')
 assert.equal(points.length,2)
 assert.equal(points[1].write_mbps,7)
 assert.equal(points[0].write_mbps,null)
 assert.equal(points.some(p=>p.host==='APP2'),false)
 assert.equal(storageDevicePoints(rows,'dm-0','APP3').length,0)
})
test('historical chart splits intervals and missing metric instead of joining gaps',()=>{
 const at=minutes=>new Date(Date.UTC(2026,10,2,0,minutes)).toISOString()
 const data=[
  {read_mbps:1,collected_at:at(0)},
  {read_mbps:2,collected_at:at(15)},
  {read_mbps:null,collected_at:at(30)},
  {read_mbps:3,collected_at:at(45)},
  {read_mbps:4,collected_at:at(90)},
 ]
 assert.deepEqual(splitObservedPoints(data,'read_mbps',40*60_000).map(s=>s.length),[2,1,1])
})

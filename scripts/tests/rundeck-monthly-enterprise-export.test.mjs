import assert from 'node:assert/strict'
import test from 'node:test'
import { buildManagementMonthlyPdf, monthlyEnterpriseReportModel } from '../../src/tools/components/rundeckMonthlyEnterprisePdf.js'

const fixture={
  month:'2026-09',
  quality:{complete_checks:2842,expected_checks:4321,coverage_pct:65.8},
  summary:{workloads:25},
  monthly_errors:{status:'ERROR_SOURCE_NOT_RETAINED'},
  monthly_pressure:{
    thresholds:{cpu_warning_pct:75,ram_warning_pct:80},
    cpu:{observed_pressure_host_checks:3},
    ram:{observed_pressure_host_checks:7},
    hosts:[
      {host:'AOPH1PAPPDC',avg_cpu_pct:15.6,peak_cpu_pct:96.9,
        avg_ram_pct:47.5,peak_ram_pct:95.9,cpu_warning_host_checks:2,ram_warning_host_checks:6},
      {host:'AOPH2PAPPDC',avg_cpu_pct:18,peak_cpu_pct:76.8,
        avg_ram_pct:45.1,peak_ram_pct:76,cpu_warning_host_checks:1,ram_warning_host_checks:0},
    ],
    daily_hosts:[
      {day:'2026-09-01',host:'AOPH1PAPPDC',peak_cpu_pct:31,
        peak_cpu_at:'2026-09-01T01:00:00Z',peak_ram_pct:35,peak_ram_at:'2026-09-01T01:00:00Z'},
      {day:'2026-09-01',host:'AOPH2PAPPDC',peak_cpu_pct:40,
        peak_cpu_at:'2026-09-01T02:00:00Z',peak_ram_pct:38,peak_ram_at:'2026-09-01T02:00:00Z'},
      {day:'2026-09-24',host:'AOPH1PAPPDC',peak_cpu_pct:96.9,
        peak_cpu_at:'2026-09-24T16:28:00Z',peak_ram_pct:95.9,
        peak_ram_at:'2026-09-24T16:28:00Z'},
    ],
  },
  monthly_abap_candidates:[
    {consumer_type:'PROGRAM',consumer_key:'ZCPU_INTENSIVE',
      occurrences:20,observations:50,hosts:['AOPH1PAPPDC'],
      peak_cpu_pct:250,peak_pss_gb:1.9,last_seen:'2026-09-24T16:28:00Z',
      signals:{sustained_high_cpu:true}},
    {consumer_type:'JOB',consumer_key:'ZMEMORY_INTENSIVE',
      occurrences:5,observations:12,hosts:['AOPH2PAPPDC'],
      peak_cpu_pct:80,peak_pss_gb:9.2,last_seen:'2026-09-22T01:39:00Z',
      signals:{high_memory:true}},
    {consumer_type:'PROGRAM',consumer_key:'ZNO_MEMORY',
      occurrences:3,observations:8,hosts:[],peak_cpu_pct:null,
      peak_pss_gb:null,last_seen:null,signals:{}},
  ],
}

test('monthly enterprise model uses retained data and does not fill missing calendar days',()=>{
  const model=monthlyEnterpriseReportModel('2026-09',fixture)
  assert.equal(model.daily.length,30)
  assert.equal(model.daily[0].cpu.value,40)
  assert.equal(model.daily[1].cpu,null)
  assert.equal(model.series.length,5)
  assert.equal(model.series[0].days[0].cpu,31)
  assert.equal(model.series[1].days[0].cpu,40)
  assert.equal(model.series[0].days[1].cpu,null)
  assert.equal(model.series[1].days[1].cpu,null)
  assert.equal(model.cpuPeak.value,96.9)
  assert.equal(model.cpuPeak.host,'APP1')
  assert.equal(model.candidates.length,3)
  assert.deepEqual(model.sortedCpu.map(v=>v.consumer_key),[
    'ZCPU_INTENSIVE','ZMEMORY_INTENSIVE','ZNO_MEMORY'])
  assert.deepEqual(model.sortedPss.map(v=>v.consumer_key),[
    'ZMEMORY_INTENSIVE','ZCPU_INTENSIVE','ZNO_MEMORY'])
  assert.equal(model.candidates[2].peak_pss_gb,null)
})

test('monthly enterprise PDF is exactly one A3 landscape page with evidence labels',async()=>{
  const pdf=await buildManagementMonthlyPdf({month:'2026-09',data:fixture,returnInstance:true})
  assert.equal(pdf.internal.getNumberOfPages(),1)
  const w=pdf.internal.pageSize.getWidth(),h=pdf.internal.pageSize.getHeight()
  assert.ok(Math.abs(w-1190.55)<.25,'A3 landscape width: '+w)
  assert.ok(Math.abs(h-841.89)<.25,'A3 landscape height: '+h)
  const stream=pdf.internal.pages.slice(1).flat().join('\n')
  for(const token of [
    'SAP Monthly Performance Report','Application Server Performance',
    'Top 10 Jobs for Tuning Review','Top 10 Jobs by Peak WP CPU',
    'Top 10 Jobs by Peak WP Memory','ZCPU_INTENSIVE','ZMEMORY_INTENSIVE',
    'REPORTING PERIOD','MONITORING COVERAGE (EST.)',
  ])assert.ok(stream.includes(token),'Missing PDF label: '+token)
  assert.ok(!stream.includes('PROTOTYPE DATA'),'Live export must not claim simulation')
  assert.ok(!stream.includes('Average Runtime'),'Unknown SM37 duration must not be invented')
  for(const removed of [
    'SPHERE EVIDENCE','Source: SPHERE saved records','Page 1 of 1',
    'SPHERE Monthly Performance Review',
    'WP CPU is core-equivalent',
    'Highest CPU:','Highest RAM:','Alert limit:',
    'CPU WARNING READINGS','RAM WARNING READINGS','DATA COVERAGE',
    'Daily highest observed APP reading',
  ])assert.ok(!stream.includes(removed),'Redundant copy remains: '+removed)
  for(const expected of [
    'APP1','APP2','APP3','APP4','APP5',
    'CPU High Reads','RAM High Reads',
    'TOP TUNING PRIORITIES','JOBS & PROGRAMS EVALUATED',
    'Peak','Limit 75%','Limit 80%',
    '0%','25%','50%','75%','100%',
    '30 Sep','AOP Production',
  ])assert.ok(stream.includes(expected),'Missing reviewed label: '+expected)
  const bytes=new Uint8Array(pdf.output('arraybuffer'))
  assert.equal(String.fromCharCode(...bytes.slice(0,5)),'%PDF-')
  assert.ok(bytes.length>2500)
})

test('monthly enterprise PDF refuses unverified evidence and bad dates',async()=>{
  assert.throws(()=>monthlyEnterpriseReportModel('2026-13',fixture),/Invalid/)
  await assert.rejects(buildManagementMonthlyPdf({month:'2026-09',data:{}}),/Saved monthly/)
})

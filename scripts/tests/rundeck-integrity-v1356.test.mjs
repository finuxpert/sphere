import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { OPERATOR_THRESHOLDS, metricResourceState, hostResourceState, sapWorkloadState, filesystemResourceState } from '../../src/tools/components/rundeckStatusSemantics.js'
import { settleSapIssueSources, unavailableSapIssueIndicators, sapIssueSampleFreshness, sapIssueTimestampFreshness } from '../../src/tools/components/rundeckIssueSources.js'
import { systemHealthState } from '../../src/tools/components/rundeckSystemHealth.js'
import { issueWorkloadTimePair } from '../../src/tools/components/rundeckEvidenceTiming.js'
import { observationIdentityCounts } from '../../src/tools/components/rundeckObservationIdentity.js'
import { hostInfrastructureEvidence, filesystemSamplesForHost } from '../../src/tools/components/rundeckUnifiedHost.js'

test('one threshold authority covers host CPU/RAM/IO Wait, WP and filesystem', () => {
  assert.deepEqual(OPERATOR_THRESHOLDS.cpu, { warning: 75, critical: 90 })
  assert.deepEqual(OPERATOR_THRESHOLDS.ram, { warning: 80, critical: 90 })
  assert.deepEqual(OPERATOR_THRESHOLDS.ioWait, { warning: 10, critical: 20 })
  assert.deepEqual(OPERATOR_THRESHOLDS.filesystem, { warning: 75, critical: 90 })
  const keys = ['cpu', 'ram', 'ioWait']
  for (const key of keys) {
    assert.equal(metricResourceState(OPERATOR_THRESHOLDS[key].warning, key), 'WARNING')
    assert.equal(metricResourceState(OPERATOR_THRESHOLDS[key].critical, key), 'CRITICAL')
    assert.equal(metricResourceState(OPERATOR_THRESHOLDS[key].warning - 0.01, key), 'NORMAL')
  }
  assert.equal(sapWorkloadState({wp_critical:1}), 'ATTENTION')
  assert.equal(sapWorkloadState({wp_critical:2}), 'ATTENTION')
  assert.equal(sapWorkloadState({wp_critical:3}), 'CRITICAL')
  assert.equal(filesystemResourceState(75), 'ATTENTION')
  assert.equal(filesystemResourceState(90), 'CRITICAL')
})

test('invalid and incomplete telemetry is UNKNOWN, not silently zero or NORMAL', () => {
  for (const value of [null,undefined,'','  ','invalid',Number.NaN,-1]) {
    assert.equal(metricResourceState(value,'ram'),'UNKNOWN')
    assert.equal(sapWorkloadState({wp_critical:value}),'UNKNOWN')
    assert.equal(filesystemResourceState(value),'UNKNOWN')
  }
  assert.equal(metricResourceState(0,'cpu'),'NORMAL')
  assert.equal(sapWorkloadState({wp_critical:0}),'NORMAL')
  assert.equal(hostResourceState({cpu_pct:22,ram_pct:null,io_wait_pct:1}),'UNKNOWN')
  assert.equal(hostResourceState({cpu_pct:99,ram_pct:null,io_wait_pct:null}),'CRITICAL')
  assert.equal(hostResourceState({cpu_pct:11,ram_pct:70,iowait_pct:11}),'WARNING')
})

test('SAP Availability alone cannot establish healthy OS resources',()=>{
  assert.equal(systemHealthState([],{availabilityState:'NORMAL'}),'UNKNOWN')
  assert.equal(systemHealthState([{host:'APP1',cpu_pct:null,ram_pct:null,io_wait_pct:null,wp_critical:0}],{availabilityState:'NORMAL'}),'UNKNOWN')
  assert.equal(systemHealthState([{host:'APP1',cpu_pct:12,ram_pct:39,io_wait_pct:1,wp_critical:0}],{availabilityState:'UNKNOWN'}),'UNKNOWN')
})

test('one failed API source remains explicitly unavailable even when other sources succeed', () => {
  const results = [
    {status:'fulfilled',value:{items:[]}},
    {status:'rejected',reason:new Error('503')},
    {status:'fulfilled',value:{sap_app:[{status:'UP'}]}},
    {status:'fulfilled',value:{features:{job_monitor:'WAITING_FOR_SM37_FEED'}}},
  ]
  const settled = settleSapIssueSources(results)
  assert.equal(settled.data.hosts,null)
  assert.equal(settled.data.availability.sap_app[0].status,'UP')
  assert.deepEqual(settled.failed,['hosts'])
  assert.deepEqual(unavailableSapIssueIndicators(settled.failed).map(row=>row.status),['UNKNOWN'])
  assert.deepEqual(settleSapIssueSources([{status:'fulfilled',value:null}]).failed,
    ['incidents','hosts','availability','readiness'])
})

test('APP issue freshness is collection-bound and never assumes an old snapshot is current',()=>{
  const now = Date.parse('2026-10-12T17:00:00Z')
  const payload={collection_id:'rundeck-234',complete:true}
  const sample={host:'AOPH1PAPPDC',collection_id:'rundeck-234',collected_at:'2026-10-12T16:50:00Z'}
  assert.equal(sapIssueSampleFreshness(payload,sample,now),'FRESH')
  assert.equal(sapIssueSampleFreshness(payload,{...sample,collected_at:'2026-10-12T16:39:00Z'},now),'STALE')
  assert.equal(sapIssueSampleFreshness(payload,{...sample,collected_at:null},now),'UNKNOWN')
  assert.equal(sapIssueSampleFreshness(payload,{...sample,collection_id:'rundeck-999'},now),'UNKNOWN')
  assert.equal(sapIssueTimestampFreshness('2026-10-12T16:50:00Z',now),'FRESH')
  assert.equal(sapIssueTimestampFreshness('2026-10-12T16:39:00Z',now),'STALE')
  assert.equal(sapIssueTimestampFreshness(null,now),'UNKNOWN')
})

test('time check uses explicit issue signal and nearest selected workload sample, not first-observed or global skew',()=>{
  const example={
    incident:{signal_active_since:'2026-10-12T05:09:00Z'},
    selected_workload:{
      first_seen:'2026-10-10T16:12:00Z',
      correlation_observed_at:'2026-10-12T05:19:00Z',
      last_seen:'2026-10-12T16:29:00Z',
    },
    alignment:{state:'ALIGNED',max_skew_minutes:10,threshold_minutes:20},
  }
  const pair=issueWorkloadTimePair(example)
  assert.equal(pair.state,'WITHIN WINDOW')
  assert.equal(pair.deltaMinutes,10)
  assert.equal(pair.direction,'AFTER ISSUE')
  assert.equal(issueWorkloadTimePair({...example,selected_workload:{...example.selected_workload,correlation_observed_at:'2026-10-12T05:00:00Z'}}).direction,'BEFORE ISSUE')
  assert.equal(pair.referenceSource,'Issue Start')
  assert.notEqual(pair.firstSeen,pair.issueAt)
  assert.notEqual(pair.lastSeen,pair.workloadAt)
  assert.equal(issueWorkloadTimePair({...example,alignment:{...example.alignment,state:'NO OVERLAP'}}).state,'NO OVERLAP')
  assert.equal(issueWorkloadTimePair({...example,selected_workload:{...example.selected_workload,correlation_observed_at:example.selected_workload.first_seen}}).state,'OUTSIDE WINDOW')
  assert.equal(issueWorkloadTimePair({...example,incident:{signal_active_since:null}}).state,'INSUFFICIENT DATA')
})

test('observation rows never masquerade as SM37 executions',()=>{
  const rows=[
    {collection_id:'rundeck-11',execution_id:'11'},
    {collection_id:'rundeck-11',execution_id:'11'},
    {collection_id:'rundeck-12',execution_id:'12'},
  ]
  const counts=observationIdentityCounts(rows)
  assert.equal(counts.performanceObservations,3)
  assert.equal(counts.rundeckCollections,2)
  assert.equal(counts.sm37Executions,null)
  assert.equal(observationIdentityCounts([{collected_at:'2026-10-12T12:00:00Z'}]).rundeckCollections,null)
  assert.equal(observationIdentityCounts([{execution_id:'153'}]).rundeckCollections,null)
})

test('five identical 89% filesystem values remain five host and collection-specific observations',()=>{
  const at='2026-10-12T16:59:00Z'
  const now=Date.parse('2026-10-12T17:00:00Z')
  const hosts=[1,2,3,4,5].map(n=>({host:`AOPH${n}PAPPDC`,collection_id:`infra-${n}`,snapshot_ts:at}))
  const fs=hosts.map(h=>({host:h.host,collection_id:h.collection_id,collected_at:at,mount_point:'/sap/shared',used_pct:89}))
  for(const host of hosts){
    const evidence=hostInfrastructureEvidence(host,hosts,fs,now)
    assert.equal(evidence.topFs.host,host.host)
    assert.equal(evidence.topFs.collection_id,host.collection_id)
    assert.equal(evidence.state,'ATTENTION')
    assert.equal(filesystemSamplesForHost(host,fs).length,1)
  }
  assert.deepEqual(filesystemSamplesForHost(hosts[0],[{...fs[0],collection_id:'infra-2'}]),[])
  assert.equal(hostInfrastructureEvidence(hosts[0],hosts,[{...fs[0],collection_id:'infra-2'}],now).state,'UNKNOWN')
  // Identical percentages alone do not prove a duplicate-mapping defect.
})

test('the operator display has no unsupported SAME PERIOD status for Related Events',()=>{
  const source=readFileSync(new URL('../../src/tools/components/RundeckEvidenceTimeline.jsx',import.meta.url),'utf8')
  assert.doesNotMatch(source,/Same period|SAME PERIOD/)
  assert.match(source,/issueWorkloadTimePair/)
  assert.match(source,/Workload sample \(/)
})

test('unified APP observations stay collection-bound and incomplete metrics never become zero',()=>{
  const app=readFileSync(new URL('../../src/tools/components/RundeckAppServerAnalysis.jsx',import.meta.url),'utf8')
  const infra=readFileSync(new URL('../../src/tools/components/RundeckInfrastructure.jsx',import.meta.url),'utf8')
  const css=readFileSync(new URL('../../src/tools/components/RundeckUnifiedAppAnalysis.css',import.meta.url),'utf8')
  assert.match(app,/matchedCollection/)
  assert.match(app,/hostCollection/)
  assert.match(app,/collectionId:latestCollectionId/)
  assert.match(app,/loaded \/ \$\{workloadMeta.total\} observed/)
  assert.match(app,/raw != null/)
  assert.doesNotMatch(app,/pids\?\.length \?\? 1/)
  assert.match(infra,/hasNumericSample\(row.value\)/)
  assert.match(infra,/No verified numeric samples/)
  assert.match(infra,/storageRows\.map/)
  assert.match(infra,/setData\(\{host:'',hosts:\[\],fs:\[\],network:\[\],storage:\[\]\}\)/)
  assert.match(css,/\.is-unified-app \.rundeckInfraFsPager/)
})


test('only active APP layout is retained and chart tooltip does not persist after drilldown',()=>{
  const orphan = new URL('../../src/tools/components/RundeckAppServers.jsx',import.meta.url)
  assert.equal(existsSync(orphan),false)
  const trend=readFileSync(new URL('../../src/tools/components/RundeckServerTrend.jsx',import.meta.url),'utf8')
  const events=readFileSync(new URL('../../src/tools/components/RundeckEvidenceTimeline.jsx',import.meta.url),'utf8')
  assert.match(trend,/chart\.dispatchAction\(\{ type: 'hideTip' \}\)/)
  assert.match(trend,/const visible = focused/)
  assert.match(events,/after issue observation/)
  assert.doesNotMatch(events,/m between samples/)
})

test('operator copy shows only evidence and does not auto-fill closing decisions',()=>{
  const read = path => readFileSync(new URL(path,import.meta.url),'utf8')
  const health = read('../../src/tools/components/RundeckSystemHealth.jsx')
  const events = read('../../src/tools/components/RundeckEvidenceTimeline.jsx')
  const css = read('../../src/tools/components/RundeckEvidenceTimeline.css')
  const issues = read('../../src/tools/components/RundeckSapIssues.jsx')
  const review = read('../../src/tools/components/RundeckReviewQuickAnalysis.jsx')
  assert.ok(health.includes('leadingResource('))
  assert.ok(health.includes('observedPct('))
  assert.ok(!health.includes('Resource pressure signal'))
  assert.ok(!health.includes('needs review on this server'))
  assert.ok(events.includes('Issue: ${issueAt'))
  assert.ok(events.includes('Workload sample · ${pair.deltaMinutes}m'))
  assert.ok(!events.includes('data?.interpretation'))
  assert.ok(!events.includes('rundeckEvidenceInterpretation'))
  assert.ok(!css.includes('.rundeckEvidenceInterpretation'))
  assert.ok(issues.includes("job_monitor ?? 'UNKNOWN'"))
  assert.ok(issues.includes('Non-normal'))
  assert.ok(review.includes("closing_status: item?.closing_status || ''"))
  assert.ok(review.includes("closing_status: ''"))
  assert.ok(review.includes("finding: item?.finding || ''"))
  assert.ok(review.includes("recommendation: item?.recommendation || ''"))
  assert.ok(review.includes('Choose result'))
  assert.ok(review.includes('Select a result before saving'))
  assert.ok(!review.includes('suggestedFinding'))
  assert.ok(!review.includes('suggestedRecommendation'))
})

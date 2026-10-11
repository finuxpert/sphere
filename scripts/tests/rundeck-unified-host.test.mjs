import test from 'node:test'
import assert from 'node:assert/strict'
import { appSignalState, chooseUnifiedApp, hostInfrastructureEvidence } from '../../src/tools/components/rundeckUnifiedHost.js'

const now = Date.parse('2026-10-11T06:00:00Z')
const sap = [{host: 'AOPH1PAPPDC',cpu_pct: 12,ram_pct: 42,wp_critical: 2}, {host: 'AOPH2PAPPDC',cpu_pct: 15,ram_pct: 44,wp_critical: 0}]
const ready = {host:'AOPH1PAPPDC', collection_id:'ready-1', snapshot_ts:'2026-10-11T05:59:00Z'}
const fs = {host:ready.host, collection_id:'ready-1', collected_at:'2026-10-11T05:59:30Z', mount_point:'/SAP_ARCH', used_pct:89}
test('one APP card uses SAP snapshot and independently fresh Infrastructure', () => {
  assert.equal(appSignalState(sap[0],true),'ATTENTION')
  assert.equal(appSignalState(sap[0],false),'UNKNOWN')
  const infra = hostInfrastructureEvidence(sap[0],[ready],[fs],now)
  assert.equal(infra.freshness,'FRESH')
  assert.equal(infra.state,'ATTENTION')
  assert.equal(infra.topFs.mount_point,'/SAP_ARCH')
})
test('unverified or mismatched infrastructure cannot become NORMAL',()=>{
  assert.equal(hostInfrastructureEvidence(sap[0],[],[],now).state,'UNKNOWN')
  assert.equal(hostInfrastructureEvidence(sap[0],[ready],[{...fs,collection_id:'wrong'}],now).state,'UNKNOWN')
  assert.equal(hostInfrastructureEvidence(sap[0],[{...ready,snapshot_ts:'2026-10-11T05:20:00Z'}],[fs],now).state,'STALE')
})
test('SAP and Infrastructure status are intentionally independent',()=>{
  assert.equal(appSignalState({...sap[0],wp_critical:3},true),'CRITICAL')
  assert.equal(hostInfrastructureEvidence(sap[0],[ready],[{...fs,used_pct:40}],now).state,'NORMAL')
})
test('selected job context takes priority until operator chooses another APP',()=>{
  assert.equal(chooseUnifiedApp(sap,'APP2',null,'job2','APP1'),'APP2')
  assert.equal(chooseUnifiedApp(sap,'APP2',{host:'APP1',contextToken:'job2'},'job2','APP2'),'APP1')
  assert.equal(chooseUnifiedApp(sap,'APP2',{host:'APP1',contextToken:'old-job'},'job2','APP1'),'APP2')
  assert.equal(chooseUnifiedApp(sap,'',null,'','APP1'),'APP1')
})
test('no aligned APP rows produces no fabricated host selection',()=>{
  assert.equal(chooseUnifiedApp([],'APP1',null,'','APP1'),'')
})

test('unified infrastructure summary and popup use the same independent freshness semantics', () => {
  const evidence = hostInfrastructureEvidence(sap[0],[ready],[fs],now)
  assert.equal(evidence.state,'ATTENTION')
  assert.equal(evidence.freshness,'FRESH')
  assert.equal(hostInfrastructureEvidence(sap[0],[ready],[{...fs,collection_id:'old'}],now).state,'UNKNOWN')
})

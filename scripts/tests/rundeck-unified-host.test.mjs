import test from 'node:test'
import assert from 'node:assert/strict'
import { appSignalState, chooseUnifiedApp, hostInfrastructureEvidence, matchedInfrastructureHost, splitInfrastructureHosts } from '../../src/tools/components/rundeckUnifiedHost.js'

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

test('identical APP aliases from AOQ and AOP sources never cross-map Infrastructure samples', () => {
  const aoq = {host:'AOQH1PAPPDC',source:'AOQ',collection_id:'aoq-1',snapshot_ts:'2026-10-11T05:59:00Z'}
  const aop = {...ready,source:'AOP PROD'}
  const hosts = [aoq, aop]
  assert.equal(matchedInfrastructureHost(sap[0], hosts).host, aop.host)
  assert.equal(matchedInfrastructureHost({host:'APP1'}, hosts).host, aop.host)
  const record = hostInfrastructureEvidence(sap[0],hosts,[{...fs,host:aoq.host,collection_id:'aoq-1',used_pct:42},fs],now)
  assert.equal(record.topFs.mount_point,'/SAP_ARCH')
  assert.equal(record.topFs.used_pct,89)
  assert.equal(record.state,'ATTENTION')
  assert.equal(matchedInfrastructureHost({host:'APP1'},[{...aoq},{...aoq,host:'NONSTANDARD1'}])?.host, aoq.host)
})
test('ambiguous aliases never arbitrarily select the first infrastructure host', () => {
  const candidates = [{host:'AOQH1PAPPDC'},{host:'ABC-H1PAPP01'}]
  // Different aliases do not imply an exact AOP source.
  assert.equal(matchedInfrastructureHost({host:'APP1'},candidates),null)
  const sameAlias = [{host:'AOQH1PAPPDC'},{host:'AQH1PAPPDC'}]
  assert.equal(matchedInfrastructureHost({host:'APP1'},sameAlias),null)
})

test('AOP APP1–APP5 are primary while AOQ remains accessible as another source',()=>{
  const h=[{host:'AOQH1PAPPDC'},{host:'AOPH3PAPPDC'},{host:'AOPH1PAPPDC'}]
  const groups=splitInfrastructureHosts(h)
  assert.deepEqual(groups.primary.map(row=>row.host),['AOPH3PAPPDC','AOPH1PAPPDC'])
  assert.deepEqual(groups.others.map(row=>row.host),['AOQH1PAPPDC'])
  assert.equal(splitInfrastructureHosts([{host:'OTHER'}]).primary.length,1)
})

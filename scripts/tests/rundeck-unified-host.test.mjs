import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { appSignalState, appSignalReason, chooseUnifiedApp, hostInfrastructureEvidence, matchedInfrastructureHost, splitInfrastructureHosts, filesystemCapacitySummary } from '../../src/tools/components/rundeckUnifiedHost.js'
import { OPERATOR_THRESHOLDS, hostResourceState, filesystemResourceState, sapWorkloadState } from '../../src/tools/components/rundeckStatusSemantics.js'

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

test('missing SAP metrics cannot be labelled NORMAL',()=>{
  assert.equal(appSignalState({},true),'UNKNOWN')
  assert.equal(appSignalState({cpu_pct:null,ram_pct:null,io_wait_pct:null,wp_critical:null},true),'UNKNOWN')
  assert.equal(appSignalState({cpu_pct:12},true),'UNKNOWN') // missing WP is not verified NORMAL
})

test('Infrastructure trend controls use scoped memoized history without an obsolete setTrend setter',()=>{
  const source = readFileSync(new URL('../../src/tools/components/RundeckInfrastructure.jsx',import.meta.url),'utf8')
  assert.match(source,/const trend=React\.useMemo\(\(\)=>trendData\.scope===trendScope\?trendData\.items:\[\],\[trendData,trendScope\]\)/)
  assert.doesNotMatch(source,/\bsetTrend\s*\(/)
  assert.match(source,/onClick=\{\(\)=>\{setTrendMetric\(v\);setSelectedSeries\(''\)\}\}/)
})

test('APP card and System Health share CPU/RAM/I/O thresholds', () => {
  const base={ cpu_pct:20, ram_pct:40, io_wait_pct:1, wp_critical:0 }
  for (const [metric,threshold] of [
    ['cpu_pct',OPERATOR_THRESHOLDS.cpu],
    ['ram_pct',OPERATOR_THRESHOLDS.ram],
    ['io_wait_pct',OPERATOR_THRESHOLDS.ioWait],
  ]) {
    assert.equal(appSignalState({...base,[metric]:threshold.warning},true),'WARNING')
    assert.equal(hostResourceState({...base,[metric]:threshold.warning}),'WARNING')
    assert.equal(appSignalState({...base,[metric]:threshold.critical},true),'CRITICAL')
    assert.equal(hostResourceState({...base,[metric]:threshold.critical}),'CRITICAL')
  }
  assert.equal(sapWorkloadState({...base,wp_critical:2}),'ATTENTION')
  assert.equal(appSignalState({...base,wp_critical:3},true),'CRITICAL')
})
test('Filesystem color/threshold and host summary match exactly',()=>{
  assert.equal(filesystemResourceState(null),'UNKNOWN')
  assert.equal(filesystemResourceState(undefined),'UNKNOWN')
  assert.equal(filesystemResourceState(74.99),'NORMAL')
  assert.equal(filesystemResourceState(OPERATOR_THRESHOLDS.filesystem.warning),'ATTENTION')
  assert.equal(filesystemResourceState(89),'ATTENTION')
  assert.equal(filesystemResourceState(90),'CRITICAL')
  assert.equal(hostInfrastructureEvidence(sap[0],[ready],[{...fs,used_pct:75}],now).state,'ATTENTION')
  assert.equal(hostInfrastructureEvidence(sap[0],[ready],[{...fs,used_pct:90}],now).state,'CRITICAL')
})


test('APP status explanation prioritizes critical conditions and excludes filesystem', () => {
  const base={host:'AOPH1PAPPDC',cpu_pct:20,ram_pct:50,io_wait_pct:1,wp_critical:2}
  assert.equal(appSignalReason(base,true),'Critical WP 2')
  assert.equal(appSignalReason({...base,wp_critical:3,cpu_pct:80},true),'Critical WP 3')
  assert.equal(appSignalReason({...base,wp_critical:3,cpu_pct:92},true),'CPU 92%')
  assert.equal(appSignalReason({...base,wp_critical:0},true),'Within SAP thresholds')
  assert.equal(appSignalReason(base,false),'SAP snapshot unverified')
})

test('Filesystem details use only host-matched source bytes and never estimate absent capacity', () => {
  const sample={...fs,total_bytes:100*1024**3,avail_bytes:11*1024**3}
  const evidence=hostInfrastructureEvidence(sap[0],[ready],[sample],now)
  assert.equal(evidence.topFs.mount_point,'/SAP_ARCH')
  assert.equal(filesystemCapacitySummary(evidence.topFs),'Total 100 GiB · Available 11 GiB')
  assert.equal(filesystemCapacitySummary({...sample,avail_bytes:null}),'Total 100 GiB')
  assert.equal(filesystemCapacitySummary({total_bytes:null,avail_bytes:undefined}),'')
  assert.equal(filesystemCapacitySummary({total_bytes:-1,avail_bytes:'unknown'}),'')
  assert.equal(filesystemCapacitySummary({total_bytes:'  ',avail_bytes:'  '}),'')
  assert.equal(hostInfrastructureEvidence(sap[0],[ready],[{...sample,collection_id:'other'}],now).topFs,null)
})

test('APP card identifies Filesystem and mount point without changing SAP status', () => {
  const source=readFileSync(new URL('../../src/tools/components/RundeckUnifiedAppInfrastructure.jsx',import.meta.url),'utf8')
  const styles=readFileSync(new URL('../../src/tools/components/RundeckMockupParity.css',import.meta.url),'utf8')
  assert.match(source,/>Filesystem<\/small>/)
  assert.match(source,/mountPoint = String\(infra\.topFs\?\.mount_point/)
  assert.match(source,/Mount \$\{mountPoint\}/)
  assert.match(source,/filesystemCapacitySummary\(infra\.topFs\)/)
  assert.match(source,/formatWib\(infra\.topFs\.collected_at, true\)/)
  assert.match(source,/Separate from SAP APP status/)
  assert.match(styles,/\.rundeckUnifiedAppCardMount:only-child/)
  assert.doesNotMatch(source,/<small>FS<\/small>/)
})

test('v1.35.7 APP1 critical WP does not recolor normal CPU and RAM metrics', () => {
  const base = {host:'AOPH1PAPPDC',cpu_pct:24.3,ram_pct:56.8,io_wait_pct:1,wp_critical:4}
  assert.equal(appSignalState(base,true),'CRITICAL')
  assert.equal(metricResourceState(base.cpu_pct,'cpu'),'NORMAL')
  assert.equal(metricResourceState(base.ram_pct,'ram'),'NORMAL')
  assert.equal(sapWorkloadState(base),'CRITICAL')
  const source = readFileSync(new URL('../../src/tools/components/RundeckUnifiedAppInfrastructure.jsx',import.meta.url),'utf8')
  const css = readFileSync(new URL('../../src/tools/components/RundeckOperatorFlatV1354.css',import.meta.url),'utf8')
  assert.match(source,/metricResourceState\(host\.cpu_pct, 'cpu'\)/)
  assert.match(source,/metricResourceState\(host\.ram_pct, 'ram'\)/)
  assert.match(source,/sapWorkloadState\(host\)/)
  assert.match(css,/\.is-cpu-normal/)
  assert.match(css,/\.is-wp-critical/)
  assert.match(source,/Promise\.allSettled/)
  assert.match(source,/infraRetry/)
  assert.doesNotMatch(source,/\[refreshToken, nowMs\]/)
})

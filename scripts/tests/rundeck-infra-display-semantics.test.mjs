import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { infrastructureMetric, filesystemDisplayState, storageUtilizationState, worstInfrastructureState } from '../../src/tools/components/rundeckInfraDisplaySemantics.js'
import { appSignalState, filesystemMountSource, hostInfrastructureEvidence } from '../../src/tools/components/rundeckUnifiedHost.js'

test('filesystem threshold is identical in APP and Infrastructure (75% warning, 90% critical)', () => {
  assert.equal(filesystemDisplayState(74.99), 'NORMAL')
  assert.equal(filesystemDisplayState(75), 'ATTENTION')
  assert.equal(filesystemDisplayState(79), 'ATTENTION')
  assert.equal(filesystemDisplayState(89), 'ATTENTION')
  assert.equal(filesystemDisplayState(90), 'CRITICAL')
  assert.equal(filesystemDisplayState(null), 'UNKNOWN')
})

test('missing or invalid telemetry does not become NORMAL or 0%', () => {
  for (const value of [null, undefined, '', ' ', 'invalid', -1, Number.NaN]) {
    assert.equal(infrastructureMetric(value, '%'), '—')
    assert.equal(storageUtilizationState(value), 'UNKNOWN')
  }
  assert.equal(infrastructureMetric(0, '%'), '0%')
  assert.equal(storageUtilizationState(80), 'ATTENTION')
  assert.equal(storageUtilizationState(95), 'CRITICAL')
  assert.equal(worstInfrastructureState(['NORMAL', 'UNKNOWN']), 'UNKNOWN')
  assert.equal(worstInfrastructureState(['ATTENTION', 'UNKNOWN']), 'ATTENTION')
  assert.equal(worstInfrastructureState([]), 'UNKNOWN')
})

test('APP2 SAP status remains NORMAL while separate matched FS 89% is ATTENTION', () => {
  const at = Date.parse('2026-10-13T06:30:00Z')
  const app2 = { host: 'AOPH2PAPPDC', cpu_pct: 6.9, ram_pct: 48.9, io_wait_pct: 0, wp_critical: 0 }
  const infraHost = {host: app2.host, collection_id: 'infra-rundeck-549069-AOPH2PAPPDC', snapshot_ts: '2026-10-13T06:29:10Z'}
  const fs = {host: app2.host, collection_id: infraHost.collection_id, collected_at: '2026-10-13T06:29:12Z', mount_point: '/SAP_ARCH', device: '10.14.55.78:/SAP_ARCH', used_pct: 89}
  assert.equal(appSignalState(app2, true), 'NORMAL')
  const state = hostInfrastructureEvidence(app2, [infraHost], [fs], at)
  assert.equal(state.state, 'ATTENTION')
  assert.equal(filesystemMountSource(fs), 'NFS')
  assert.equal(filesystemMountSource({...fs,device:'/dev/mapper/SAPARCH-SAPARCH'}), 'Mapper')
  assert.equal(hostInfrastructureEvidence(app2, [infraHost], [{...fs, collection_id:'old'}], at).state, 'UNKNOWN')
})

test('top APP badges and Infrastructure summary retain independent semantics', () => {
  const app = readFileSync(new URL('../../src/tools/components/RundeckUnifiedAppInfrastructure.jsx', import.meta.url), 'utf8')
  const live = readFileSync(new URL('../../src/tools/components/RundeckLiveOverview.jsx', import.meta.url), 'utf8')
  assert.match(app, /SAP \{sapState\}/)
  assert.match(app, /`FS \$\{selectedInfra\.state\} · FRESH`/)
  assert.match(app, /`FS \$\{selectedInfra\?\.state \|\| 'UNKNOWN'\}`/)
  assert.match(app, /fsHistorical \? `Last observed \$\{metric\(selectedInfra\.topFs\.used_pct/)
  assert.match(app, /'Device ' \+ \(String\(selectedInfra\?\.topFs\?\.device/)
  assert.match(live, /filesystemDisplayState as fsState/)
  assert.doesNotMatch(live, /Number\(value\) >= 80 \? 'ATTENTION'/)
})

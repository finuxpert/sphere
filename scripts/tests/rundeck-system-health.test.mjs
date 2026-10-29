import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { availabilityFreshnessSignal, deriveSystemHealthEvidence, systemHealthState } from '../../src/tools/components/rundeckSystemHealth.js'

const host = { host: 'APP1', cpu_pct: 20, ram_pct: 30, iowait_pct: 1, wp_critical: 0 }
const valid = { state: 'FRESH', performanceValid: true, availabilityValid: true, collectorBad: false }
const up = { summary: { service_state: 'NORMAL' }, sap_app: [{ status: 'UP' }] }

test('verified source shows saved healthy SAP independently of collector status', () => {
  const r = deriveSystemHealthEvidence({ hosts: [host], availability: up, quality: valid, collector: { status: 'NORMAL' } })
  assert.equal(r.state, 'NORMAL')
  assert.equal(r.observedHosts.length, 1)
})
test('collector NORMAL cannot override missing availability evidence', () => {
  const r = deriveSystemHealthEvidence({ hosts: [host], availability: up, quality: { ...valid, state: 'PARTIAL', availabilityValid: false }, collector: { status: 'NORMAL' } })
  assert.equal(r.state, 'WARNING')
  assert.equal(r.observedAvailability, 'UNKNOWN')
  assert.equal(r.observedImpact, false)
})
test('stale DOWN evidence is not a confirmed current outage', () => {
  const snapshot = { summary: { service_state: 'CRITICAL' }, sap_app: [{ status: 'DOWN' }] }
  const r = deriveSystemHealthEvidence({ hosts: [host], availability: snapshot, quality: { ...valid, state: 'PARTIAL', availabilityValid: false } })
  assert.equal(r.state, 'WARNING')
  assert.equal(r.observedImpact, false)
})
test('fresh confirmed SAP service impact is critical', () => {
  const r = deriveSystemHealthEvidence({ hosts: [host], availability: { summary: { service_state: 'CRITICAL' }, sap_app: [{ status: 'DOWN' }] }, quality: valid })
  assert.equal(r.state, 'CRITICAL')
  assert.equal(r.observedImpact, true)
})
test('bad collector gates historical host telemetry without mutating it', () => {
  const r = deriveSystemHealthEvidence({ hosts: [host], availability: up, quality: { ...valid, state: 'DEGRADED', collectorBad: true } })
  assert.equal(r.state, 'WARNING')
  assert.deepEqual(r.observedHosts, [])
  assert.equal(host.cpu_pct, 20)
})
test('unverified quality never means normal SAP', () => {
  assert.equal(deriveSystemHealthEvidence({ hosts: [host], availability: up }).state, 'UNKNOWN')
})

test('old Availability evidence is explained without asserting current SAP DOWN', () => {
  const warning = availabilityFreshnessSignal(25.9)
  assert.equal(warning.level, 'WARNING')
  assert.equal(warning.text, 'Availability data 25m old')
  assert.match(warning.detail, /25 minutes ago/)
  assert.match(warning.detail, /outside the freshness window/)
  assert.match(warning.detail, /does not mean SAP DOWN/)
})

test('missing Availability observation is distinct from stale timed evidence', () => {
  const unknown = availabilityFreshnessSignal(null)
  assert.equal(unknown.level, 'WARNING')
  assert.equal(unknown.text, 'Availability observation missing')
  assert.match(unknown.detail, /No recent Availability observation was verified/)
  assert.match(unknown.detail, /does not mean SAP DOWN/)
  assert.equal(availabilityFreshnessSignal(Number.NaN).text, unknown.text)
})

test('fresh availability does not turn missing host or critical-WP readings into NORMAL', () => {
  const missingWp = deriveSystemHealthEvidence({
    hosts: [{...host,wp_critical:null}], availability:up,quality:valid,
  })
  const missingResource = deriveSystemHealthEvidence({
    hosts: [{host:'APP1',wp_critical:0}], availability:up,quality:valid,
  })
  assert.equal(missingWp.state,'UNKNOWN')
  assert.equal(missingResource.state,'UNKNOWN')
})

test('Critical WP threshold on APP4 escalates overall System Health to CRITICAL', () => {
  const hosts = [
    {...host, host:'APP1', wp_critical:1},
    {...host, host:'APP2', wp_critical:0},
    {...host, host:'APP3', wp_critical:0},
    {...host, host:'APP4', wp_critical:4},
    {...host, host:'APP5', wp_critical:0},
  ]
  assert.equal(systemHealthState(hosts,{availabilityState:'NORMAL'}),'CRITICAL')
  const result = deriveSystemHealthEvidence({hosts,availability:up,quality:valid,collector:{status:'NORMAL'}})
  assert.equal(result.state,'CRITICAL')
  assert.equal(systemHealthState([hosts[0]],{availabilityState:'NORMAL'}),'ATTENTION')
  assert.equal(systemHealthState([hosts[1]],{availabilityState:'NORMAL'}),'NORMAL')
})

test('fresh critical SAP WP stays CRITICAL even when another APP has host resource WARNING', () => {
  const warned = {...host, host:'APP2', cpu_pct:80, wp_critical:0}
  const criticalWp = {...host, host:'APP4', wp_critical:4}
  assert.equal(systemHealthState([warned,criticalWp],{availabilityState:'NORMAL'}),'CRITICAL')
  assert.equal(systemHealthState([warned,criticalWp],{availabilityState:'NORMAL',availabilityStale:true}),'CRITICAL')
  assert.equal(systemHealthState([warned,criticalWp],{availabilityState:'NORMAL',stale:true}),'CRITICAL')
  assert.equal(systemHealthState([warned,criticalWp],{availabilityState:'NORMAL',serviceCritical:true}),'CRITICAL')
  assert.equal(systemHealthState([], {availabilityState:'UNKNOWN',stale:true}),'WARNING')
})

test('the header reason does not downgrade critical WP to ATTENTION', () => {
  const source = readFileSync(new URL('../../src/tools/components/RundeckSystemHealth.jsx',import.meta.url),'utf8')
  assert.match(source,/workload === 'CRITICAL'\) score = 450/)
  assert.match(source,/top\?\.score === 450\) return \{ level: 'CRITICAL'/)
  assert.match(source,/if \(availabilityStale\) return availabilityFreshnessSignal\(availabilityAge\)/)
})

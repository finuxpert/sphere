import test from 'node:test'
import assert from 'node:assert/strict'
import { availabilityFreshnessSignal, deriveSystemHealthEvidence } from '../../src/tools/components/rundeckSystemHealth.js'

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
  assert.equal(warning.text, 'Availability data old · 25m')
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

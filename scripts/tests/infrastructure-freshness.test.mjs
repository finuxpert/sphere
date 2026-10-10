import test from 'node:test'
import assert from 'node:assert/strict'
import {
  INFRA_FRESHNESS_LIMIT_MS,
  infrastructureFreshness,
  infrastructureObservationStatus,
} from '../../src/tools/components/infrastructureFreshness.js'

const now = Date.parse('2026-10-10T22:15:00+07:00')
const atAge = (ms) => new Date(now - ms).toISOString()

test('new snapshot keeps live severity', () => {
  assert.equal(infrastructureFreshness(atAge(30_000), now), 'FRESH')
  assert.equal(infrastructureObservationStatus('CRITICAL', 'FRESH'), 'CRITICAL')
})

test('15 minute freshness boundary is inclusive', () => {
  assert.equal(infrastructureFreshness(atAge(INFRA_FRESHNESS_LIMIT_MS), now), 'FRESH')
  assert.equal(infrastructureFreshness(atAge(INFRA_FRESHNESS_LIMIT_MS + 1), now), 'STALE')
})

test('seven-hour-old 92 percent is historical, not a current CRITICAL incident', () => {
  const state = infrastructureFreshness(atAge(7 * 60 * 60 * 1000), now)
  assert.equal(state, 'STALE')
  assert.equal(infrastructureObservationStatus('CRITICAL', state), 'STALE')
})

test('missing, invalid and future-dated collection timestamps are unknown', () => {
  assert.equal(infrastructureFreshness('', now), 'UNKNOWN')
  assert.equal(infrastructureFreshness('not-a-time', now), 'UNKNOWN')
  assert.equal(infrastructureFreshness(new Date(now + 61_000).toISOString(), now), 'UNKNOWN')
  assert.equal(infrastructureObservationStatus('NORMAL', 'UNKNOWN'), 'UNKNOWN')
})

test('historical normal measurements cannot claim live NORMAL', () => {
  assert.equal(infrastructureObservationStatus('NORMAL', 'STALE'), 'STALE')
})

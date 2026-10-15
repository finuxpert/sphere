import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  assessRundeckDataQuality, retainedReadyCollectionGaps, dataGapDuration, monitoringFreshnessMessage,
} from '../../src/tools/components/rundeckDataQuality.js'

const now = Date.parse('2026-10-10T23:30:00+07:00')
const before = (ms) => new Date(now - ms).toISOString()
const base = (overrides = {}) => ({
  nowMs: now,
  latest: { status: 'READY', finished_at: before(2 * 60_000) },
  health: { rundeck_stale: false },
  platform: { collector: { poller_status: 'OK', watchdog_status: 'NORMAL', collector_stale: false } },
  availability: { collected_at: before(3 * 60_000) },
  ...overrides,
})
const row = (minutesAgo, status = 'READY') => ({
  status, finished_at: before(minutesAgo * 60_000),
})

test('recovered collector is fresh but old missing observations remain a gap', () => {
  assert.equal(assessRundeckDataQuality(base()).state, 'FRESH')
  const gaps = retainedReadyCollectionGaps([row(480), row(470), row(2)], { nowMs: now })
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].before, Date.parse(row(470).finished_at))
  assert.equal(gaps[0].after, Date.parse(row(2).finished_at))
  assert.equal(dataGapDuration(gaps[0].observedSpacingMs), '7h 48m')
})

test('expired reader evidence is historical, not current NORMAL', () => {
  const q = assessRundeckDataQuality(base({
    latest: { status: 'READY', finished_at: before(8 * 60 * 60_000) },
    health: { rundeck_stale: true },
    platform: { collector: { poller_status: 'ERROR', watchdog_status: 'ERROR', collector_stale: true } },
  }))
  assert.equal(q.state, 'STALE')
  assert.equal(q.performanceValid, false)
})

test('a source failure during an otherwise fresh sample is degraded', () => {
  const q = assessRundeckDataQuality(base({
    platform: { collector: { poller_status: 'ERROR', watchdog_status: 'NORMAL', collector_stale: false } },
  }))
  assert.equal(q.state, 'DEGRADED')
  assert.equal(q.collectorBad, true)
})

test('availability missing does not invalidate a fresh performance sample', () => {
  const q = assessRundeckDataQuality(base({ availability: null }))
  assert.equal(q.state, 'PARTIAL')
  assert.equal(q.performanceValid, true)
  assert.equal(q.availabilityValid, false)
})

test('missing or future source identity is unknown', () => {
  assert.equal(assessRundeckDataQuality(base({ latest: null })).state, 'UNKNOWN')
  assert.equal(assessRundeckDataQuality(base({
    latest: { status: 'READY', finished_at: new Date(now + 90_000).toISOString() },
  })).state, 'UNKNOWN')
  assert.equal(assessRundeckDataQuality(base({ refreshFailed: true })).state, 'UNKNOWN')
})

test('failed or partial manifests do not fabricate a recovered gap boundary', () => {
  const history = [row(480), row(300, 'FAILED'), row(120, 'PARTIAL'), row(2)]
  const gaps = retainedReadyCollectionGaps(history, { nowMs: now })
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].before, Date.parse(row(480).finished_at))
  assert.equal(gaps[0].after, Date.parse(row(2).finished_at))
})

test('no history onset means no fabricated gap; out-of-window gaps stay in trend', () => {
  assert.deepEqual(retainedReadyCollectionGaps([row(2)], { nowMs: now }), [])
  const old = [row(1440), row(1800)]
  assert.deepEqual(retainedReadyCollectionGaps(old, { nowMs: now, maxRecentHours: 12 }), [])
})

// A transient /availability/latest failure invalidates availability, not valid performance.
test('failed availability refresh never shows stale availability as aligned', () => {
  const q = assessRundeckDataQuality(base({ availabilityFetchFailed: true }))
  assert.equal(q.state, 'PARTIAL')
  assert.equal(q.performanceValid, true)
  assert.equal(q.availabilityValid, false)
  assert.equal(q.availabilityAt, null)
})

test('fresh Performance but old Availability never gets a generic old-SAP notice', () => {
  const sample={performanceValid:true,availabilityValid:false,performanceAgeMs:30000,availabilityAgeMs:21*60000}
  const message=monitoringFreshnessMessage(sample)
  assert.match(message,/Performance current \(<1m\)/)
  assert.match(message,/Availability last checked 21m ago/)
  assert.match(message,/saved states are historical/)
  assert.doesNotMatch(message,/Performance not current|current SAP condition cannot be inferred from old samples/)
  assert.match(monitoringFreshnessMessage(sample,{availabilityFetchFailed:true}),/Availability fetch failed/)
  assert.match(monitoringFreshnessMessage({...sample,performanceValid:false}),/Performance not current/)
  assert.match(monitoringFreshnessMessage({...sample,availabilityValid:true}),/Availability current/)
})

test('PDF never reports an old or missing SAP availability sample as current UP', () => {
  const source = readFileSync(new URL('../../src/tools/components/RundeckSource.jsx', import.meta.url), 'utf8')
  assert.match(source, /const reportAvailabilityUnverified = !availabilityResult/)
  assert.match(source, /!Number\.isFinite\(reportAvailabilityTs\) \|\| reportAvailabilityStale/)
  assert.match(source, /Current service status unverified/)
  assert.match(source, /availabilityState: reportAvailabilityUnverified \? 'UNKNOWN' : availabilityState/)
  assert.match(source, /availabilityStale: reportAvailabilityUnverified/)
  assert.match(source, /LAST UP/)
})

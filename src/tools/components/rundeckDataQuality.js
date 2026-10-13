// Data reliability is independent of SAP operational health.
// No missing observation is inferred as an SAP failure or a healthy sample.
const PERF_FRESH_MS = 15 * 60 * 1000
const AVAIL_FRESH_MS = 20 * 60 * 1000
const CLOCK_TOLERANCE_MS = 60 * 1000

function observedMs(value, nowMs) {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && parsed <= nowMs + CLOCK_TOLERANCE_MS ? parsed : null
}

const badSource = new Set(['ERROR', 'CRITICAL', 'RECOVERY_FAILED', 'NOT_CONFIGURED'])
const sourceStatus = (value) => String(value || 'UNKNOWN').toUpperCase()

export function assessRundeckDataQuality({
  latest = null, health = null, platform = null, availability = null,
  refreshFailed = false, availabilityFetchFailed = false, nowMs = Date.now(),
} = {}) {
  const collector = platform?.collector || {}
  const performanceAt = observedMs(latest?.finished_at || latest?.collection_time_wib, nowMs)
  const availabilityAt = availabilityFetchFailed ? null : observedMs(availability?.collected_at, nowMs)
  const performanceAgeMs = performanceAt === null ? null : Math.max(0, nowMs - performanceAt)
  const availabilityAgeMs = availabilityAt === null ? null : Math.max(0, nowMs - availabilityAt)
  const poller = sourceStatus(collector.poller_status)
  const watchdog = sourceStatus(collector.watchdog_status)
  const collectorBad = badSource.has(poller) || badSource.has(watchdog) ||
    !['OK', 'WAITING', 'BUSY'].includes(poller) ||
    !['NORMAL', 'RECOVERED'].includes(watchdog)
  const collectorVerified = Boolean(health && platform && platform.collector)
  const ready = latest?.status === 'READY'
  let state = 'FRESH'
  if (refreshFailed || !collectorVerified || !ready || performanceAt === null) state = 'UNKNOWN'
  else if (performanceAgeMs >= PERF_FRESH_MS || health?.rundeck_stale || collector.collector_stale) state = 'STALE'
  else if (collectorBad) state = 'DEGRADED'
  else if (availabilityAgeMs === null || availabilityAgeMs >= AVAIL_FRESH_MS) state = 'PARTIAL'

  const performanceValid = ready && performanceAt !== null && performanceAgeMs < PERF_FRESH_MS &&
    !health?.rundeck_stale && !collector.collector_stale && !refreshFailed && collectorVerified
  const availabilityValid = availabilityAt !== null && availabilityAgeMs < AVAIL_FRESH_MS && !refreshFailed
  return {
    state, performanceValid, availabilityValid, collectorBad,
    performanceAgeMs, availabilityAgeMs, performanceAt, availabilityAt,
    poller, watchdog,
  }
}


/** Independent freshness copy: old Availability cannot make fresh Performance stale. */
export function monitoringFreshnessMessage(quality = {}, { availabilityFetchFailed = false } = {}) {
  const age = ms => {
    if (ms == null || !Number.isFinite(Number(ms))) return null
    const minutes = Math.max(0, Math.floor(Number(ms) / 60000))
    if (minutes < 1) return '<1m'
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`
  }
  const performanceAge = age(quality.performanceAgeMs)
  const availabilityAge = age(quality.availabilityAgeMs)
  const performance = quality.performanceValid
    ? `Performance current (${performanceAge || 'age unknown'})`
    : performanceAge ? `Performance not current (${performanceAge})` : 'Performance unverified'
  const availability = quality.availabilityValid
    ? `Availability current (${availabilityAge || 'age unknown'})`
    : availabilityFetchFailed ? 'Availability fetch failed'
      : availabilityAge ? `Availability last checked ${availabilityAge} ago` : 'Availability not verified'
  const note = quality.performanceValid && !quality.availabilityValid
    ? 'Current SAP service availability is not verified; saved states are historical.'
    : 'Check each source timestamp before assessing current SAP conditions.'
  return `${performance} · ${availability}. ${note}`
}

// A gap is based on adjacent actually retained READY executions, not on
// failure-log timestamps. Boundary timestamps are OBSERVATIONS, not precise
// outage onset/recovery time. Partial/failed runs cannot close a READY gap.
export function retainedReadyCollectionGaps(history = [], {
  cadenceSeconds = 600, nowMs = Date.now(), maxRecentHours = 24,
} = {}) {
  const cadenceMs = Math.max(60, Number(cadenceSeconds) || 600) * 1000
  const sorted = [...new Set((Array.isArray(history) ? history : [])
    .filter((row) => row?.status === 'READY')
    .map((row) => observedMs(row.finished_at, nowMs))
    .filter((stamp) => stamp !== null))].sort((a, b) => a - b)
  const gaps = []
  for (let i = 1; i < sorted.length; i += 1) {
    const before = sorted[i - 1]
    const after = sorted[i]
    if (after - before > cadenceMs * 2.2) {
      gaps.push({ before, after, observedSpacingMs: after - before })
    }
  }
  const recent = gaps.filter((gap) => nowMs - gap.after <= maxRecentHours * 60 * 60 * 1000)
  return recent.reverse()
}

export function dataGapDuration(valueMs) {
  const minutes = Math.max(0, Math.floor(Number(valueMs || 0) / 60_000))
  if (minutes < 60) return minutes + 'm'
  const hours = Math.floor(minutes / 60)
  return hours + 'h' + (minutes % 60 ? ' ' + (minutes % 60) + 'm' : '')
}

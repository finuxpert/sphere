/** Saved WP observations: chart helpers deliberately reject invented/synthesized samples. */
export const WP_TYPES = ['DIA', 'BTC', 'UPD', 'ENQ', 'OTHER']
export const WP_COLORS = { DIA:'#68a9de', BTC:'#63bfac', UPD:'#e2aa60', ENQ:'#a998df', OTHER:'#8296ad' }
export const WORKLOAD_COLORS = { jobs:'#68a9de', programs:'#63bfac' }

export function niceCountMax(value) {
  if (!Number.isFinite(value) || value <= 0) return 1
  const m = 10 ** Math.floor(Math.log10(value))
  return ([1, 2, 2.5, 5, 10].find(step => step * m >= value) ?? 10) * m
}

const countOrNull = value => value === null ? true : Number.isSafeInteger(value) && value >= 0
export function validateActivityTrend(payload, range) {
  if (!payload || payload.range !== range ||
    !['6h', '24h'].includes(range) ||
    !['ALL_OBSERVED_ACTIVE_WORKLOADS', 'TOP_CONSUMERS_ONLY'].includes(payload.coverage_scope) ||
    !Number.isFinite(Date.parse(payload.start || '')) ||
    !Number.isFinite(Date.parse(payload.end || '')) ||
    Date.parse(payload.start) >= Date.parse(payload.end) ||
    !Array.isArray(payload.items) || payload.items.length > 300 ||
    !Number.isSafeInteger(payload.complete_checks) || payload.complete_checks !== payload.items.length ||
    !Number.isSafeInteger(payload.activity_checks) || !Number.isSafeInteger(payload.wp_checks)) return null
  const seen = new Set()
  let activityChecks = 0, wpChecks = 0, previous = -Infinity
  for (const point of payload.items) {
    if (!point || typeof point.collection_id !== 'string' || !point.collection_id ||
      seen.has(point.collection_id) || !Number.isFinite(Date.parse(point.collected_at || ''))) return null
    seen.add(point.collection_id)
    const at = Date.parse(point.collected_at)
    if (at < previous || at < Date.parse(payload.start) || at >= Date.parse(payload.end)) return null
    previous = at
    if (!countOrNull(point.jobs) || !countOrNull(point.programs) ||
      (point.jobs === null) !== (point.programs === null) ||
      !Number.isSafeInteger(point.source_rows) || point.source_rows < 0) return null
    if (point.jobs !== null) activityChecks += 1
    if (point.wp === null) {
      if (point.observed_wp !== null) return null
    } else {
      if (typeof point.wp !== 'object' || !Number.isSafeInteger(point.observed_wp) || point.observed_wp <= 0 ||
        WP_TYPES.some(k => !Number.isSafeInteger(point.wp[k]) || point.wp[k] < 0) ||
        WP_TYPES.reduce((sum,k) => sum + point.wp[k],0) !== point.observed_wp) return null
      wpChecks += 1
    }
  }
  return activityChecks === payload.activity_checks && wpChecks === payload.wp_checks ? payload : null
}

export function splitActivitySeries(points, valid, gapMs = 26 * 60000) {
  const segments = []
  let current = []
  for (const point of points) {
    const time = Date.parse(point.collected_at || '')
    if (!Number.isFinite(time) || !valid(point)) {
      if (current.length) segments.push(current)
      current = []
      continue
    }
    if (current.length && time - Date.parse(current[current.length-1].collected_at) > gapMs) {
      segments.push(current)
      current = []
    }
    current.push(point)
  }
  if (current.length) segments.push(current)
  return segments
}

export function peakActivity(points, value) {
  return points.reduce((best, row) => {
    const number = value(row)
    return Number.isFinite(number) && number >= 0 &&
      (!best || number > best.value) ? { value: number, at: row.collected_at } : best
  }, null)
}

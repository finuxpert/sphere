/** Separate missing monitoring samples from SAP availability observations. */
import { resolvedGapIntervalMs } from './rundeckTrendFormatting.js'

export function trendGaps(trend) {
  const rows = trend?.items || []
  const rangeStart = Date.parse(trend?.since || trend?.range_started_at || '')
  const customEnd = Date.parse(trend?.window_end || '')
  const rangeEnd = Number.isFinite(customEnd) ? customEnd - 1 : Date.now()
  const intervalMs = resolvedGapIntervalMs(trend)

  if (trend?.metric === 'availability' && Array.isArray(trend?.observation_gaps)) {
    const gaps = trend.observation_gaps
      .map((gap) => [Date.parse(gap?.from || ''), Date.parse(gap?.to || '')])
      .filter(([from, to]) => Number.isFinite(from) && Number.isFinite(to) && to > from)
    return { gaps, rangeStart, rangeEnd, intervalMs, historyStartedAt: null }
  }
  // Missing availability observation metadata cannot establish a missing check.
  // Never infer its gaps using the generic performance collection cadence.
  if (trend?.metric === 'availability') {
    return { gaps: [], rangeStart, rangeEnd, intervalMs, historyStartedAt: null }
  }

  const gapThresholdMs = intervalMs * 2
  const buckets = Array.from(new Set(rows.map((row) => Date.parse(row.bucket)).filter(Number.isFinite))).sort((a, b) => a - b)
  const historyStartedAt = Number.isFinite(rangeStart) && buckets.length && buckets[0] - rangeStart > gapThresholdMs
    ? buckets[0]
    : null
  const gaps = []
  for (let index = 1; index < buckets.length; index += 1) {
    if (buckets[index] - buckets[index - 1] > gapThresholdMs) gaps.push([buckets[index - 1] + intervalMs, buckets[index] - intervalMs])
  }
  if (buckets.length && rangeEnd - buckets[buckets.length - 1] > gapThresholdMs) gaps.push([buckets[buckets.length - 1] + intervalMs, rangeEnd])
  return { gaps, rangeStart, rangeEnd, intervalMs, historyStartedAt }
}

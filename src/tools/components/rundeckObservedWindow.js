// Visual-axis bounds only. Missing historical samples remain UNKNOWN.
// Uses a streaming reduction instead of spreading arbitrary collector arrays.
export function observedTrendWindow(trends = [], minWindowMs = 24 * 60 * 60 * 1000) {
  let first = Infinity
  let last = -Infinity
  let sampleCount = 0
  for (const trend of trends) {
    for (const row of trend?.items || []) {
      const numeric = [row?.avg_value, row?.max_value].some(value =>
        value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)))
      const state = ['UP', 'DOWN', 'DEGRADED'].includes(String(row?.status || '').toUpperCase())
      const time = Date.parse(row?.bucket || '')
      if (!Number.isFinite(time) || !(numeric || state)) continue
      first = Math.min(first, time)
      last = Math.max(last, time)
      sampleCount += 1
    }
  }
  if (!sampleCount) return null
  const observedSpan = Math.max(minWindowMs, last - first)
  const margin = Math.min(24 * 60 * 60 * 1000, Math.max(10 * 60 * 1000, observedSpan * 0.025))
  const from = first - margin
  const to = Math.max(last + margin, from + minWindowMs)
  return { from, to, first, last, sampleCount }
}

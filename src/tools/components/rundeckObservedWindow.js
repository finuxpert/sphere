// Pure display-window derivation. Never removes or synthesizes historical readings.
// A fitted axis is an operator-selected visualization; the requested query remains intact.
export function observedTrendWindow(trends = [], minWindowMs = 24 * 60 * 60 * 1000) {
  const points = []
  for (const trend of trends) {
    for (const row of trend?.items || []) {
      const valid = [row?.avg_value, row?.max_value].some(value =>
        value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)))
        || ['UP', 'DOWN', 'DEGRADED'].includes(String(row?.status || '').toUpperCase())
      const time = Date.parse(row?.bucket || '')
      if (valid && Number.isFinite(time)) points.push(time)
    }
  }
  if (!points.length) return null
  const first = Math.min(...points)
  const last = Math.max(...points)
  const observedSpan = Math.max(minWindowMs, last - first)
  const margin = Math.min(24 * 60 * 60 * 1000, Math.max(10 * 60 * 1000, observedSpan * 0.025))
  const from = first - margin
  const to = Math.max(last + margin, from + minWindowMs)
  return { from, to, first, last, sampleCount: points.length }
}

/** Optional visual zoom for APP percentage charts. Does not mutate metrics or thresholds. */
export function trendPercentAxisMax(rows = [], valueKey = 'avg_value', scaleMode = 'full') {
  if (scaleMode !== 'focus') return 100
  const samples = (Array.isArray(rows) ? rows : [])
    .map(row => row?.[valueKey])
    .filter(value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)))
    .map(Number)
  const high = samples.length ? Math.max(0, ...samples) : 0
  // Floor 10% prevents excessive visual exaggeration around zero.
  return Math.min(100, Math.max(10, Math.ceil(high * 1.12 / 10) * 10))
}

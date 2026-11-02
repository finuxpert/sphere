/** Compact SPHERE charts must use only source-backed numeric observations.
 * These helpers never fabricate zero samples or combine unrelated devices. */
export const observedNumber = value =>
  value === null || value === undefined || value === '' ||
  !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value)

export const workloadMetric = (row, metric) =>
  observedNumber(metric === 'pss' ? row?.avg_pss_gb : row?.avg_cpu_pct)

export function topResourceConsumers(rows, metric = 'cpu', limit = 5) {
  if (!['cpu', 'pss'].includes(metric)) return []
  return (Array.isArray(rows) ? rows : [])
    .filter(row => row && String(row.consumer_key || '').trim() && workloadMetric(row, metric) !== null)
    .sort((a, b) => workloadMetric(b, metric) - workloadMetric(a, metric) ||
      String(a.consumer_key).localeCompare(String(b.consumer_key)))
    .slice(0, Math.max(0, limit))
}

export function storageDevices(rows) {
  return [...new Set((Array.isArray(rows) ? rows : [])
    .filter(row => row && (observedNumber(row.read_mbps) !== null ||
      observedNumber(row.write_mbps) !== null))
    .map(row => String(row.series_key || '').trim()).filter(Boolean))].sort()
}

export function storageDevicePoints(rows, device) {
  return (Array.isArray(rows) ? rows : [])
    .filter(row => String(row.series_key || '').trim() === device &&
      Number.isFinite(Date.parse(row.collected_at || '')) &&
      (observedNumber(row.read_mbps) !== null || observedNumber(row.write_mbps) !== null))
    .sort((a, b) => Date.parse(a.collected_at) - Date.parse(b.collected_at))
}

/** Split sparse timeseries. Never bridge a missing collection interval. */
export function splitObservedPoints(points, metric, maxGapMs = 45 * 60_000) {
  const segments = []
  for (const point of Array.isArray(points) ? points : []) {
    if (observedNumber(point?.[metric]) === null) {
      // An observed row missing this metric breaks continuity; do not draw a
      // bridge between the surrounding real points.
      if (segments.at(-1)?.length) segments.push([])
      continue
    }
    const previous = segments[segments.length - 1]?.at(-1)
    const elapsed = previous ? Date.parse(point.collected_at) - Date.parse(previous.collected_at) : 0
    if (!previous || elapsed > maxGapMs || elapsed < 0) segments.push([point])
    else segments[segments.length - 1].push(point)
  }
  return segments
}

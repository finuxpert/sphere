import { vortexAppLabel } from './rundeckTrendAmbientData.js'

// Preserve the distinction between a source-verified peak timestamp and the
// start of an aggregated history bucket. Never synthesize missing samples.
export function savedTrendPeak(trend, mode = 'max', selectedHost = '') {
  if (!Array.isArray(trend?.items)) return null
  const focus = vortexAppLabel(selectedHost)
  if (selectedHost && !focus) return null
  const key = mode === 'avg' ? 'avg_value' : 'max_value'
  let peak = null
  for (const row of trend.items) {
    const host = vortexAppLabel(row?.host || row?.source_host || row?.app)
    if (!host || (focus && host !== focus)) continue
    const value = row?.[key]
    const bucket = String(row?.bucket || '')
    if (value === null || value === undefined || value === '' ||
        !Number.isFinite(Number(value)) || !Number.isFinite(Date.parse(bucket))) continue
    if (peak && Number(value) <= peak.value) continue
    const sourcePeakAt = String(row?.peak_at || '')
    const verified = mode === 'max' && Number.isFinite(Date.parse(sourcePeakAt))
    const raw = String(trend?.bucket || '').toLowerCase() === 'raw'
    peak = {
      value: Number(value), bucket, host,
      timestamp: verified ? sourcePeakAt : bucket,
      exact: verified || (mode === 'max' && raw),
      unit: String(trend?.unit || ''),
    }
  }
  return peak
}

export function formatTrendPeakWib(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Time unavailable'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
}

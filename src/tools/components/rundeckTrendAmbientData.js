// Saved-telemetry identity utilities, independent of decorative canvas rendering.
// Normalize the two host identities exposed by SAP APP traces and history rows.
export function vortexAppLabel(host) {
  const raw = String(host || '').trim().toUpperCase()
  const full = /^AOPH([1-5])PAPPDC$/.exec(raw)
  if (full) return 'APP' + full[1]
  const short = /^APP([1-5])$/.exec(raw)
  return short ? 'APP' + short[1] : ''
}

// Bucket-scoped highest observation, never live SAP state. Focus is fail-closed:
// an APP-specific peak must have an explicitly matching host identity.
export function savedVortexPeak(trend, mode = 'max', focusedHost = '') {
  if (!Array.isArray(trend?.items)) return null
  const selected = vortexAppLabel(focusedHost)
  if (focusedHost && !selected) return null
  const key = mode === 'avg' ? 'avg_value' : 'max_value'
  let peak = null
  for (const item of trend.items) {
    const host = vortexAppLabel(item?.host || item?.source_host || item?.app)
    if (selected && host !== selected) continue
    const value = item?.[key]
    if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) continue
    if (!peak || Number(value) > peak.value) {
      peak = {
        value: Number(value), bucket: String(item.bucket || ''),
        unit: String(trend.unit || ''), host,
      }
    }
  }
  return peak
}


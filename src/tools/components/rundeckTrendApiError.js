/** User-safe FastAPI trend errors. No raw exception payload or stack trace. */
export function trendApiError(status, payload, metric = '') {
  const detail = payload?.detail
  const entries = Array.isArray(detail) ? detail : []
  const metricRejected = status === 422 && metric.startsWith('network_') &&
    entries.some(entry => Array.isArray(entry?.loc) && entry.loc.includes('metric'))
  if (metricRejected) return 'Network API 422: backend DEV belum menerima network_rx/network_tx. Deploy backend dan UI DEV bersamaan.'
  if (status === 422) {
    const fields = entries.map(entry => Array.isArray(entry?.loc) ? entry.loc.at(-1) : null)
      .filter(value => ['range','bucket','metric','from_at','to_at'].includes(value))
    return 'Trend API 422: parameter tidak diterima' + (fields.length ? ' (' + [...new Set(fields)].join(', ') + ')' : '') + '.'
  }
  if (status === 503) return metric.startsWith('network_')
    ? 'Network history tidak tersedia dari backend Infrastructure (503).'
    : 'Trend history belum tersedia (503).'
  return 'Trend API gagal (HTTP ' + String(status) + ').'
}

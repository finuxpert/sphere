/** Pure Monitoring display formatting and saved availability classification. */
export const formatTime = (value, compact = false) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('id-ID', compact
    ? { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }
    : { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }
  ).format(date)
}

export const metric = (value, suffix = '') => (
  value === null || value === undefined || value === ''
    ? '—'
    : `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}${suffix}`
)

export const ageLabel = (minutes) => {
  if (!Number.isFinite(minutes)) return 'age unknown'
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

export function clipped(value, length = 44) {
  const text = String(value || '—')
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}

export function availabilityStatus(rows = [], name = '') {
  const key = String(name || '').toUpperCase()
  const row = rows.find((item) => String(item?.name || '').toUpperCase() === key)
  return String(row?.status || 'UNKNOWN').toUpperCase()
}

export function availabilityServiceImpact(payload = {}) {
  const apps = payload?.sap_app || []
  const hana = payload?.hana_system_db || []
  const web = payload?.web_dispatcher || []
  const appDown = apps.some((row) => String(row?.status || '').toUpperCase() === 'DOWN')
  const hanaPrimaryDown = hana.some((row) => String(row?.name || '').toUpperCase() === 'PRIMARY' && String(row?.status || '').toUpperCase() === 'DOWN')
  const webDown = web.length > 0 && web.every((row) => String(row?.status || '').toUpperCase() === 'DOWN')
  return appDown || hanaPrimaryDown || webDown
}


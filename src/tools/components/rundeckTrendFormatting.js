/**
 * Saved trend labels, numeric normalization and collection-bucket timing.
 * Pure presentation helpers: no network requests, DOM access, or SAP data mutation.
 * Preserve WIB formatting, missing-sample semantics and original interval precedence.
 */
import { formatWib } from './sapUiFormat.js'

const DEFAULT_COLLECTION_CADENCE_MS = 10 * 60 * 1000
const BUCKET_INTERVAL_MS = {
  '10m': 10 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
}

export function formatTrendAxis(value, range) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const base = { timeZone: 'Asia/Jakarta', hour12: false }
  if (['7d', '30d', 'last_month', '90d', '180d'].includes(range)) {
    return new Intl.DateTimeFormat('id-ID', { ...base, day: '2-digit', month: 'short' }).format(date)
  }
  if (range === '24h') {
    const dateLabel = new Intl.DateTimeFormat('id-ID', { ...base, day: '2-digit', month: 'short' }).format(date)
    const clockLabel = new Intl.DateTimeFormat('id-ID', { ...base, hour: '2-digit', minute: '2-digit' }).format(date).replace(/(\d{1,2})\.(\d{2})/g, '$1:$2')
    return dateLabel + '\n' + clockLabel
  }
  return formatWib(value, false)
}

export function numericTrendSample(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const sample = Number(value)
  return Number.isFinite(sample) ? sample : null
}

export function formatSavedBucketWindow(trend, bucket) {
  const at = Date.parse(bucket || '')
  if (!Number.isFinite(at)) return 'Bucket unavailable'
  const duration = BUCKET_INTERVAL_MS[String(trend?.bucket || '').toLowerCase()] || null
  if (!duration) return `Bucket ${formatWib(at, true)} WIB`
  const end = at + duration
  const fromLabel = formatWib(at, true)
  const endLabel = formatWib(end, true)
  const sameDate = fromLabel.split(',')[0] === endLabel.split(',')[0]
  return `Bucket ${fromLabel}–${sameDate ? formatWib(end) : endLabel} WIB`
}

export function trendAxisSplitNumber(range) {
  if (['30d', 'last_month', '90d', '180d'].includes(range)) return 6
  if (range === '7d') return 6
  if (range === '24h') return 4
  if (range === '6h') return 6
  return 5
}

export function gapDurationText(from, to) {
  const minutes = Math.max(0, Math.round((to - from) / 60000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remain = minutes % 60
  return remain ? `${hours}h ${remain}m` : `${hours}h`
}

export function gapTimeRangeText(from, to) {
  const start = new Date(from)
  const end = new Date(to)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—'
  const dateFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short' })
  const timeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false })
  const startDate = dateFmt.format(start)
  const endDate = dateFmt.format(end)
  const startTime = timeFmt.format(start).replace(/(\d{1,2})\.(\d{2})/g, '$1:$2')
  const endTime = timeFmt.format(end).replace(/(\d{1,2})\.(\d{2})/g, '$1:$2')
  return `${startDate} ${startTime} - ${endDate} ${endTime} WIB`
}

export function gapLabel(from, to) {
  return `COLLECTION GAP - ${gapTimeRangeText(from, to)} - ${gapDurationText(from, to)}`
}

export function resolvedGapIntervalMs(trend) {
  const explicitSeconds = Number(trend?.bucket_interval_seconds)
  if (Number.isFinite(explicitSeconds) && explicitSeconds >= 60) return explicitSeconds * 1000

  const resolvedBucket = String(trend?.bucket || '').toLowerCase()
  if (BUCKET_INTERVAL_MS[resolvedBucket]) return BUCKET_INTERVAL_MS[resolvedBucket]

  const cadenceMs = Number(trend?.collection_cadence_seconds || 600) * 1000
  return Number.isFinite(cadenceMs) && cadenceMs >= 60_000 ? cadenceMs : DEFAULT_COLLECTION_CADENCE_MS
}

/** Custom monitoring window is always Asia/Jakarta (UTC+07:00), regardless of browser timezone.
 * End minute is inclusive in the UI; API end is one minute later, exclusive.
 */
const MINUTE = 60_000
const MAX_DURATION = 180 * 24 * 60 * MINUTE
const HISTORY = MAX_DURATION
const DAY = 24 * 60 * MINUTE
const RANGE_MINUTES = { '30m': 30, '1h': 60, '3h': 180, '6h': 360, '24h': 1440, '7d': 10080, '30d': 43200, '90d': 129600, '180d': 259200 }
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

export function wibMinuteInput(value) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(value)
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}T${byType.hour}:${byType.minute}`
}

/** Prefill Custom from the current preset, not from stale hidden form inputs. */
export function initialCustomRangeInputs(range, appliedWindow = null, now = Date.now()) {
  if (range === 'custom' && appliedWindow?.fromWib && appliedWindow?.toWib) {
    return { start: appliedWindow.fromWib, end: appliedWindow.toWib }
  }
  if (range === 'last_month') {
    const thisMonth = wibMinuteInput(new Date(now)).slice(0, 7)
    const thisMonthStart = Date.parse(thisMonth + '-01T00:00:00+07:00')
    const end = thisMonthStart - MINUTE
    const previousMonthStart = Date.parse(wibMinuteInput(new Date(end)).slice(0, 7) + '-01T00:00:00+07:00')
    return { start: wibMinuteInput(new Date(previousMonthStart)), end: wibMinuteInput(new Date(end)) }
  }
  const selectedEnd = Math.floor(now / MINUTE) * MINUTE
  const durationMinutes = RANGE_MINUTES[range] || RANGE_MINUTES['24h']
  return {
    start: wibMinuteInput(new Date(selectedEnd - (durationMinutes - 1) * MINUTE)),
    end: wibMinuteInput(new Date(selectedEnd)),
  }
}

/** Keep rendered point counts bounded; backend independently resolves the same intervals. */
export function customBucketForDuration(durationMs) {
  if (durationMs <= DAY) return 'raw'
  if (durationMs <= 7 * DAY) return '1h'
  if (durationMs <= 30 * DAY) return '6h'
  return '1d'
}

function parseWibMinute(input) {
  if (!TIMESTAMP.test(String(input || ''))) return NaN
  const parsed = Date.parse(input + ':00+07:00')
  if (!Number.isFinite(parsed) || wibMinuteInput(new Date(parsed)) !== input) return NaN
  return parsed
}

export function validateCustomRange(startInput, endInput, now = Date.now()) {
  const from = parseWibMinute(startInput)
  const selectedEnd = parseWibMinute(endInput)
  if (!Number.isFinite(from) || !Number.isFinite(selectedEnd)) {
    return { error: 'Isi tanggal dan jam WIB yang valid.' }
  }
  const until = selectedEnd + MINUTE
  if (until - from < MINUTE) return { error: 'Waktu selesai harus sama atau setelah waktu mulai.' }
  if (until - from > MAX_DURATION) return { error: 'Maksimal rentang custom adalah 180 hari (6 bulan).' }
  if (from < now - HISTORY) return { error: 'Tanggal mulai maksimal 180 hari sebelum sekarang; data mengikuti retensi yang tersedia.' }
  if (until > now + MINUTE) return { error: 'Waktu selesai tidak boleh melebihi waktu sekarang.' }
  return {
    from_at: new Date(from).toISOString(),
    to_at: new Date(until).toISOString(),
    fromWib: startInput,
    toWib: endInput,
    bucket: customBucketForDuration(until - from),
  }
}

export function customRangeSearch(window) {
  return new URLSearchParams({ from_at: window.from_at, to_at: window.to_at }).toString()
}

export function customRangeCaption(window) {
  if (!window) return ''
  const sameDay = window.fromWib.slice(0, 10) === window.toWib.slice(0, 10)
  return `${window.fromWib.replace('T', ' ')} – ${sameDay ? window.toWib.slice(11) : window.toWib.replace('T', ' ')} WIB`
}

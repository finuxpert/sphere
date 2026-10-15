/** Custom incident window is always Asia/Jakarta (UTC+07:00), regardless of browser timezone.
 * End minute is inclusive in the UI; API end is one minute later, exclusive.
 */
const MINUTE = 60_000
const MAX_DURATION = 24 * 60 * MINUTE
const HISTORY = 90 * 24 * 60 * MINUTE
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

export function wibMinuteInput(value) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(value)
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}T${byType.hour}:${byType.minute}`
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
  if (until - from > MAX_DURATION) return { error: 'Maksimal rentang custom adalah 24 jam.' }
  if (from < now - HISTORY) return { error: 'Data historis dibatasi sampai 90 hari.' }
  if (until > now + MINUTE) return { error: 'Waktu selesai tidak boleh melebihi waktu sekarang.' }
  return {
    from_at: new Date(from).toISOString(),
    to_at: new Date(until).toISOString(),
    fromWib: startInput,
    toWib: endInput,
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

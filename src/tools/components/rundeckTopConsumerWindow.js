/** Source window tools shared by Monitoring and its offline regression tests.
 * datetime-local controls are explicitly interpreted as Asia/Jakarta (UTC+07),
 * independent of the browser's local timezone.
 */
const WIB_MS = 7 * 60 * 60 * 1000
const MIN_WINDOW_MS = 10 * 60 * 1000
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000
const WIB_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

export function toWibInputValue(timestamp) {
  const date = new Date(Number(timestamp))
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() + WIB_MS).toISOString().slice(0, 16) : ''
}

function fromWibInputValue(value) {
  if (!WIB_INPUT_PATTERN.test(value || '')) return null
  const timestamp = Date.parse(value + ':00+07:00')
  return Number.isFinite(timestamp) && toWibInputValue(timestamp) === value ? timestamp : null
}

export function validateCustomWib(fromLocal, toLocal, nowMs = Date.now()) {
  const from = fromWibInputValue(fromLocal)
  const to = fromWibInputValue(toLocal)
  if (from === null || to === null) {
    return { ok: false, error: 'Choose valid start and end times in WIB' }
  }
  const span = to - from
  if (span < MIN_WINDOW_MS || span > MAX_WINDOW_MS) {
    return { ok: false, error: 'Custom window must be 10 minutes to 24 hours' }
  }
  if (to > nowMs + 2 * 60_000) {
    return { ok: false, error: 'End time cannot be in the future' }
  }
  return { ok: true, from_at: new Date(from).toISOString(), to_at: new Date(to).toISOString() }
}

function validRankRow(row) {
  return row && ['JOB', 'PROGRAM'].includes(row.consumer_type) &&
    typeof row.consumer_key === 'string' && row.consumer_key.trim() &&
    Number.isFinite(row.value) && row.value >= 0 &&
    Number.isSafeInteger(row.observations) && row.observations > 0 &&
    Number.isSafeInteger(row.collection_checks) && row.collection_checks > 0 &&
    row.collection_checks <= row.observations &&
    Number.isSafeInteger(row.aggregate_observations) && row.aggregate_observations >= 0 &&
    row.aggregate_observations <= row.observations
}

export function verifiedTopConsumers(payload, expectedRange) {
  if (!payload || payload.range !== expectedRange ||
    !Number.isFinite(Date.parse(payload.start || '')) ||
    !Number.isFinite(Date.parse(payload.end || '')) ||
    Date.parse(payload.end) <= Date.parse(payload.start) ||
    !Number.isSafeInteger(payload.complete_checks) || payload.complete_checks < 0 ||
    !Number.isSafeInteger(payload.observed_workloads) || payload.observed_workloads < 0 ||
    !['ALL_OBSERVED_ACTIVE_WORKLOADS', 'TOP_CONSUMERS_ONLY'].includes(payload.coverage_scope)) return null
  for (const key of ['cpu', 'memory']) {
    const records = payload[key]
    if (!Array.isArray(records) || records.length > 10 ||
      records.some(row => !validRankRow(row))) return null
    if (records.some((row, i) => i > 0 && row.value > records[i - 1].value)) return null
  }
  return payload
}

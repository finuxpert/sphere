// SAP Issues fetch results are independent: a failed source is not a healthy check.
export const SAP_ISSUE_SOURCE_NAMES = Object.freeze(['incidents', 'hosts', 'availability', 'readiness'])
export const SAP_ISSUE_SOURCE_LABELS = Object.freeze({
  incidents: 'Incident history',
  hosts: 'APP performance',
  availability: 'SAP availability',
  readiness: 'SM37 readiness',
})

export function settleSapIssueSources(results = []) {
  const data = {}
  const failed = []
  SAP_ISSUE_SOURCE_NAMES.forEach((name, index) => {
    const result = results[index]
    const valid = result?.status === 'fulfilled' && result.value != null && typeof result.value === 'object'
    data[name] = valid ? result.value : null
    if (!valid) failed.push(name)
  })
  return { data, failed }
}

export function unavailableSapIssueIndicators(failed = []) {
  return failed.map((name) => ({
    scope: 'Data source',
    indicator: SAP_ISSUE_SOURCE_LABELS[name] || name,
    status: 'UNKNOWN',
    current: 'Unavailable',
    reason: 'Check API response; no current status inferred',
  }))
}

/** Latest-ready rows must still be current and from the reported collection. */
export function sapIssueSampleFreshness(hostsPayload, host, nowMs = Date.now(), staleAfterMinutes = 20) {
  if (!hostsPayload || !host || !host.collection_id ||
      String(host.collection_id) !== String(hostsPayload.collection_id || '')) return 'UNKNOWN'
  const at = host.collected_at
  const sampleTime = typeof at === 'string' && at.trim() ? Date.parse(at) : NaN
  if (!Number.isFinite(sampleTime) || !Number.isFinite(nowMs)) return 'UNKNOWN'
  const age = nowMs - sampleTime
  if (age < -120000) return 'UNKNOWN'
  return age > staleAfterMinutes * 60000 ? 'STALE' : 'FRESH'
}

/** Service Availability uses the same 20-minute UI stale default as its panel. */
export function sapIssueTimestampFreshness(at, nowMs = Date.now(), staleAfterMinutes = 20) {
  const time = typeof at === 'string' && at.trim() ? Date.parse(at) : NaN
  if (!Number.isFinite(time) || !Number.isFinite(nowMs) || nowMs - time < -120000) return 'UNKNOWN'
  return nowMs - time >= staleAfterMinutes * 60000 ? 'STALE' : 'FRESH'
}

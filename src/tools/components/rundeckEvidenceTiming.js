// Only compare documented timestamps; source alignment does not imply a job start or cause.
const validDate = value => {
  if (!value || typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function issueWorkloadTimePair(payload = {}) {
  const issueAt = payload?.incident?.signal_active_since || null
  const workloadAt = payload?.selected_workload?.correlation_observed_at || null
  const issueTime = validDate(issueAt)
  const workloadTime = validDate(workloadAt)
  const rawThreshold = payload?.alignment?.threshold_minutes
  const threshold = rawThreshold == null || rawThreshold === '' ? null : Number(rawThreshold)
  const thresholdMinutes = Number.isFinite(threshold) && threshold > 0 ? threshold : null
  const deltaMinutes = issueTime === null || workloadTime === null ? null
    : Math.round(Math.abs(workloadTime - issueTime) / 6000) / 10
  const direction = issueTime === null || workloadTime === null ? 'UNVERIFIED'
    : workloadTime > issueTime ? 'AFTER ISSUE'
      : workloadTime < issueTime ? 'BEFORE ISSUE' : 'SAME TIME'
  const referenceSource = (payload?.alignment?.sources || []).some(source => source?.name === 'Selected Time') ? 'Selected Time' : 'Issue Start'
  const noOverlap = payload?.alignment?.state === 'NO OVERLAP'
  const state = noOverlap ? 'NO OVERLAP'
    : deltaMinutes === null || thresholdMinutes === null ? 'INSUFFICIENT DATA'
      : deltaMinutes <= thresholdMinutes ? 'WITHIN WINDOW' : 'OUTSIDE WINDOW'
  return { state, issueAt, workloadAt, deltaMinutes, direction, thresholdMinutes, referenceSource,
    firstSeen: payload?.selected_workload?.first_seen || null,
    lastSeen: payload?.selected_workload?.last_seen || null }
}

/** Short human duration for saved timing gaps; does not infer SAP execution start or cause. */
export function formatDurationMinutes(value) {
  if (value === null || value === undefined || value === '') return '—'
  const minutes = Number(value)
  if (!Number.isFinite(minutes) || minutes < 0) return '—'
  const rounded = Math.round(minutes)
  const days = Math.floor(rounded / 1440)
  const hours = Math.floor((rounded % 1440) / 60)
  const remain = rounded % 60
  if (days) return [days + 'd', hours ? hours + 'h' : '', remain ? remain + 'm' : ''].filter(Boolean).join(' ')
  if (hours) return [hours + 'h', remain ? remain + 'm' : ''].filter(Boolean).join(' ')
  return rounded + 'm'
}

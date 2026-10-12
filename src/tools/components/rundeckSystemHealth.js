import { hostResourceState, sapWorkloadState } from './rundeckStatusSemantics.js'

const normalize = (value) => String(value || 'UNKNOWN').toUpperCase()

export function systemHealthState(hosts = [], {
  availabilityState = 'UNKNOWN',
  serviceCritical = false,
  stale = false,
  availabilityStale = false,
} = {}) {
  const resourceStates = hosts.map((host) => hostResourceState(host))
  const workloadStates = hosts.map((host) => sapWorkloadState(host))
  const availability = normalize(availabilityState)

  if (serviceCritical || availability === 'CRITICAL' || resourceStates.includes('CRITICAL')) return 'CRITICAL'
  if (resourceStates.includes('WARNING') || stale || availabilityStale) return 'WARNING'
  if (availability === 'ATTENTION' || workloadStates.some((state) => state === 'ATTENTION' || state === 'CRITICAL')) return 'ATTENTION'

  if (!hosts.length && availability === 'UNKNOWN') return 'UNKNOWN'
  if (availability === 'UNKNOWN') return 'ATTENTION'
  // A missing SAP WP or host resource sample must not be labeled NORMAL.
  if (resourceStates.includes('UNKNOWN') || workloadStates.includes('UNKNOWN')) return 'UNKNOWN'
  return 'NORMAL'
}

/** Interpret only verified observations already displayed by the parent SAP Data panel. */
export function deriveSystemHealthEvidence({ hosts = [], availability = null, quality = null, collector = {} } = {}) {
  const performanceEvidenceStale = quality?.performanceValid !== true
  const availabilityEvidenceStale = quality?.availabilityValid !== true
  const collectorUnreliable = Boolean(quality?.collectorBad) ||
    ['ERROR','CRITICAL','RECOVERY_FAILED'].includes(normalize(collector.poller_status)) ||
    ['ERROR','CRITICAL','RECOVERY_FAILED'].includes(normalize(collector.watchdog_status))
  const observedHosts = performanceEvidenceStale || collectorUnreliable ? [] : hosts
  const savedAvailability = normalize(availability?.summary?.service_state || availability?.summary?.sap_state)
  const observedAvailability = availabilityEvidenceStale ? 'UNKNOWN' : savedAvailability
  const appDown = (availability?.sap_app || []).some(row => normalize(row?.status) === 'DOWN')
  const hanaDown = (availability?.hana_system_db || []).some(row => normalize(row?.name) === 'PRIMARY' && normalize(row?.status) === 'DOWN')
  const web = availability?.web_dispatcher || []
  const webDown = web.length > 0 && web.every(row => normalize(row?.status) === 'DOWN')
  const observedImpact = !availabilityEvidenceStale && (appDown || hanaDown || webDown)
  const state = !quality || quality.state === 'UNKNOWN' ? 'UNKNOWN' : systemHealthState(observedHosts, {
    availabilityState: observedAvailability, serviceCritical: observedImpact,
    stale: performanceEvidenceStale || collectorUnreliable, availabilityStale: availabilityEvidenceStale,
  })
  return { state, observedHosts, observedAvailability, observedImpact, performanceEvidenceStale, availabilityEvidenceStale, collectorUnreliable }
}

/** A freshness warning is evidence quality, never an inferred SAP service failure. */
export function availabilityFreshnessSignal(ageMinutes = null) {
  const minutes = typeof ageMinutes === 'number' && Number.isFinite(ageMinutes) && ageMinutes >= 0
    ? Math.floor(ageMinutes) : null
  return minutes === null
    ? {
        level: 'WARNING',
        text: 'Availability observation missing',
        detail: 'No recent Availability observation was verified. This does not mean SAP DOWN.',
      }
    : {
        level: 'WARNING',
        text: `Availability data old · ${minutes}m`,
        detail: `Last Availability observation was ${minutes} minutes ago and is outside the freshness window. This does not mean SAP DOWN.`,
      }
}

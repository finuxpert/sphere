import { hostResourceState, sapWorkloadState } from './rundeckStatusSemantics.js'

const normalize = (value) => String(value || 'UNKNOWN').toUpperCase()

export function systemHealthState(hosts = [], {
  availabilityState = 'UNKNOWN',
  stale = false,
  aligned = true,
} = {}) {
  if (!aligned || stale) return 'WARNING'

  const resourceStates = hosts.map((host) => hostResourceState(host))
  const workloadStates = hosts.map((host) => sapWorkloadState(host))
  const availability = normalize(availabilityState)

  if (availability === 'CRITICAL' || resourceStates.includes('CRITICAL')) return 'CRITICAL'
  if (resourceStates.includes('WARNING')) return 'WARNING'
  if (availability === 'ATTENTION' || workloadStates.some((state) => state === 'ATTENTION' || state === 'CRITICAL')) return 'ATTENTION'

  if (!hosts.length && availability === 'UNKNOWN') return 'UNKNOWN'
  if (availability === 'UNKNOWN') return 'ATTENTION'
  return 'NORMAL'
}

import { hostResourceState, sapWorkloadState } from './rundeckStatusSemantics.js'

const normalize = (value) => String(value || 'UNKNOWN').toUpperCase()

export function systemHealthState(hosts = [], {
  availabilityState = 'UNKNOWN',
  serviceCritical = false,
  stale = false,
  aligned = true,
} = {}) {
  const resourceStates = hosts.map((host) => hostResourceState(host))
  const workloadStates = hosts.map((host) => sapWorkloadState(host))
  const availability = normalize(availabilityState)

  if (serviceCritical || availability === 'CRITICAL' || resourceStates.includes('CRITICAL')) return 'CRITICAL'
  if (!aligned || stale || resourceStates.includes('WARNING')) return 'WARNING'
  if (availability === 'ATTENTION' || workloadStates.some((state) => state === 'ATTENTION' || state === 'CRITICAL')) return 'ATTENTION'

  if (!hosts.length && availability === 'UNKNOWN') return 'UNKNOWN'
  if (availability === 'UNKNOWN') return 'ATTENTION'
  return 'NORMAL'
}

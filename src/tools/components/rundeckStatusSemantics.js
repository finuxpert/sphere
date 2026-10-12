// One set of operator limits for APP, System Health and Infrastructure.
// These are display/status thresholds, not SM37 job execution results.
export const OPERATOR_THRESHOLDS = Object.freeze({
  cpu: Object.freeze({ warning: 75, critical: 90 }),
  ram: Object.freeze({ warning: 80, critical: 90 }),
  ioWait: Object.freeze({ warning: 10, critical: 20 }),
  criticalWp: Object.freeze({ attention: 1, critical: 3 }),
  filesystem: Object.freeze({ warning: 75, critical: 90 }),
})

const numeric = (value) => {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

const explicitState = (value, allowed) => {
  const state = String(value || '').toUpperCase()
  return allowed.includes(state) ? state : ''
}

/** Strictly classify a host metric; missing values cannot become 0% or NORMAL. */
export function metricResourceState(value, metric) {
  const limits = OPERATOR_THRESHOLDS[metric]
  const number = numeric(value)
  if (!limits || number === null) return 'UNKNOWN'
  if (number >= limits.critical) return 'CRITICAL'
  if (number >= limits.warning) return 'WARNING'
  return 'NORMAL'
}

export function hostResourceState(host = {}) {
  const states = [
    metricResourceState(host.cpu_pct, 'cpu'),
    metricResourceState(host.ram_pct, 'ram'),
    metricResourceState(host.io_wait_pct ?? host.iowait_pct, 'ioWait'),
  ]
  if (states.includes('CRITICAL')) return 'CRITICAL'
  if (states.includes('WARNING')) return 'WARNING'
  if (states.includes('UNKNOWN')) return 'UNKNOWN'
  return 'NORMAL'
}

export function sapWorkloadState(host = {}) {
  const wp = numeric(host.wp_critical)
  if (wp === null) return explicitState(host.sap_workload_state, ['ATTENTION', 'CRITICAL']) || 'UNKNOWN'
  if (wp >= OPERATOR_THRESHOLDS.criticalWp.critical) return 'CRITICAL'
  if (wp >= OPERATOR_THRESHOLDS.criticalWp.attention) return 'ATTENTION'
  return 'NORMAL'
}


/** Return UNKNOWN for missing/invalid filesystem readings instead of treating them as 0%. */
export function filesystemResourceState(usedPct) {
  const used = numeric(usedPct)
  if (used === null || used < 0) return 'UNKNOWN'
  if (used >= OPERATOR_THRESHOLDS.filesystem.critical) return 'CRITICAL'
  if (used >= OPERATOR_THRESHOLDS.filesystem.warning) return 'ATTENTION'
  return 'NORMAL'
}

export function overallOperationalState(hosts = [], options = {}) {
  const { stale = false, incidentActive = false } = options
  if (!hosts.length) return 'WAITING'

  const resourceStates = hosts.map(hostResourceState)
  const workloadStates = hosts.map(sapWorkloadState)
  if (resourceStates.includes('CRITICAL') || workloadStates.includes('CRITICAL')) return 'CRITICAL'
  if (resourceStates.includes('WARNING') || stale) return 'WARNING'
  if (workloadStates.includes('ATTENTION') || incidentActive) return 'ATTENTION'
  if (resourceStates.includes('UNKNOWN') || workloadStates.includes('UNKNOWN')) return 'WAITING'
  return 'NORMAL'
}

export function statusExplanation(status, hosts = []) {
  const resourceStates = hosts.map(hostResourceState)
  if (status === 'CRITICAL') {
    if (resourceStates.includes('CRITICAL')) return 'Critical host resource threshold detected.'
    return 'Critical SAP workload signal detected; host resource health is shown separately.'
  }
  if (status === 'WARNING') return 'Host resource warning threshold or monitoring freshness warning detected.'
  if (status === 'ATTENTION') return 'Host resources are within thresholds; SAP workload signal requires review.'
  if (status === 'NORMAL') return 'Host resources and SAP workload signals are within normal thresholds.'
  return 'Monitoring status is waiting for complete data.'
}

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
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const explicitState = (value, allowed) => {
  const state = String(value || '').toUpperCase()
  return allowed.includes(state) ? state : ''
}

export function hostResourceState(host = {}) {
  const explicit = explicitState(host.resource_health || host.health, ['NORMAL', 'WARNING', 'CRITICAL'])
  if (explicit && host.resource_health) return explicit

  const cpu = numeric(host.cpu_pct)
  const ram = numeric(host.ram_pct)
  const ioWait = numeric(host.io_wait_pct)
  if ([cpu, ram, ioWait].every(value => value === null)) return 'UNKNOWN'
  if ((cpu !== null && cpu >= OPERATOR_THRESHOLDS.cpu.critical) ||
      (ram !== null && ram >= OPERATOR_THRESHOLDS.ram.critical) ||
      (ioWait !== null && ioWait >= OPERATOR_THRESHOLDS.ioWait.critical)) return 'CRITICAL'
  if ((cpu !== null && cpu >= OPERATOR_THRESHOLDS.cpu.warning) ||
      (ram !== null && ram >= OPERATOR_THRESHOLDS.ram.warning) ||
      (ioWait !== null && ioWait >= OPERATOR_THRESHOLDS.ioWait.warning)) return 'WARNING'
  return 'NORMAL'
}

export function sapWorkloadState(host = {}) {
  const explicit = explicitState(host.sap_workload_state, ['NORMAL', 'ATTENTION', 'CRITICAL'])
  if (explicit) return explicit

  const wp = numeric(host.wp_critical)
  if (wp === null) return 'UNKNOWN'
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

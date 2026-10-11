import { shortHost } from './sapUiFormat.js'
import { infrastructureTelemetryFreshness } from './infrastructureFreshness.js'

const numeric = value => value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null)

export function appSignalState(host = {}, verified = true) {
  if (!verified) return 'UNKNOWN'
  const cpu = numeric(host.cpu_pct)
  const ram = numeric(host.ram_pct)
  const io = numeric(host.io_wait_pct)
  const wpValue = numeric(host.wp_critical)
  if ([cpu, ram, io, wpValue].every(value => value === null)) return 'UNKNOWN'
  const wp = wpValue || 0
  if ((cpu !== null && cpu >= 90) || (ram !== null && ram >= 90) || (io !== null && io >= 10) || wp >= 3) return 'CRITICAL'
  if ((cpu !== null && cpu >= 75) || (ram !== null && ram >= 75) || (io !== null && io >= 5)) return 'WARNING'
  return wp > 0 ? 'ATTENTION' : 'NORMAL'
}

export function matchedInfrastructureHost(sapHost, infraHosts = []) {
  const raw = String(sapHost?.host || '').trim().toUpperCase()
  const exact = infraHosts.find(row => String(row.host || '').trim().toUpperCase() === raw)
  if (exact) return exact
  const key = shortHost(raw)
  const candidates = infraHosts.filter(row => shortHost(row.host) === key)
  if (candidates.length === 1) return candidates[0]
  const aopCandidates = candidates.filter(row => /^AOPH[1-9]\d*PAPPDC$/i.test(String(row.host || '')))
  return aopCandidates.length === 1 ? aopCandidates[0] : null
}

export function hostInfrastructureEvidence(sapHost, infraHosts = [], filesystems = [], nowMs = Date.now()) {
  const infra = matchedInfrastructureHost(sapHost, infraHosts)
  const rows = infra ? filesystems.filter(item => item.host === infra.host) : []
  const freshness = infrastructureTelemetryFreshness(infra?.snapshot_ts, infra?.collection_id, rows, nowMs)
  const topFs = rows.filter(row => numeric(row.used_pct) !== null)
    .sort((a, b) => Number(b.used_pct) - Number(a.used_pct))[0] || null
  const rawState = topFs ? Number(topFs.used_pct) >= 90 ? 'CRITICAL' : Number(topFs.used_pct) >= 80 ? 'ATTENTION' : 'NORMAL' : 'UNKNOWN'
  const state = freshness === 'FRESH' ? rawState : freshness
  return { infra, freshness, state, topFs }
}

export function chooseUnifiedApp(appHosts, contextHost, manualSelection, contextToken, preferredHost) {
  const keys = appHosts.map(host => shortHost(host?.host || ''))
  const focused = shortHost(contextHost)
  const manual = manualSelection?.contextToken === contextToken ? shortHost(manualSelection.host) : ''
  const preferred = shortHost(preferredHost)
  return [manual, focused, preferred, ...keys].find(key => key && keys.includes(key)) || ''
}

/** Operational APP AOP hosts are the primary view; other sources stay reachable. */
export function splitInfrastructureHosts(hosts = []) {
  const primary = []
  const others = []
  for (const row of hosts) {
    if (/^AOPH[1-9]\d*PAPPDC$/i.test(String(row?.host || ''))) primary.push(row)
    else others.push(row)
  }
  return { primary: primary.length ? primary : hosts, others: primary.length ? others : [] }
}

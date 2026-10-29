import { shortHost } from './sapUiFormat.js'
import { infrastructureTelemetryFreshness } from './infrastructureFreshness.js'
import { hostResourceState, sapWorkloadState, filesystemResourceState, metricResourceState } from './rundeckStatusSemantics.js'

const numeric = value => value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null)

// Per-APP freshness is independent of a READY collection and Infrastructure FS.
// Reject missing, future, and retained stale host samples rather than displaying
// their CPU/RAM/WP as current. Use the same 15 minute APP freshness window as
// the source quality check, with a 60 second tolerated clock difference.
export function appSampleFreshness(host = {}, sourceVerified = false, nowMs = Date.now()) {
  if (!sourceVerified) return 'UNKNOWN'
  const observedAt = host?.collected_at ? Date.parse(host.collected_at) : NaN
  if (!Number.isFinite(observedAt) || observedAt > nowMs + 60_000) return 'UNKNOWN'
  return nowMs - observedAt >= 15 * 60_000 ? 'STALE' : 'FRESH'
}
export const currentAppSample = (host, sourceVerified, nowMs) =>
  appSampleFreshness(host, sourceVerified, nowMs) === 'FRESH'

export function appSignalState(host = {}, verified = true) {
  if (!verified) return 'UNKNOWN'
  const resource = hostResourceState(host)
  const sap = sapWorkloadState(host)
  if (resource === 'CRITICAL' || sap === 'CRITICAL') return 'CRITICAL'
  if (resource === 'WARNING') return 'WARNING'
  if (sap === 'ATTENTION') return 'ATTENTION'
  // A partially sampled host is not necessarily healthy.
  if (resource === 'UNKNOWN' || sap === 'UNKNOWN') return 'UNKNOWN'
  return 'NORMAL'
}

export function appSignalReason(host = {}, verified = true) {
  if (!verified) return 'SAP snapshot unverified'
  const metrics = [
    { name: 'CPU', value: host.cpu_pct, type: 'cpu' },
    { name: 'RAM', value: host.ram_pct, type: 'ram' },
    { name: 'I/O wait', value: host.io_wait_pct ?? host.iowait_pct, type: 'ioWait' },
  ]
  const showMetric = state => {
    const row = metrics.find(metric => metricResourceState(metric.value, metric.type) === state)
    return row ? `${row.name} ${Number(row.value).toLocaleString('en-US',{maximumFractionDigits:1})}%` : ''
  }
  const criticalResource = showMetric('CRITICAL')
  if (criticalResource) return criticalResource
  const wp = sapWorkloadState(host)
  if (wp === 'CRITICAL') return `Critical WP ${host.wp_critical}`
  const warningResource = showMetric('WARNING')
  if (warningResource) return warningResource
  if (wp === 'ATTENTION') return `Critical WP ${host.wp_critical}`
  if (hostResourceState(host) === 'UNKNOWN' || wp === 'UNKNOWN') return 'Incomplete SAP metrics'
  return 'Within SAP thresholds'
}
/** Format only source-provided filesystem capacity (bytes), never estimate missing values. */
/** Identify the observed mount source without inferring shared physical storage. */
export function filesystemMountSource(row = {}) {
  const device = String(row?.device || row?.filesystem || '').trim()
  if (/^[^:\s]+:\/\S+/.test(device)) return 'NFS'
  if (device.startsWith('/dev/mapper/')) return 'Mapper'
  return 'Mount'
}

export function filesystemCapacitySummary(row = {}) {
  const gib = value => {
    if (value === null || value === undefined || String(value).trim() === '') return ''
    const bytes = Number(value)
    if (!Number.isFinite(bytes) || bytes < 0) return ''
    return `${(bytes / (1024 ** 3)).toLocaleString('en-US', { maximumFractionDigits: 1 })} GiB`
  }
  const total = gib(row?.total_bytes)
  const available = gib(row?.avail_bytes)
  return [total && `Total ${total}`, available && `Available ${available}`].filter(Boolean).join(' · ')
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

/** Keep filesystem samples tied to the exact Infrastructure host and collection. */
export function filesystemSamplesForHost(infra, filesystems = []) {
  if (!infra?.host || !infra?.collection_id) return []
  return filesystems.filter(row =>
    String(row?.host || '').trim().toUpperCase() === String(infra.host).trim().toUpperCase()
    && String(row?.collection_id || '') === String(infra.collection_id))
}

export function hostInfrastructureEvidence(sapHost, infraHosts = [], filesystems = [], nowMs = Date.now()) {
  const infra = matchedInfrastructureHost(sapHost, infraHosts)
  const rows = filesystemSamplesForHost(infra, filesystems)
  const freshness = infrastructureTelemetryFreshness(infra?.snapshot_ts, infra?.collection_id, rows, nowMs)
  const topFs = rows.filter(row => numeric(row.used_pct) !== null)
    .sort((a, b) => Number(b.used_pct) - Number(a.used_pct))[0] || null
  const rawState = topFs ? filesystemResourceState(topFs.used_pct) : 'UNKNOWN'
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

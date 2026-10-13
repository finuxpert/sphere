import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { formatWib, shortHost } from './sapUiFormat.js'
import { appSignalState, appSignalReason, chooseUnifiedApp, hostInfrastructureEvidence, matchedInfrastructureHost, filesystemCapacitySummary, filesystemMountSource } from './rundeckUnifiedHost.js'
import { metricResourceState, sapWorkloadState } from './rundeckStatusSemantics.js'

const API = import.meta.env.BASE_URL + 'api'
const KEY = 'sphere.live.host'
const metric = (value, unit = '') => value == null || value === '' || !Number.isFinite(Number(value))
  ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 }) + unit

async function readJson(path, signal) {
  const response = await fetch(API + path, { cache: 'no-store', signal })
  if (!response.ok) throw new Error('Infrastructure summary unavailable (' + response.status + ')')
  return response.json()
}

export default function RundeckUnifiedAppInfrastructure({
  hosts = [], sourceQuality = null, refreshToken = '', selectedJob = null,
  focusRequest = null, onInspectApp = null, onSelectApp = null,
}) {
  const [preferredHost, setPreferredHost] = React.useState(() => {
    try { return window.localStorage.getItem(KEY) || '' } catch { return '' }
  })
  const [manualSelection, setManualSelection] = React.useState(null)
  const [infraSnapshot, setInfraSnapshot] = React.useState({ hosts: [], filesystems: [], hostsError: '', filesystemsError: '' })
  const [infraRetry, setInfraRetry] = React.useState(0)
  const [nowMs, setNowMs] = React.useState(() => Date.now())

  React.useEffect(() => {
    const update = () => setNowMs(Date.now())
    const timer = window.setInterval(update, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    let retryTimer
    Promise.allSettled([
      readJson('/infra/hosts', controller.signal),
      readJson('/infra/filesystems', controller.signal),
    ]).then(([hostsResult, filesystemsResult]) => {
      if (controller.signal.aborted) return
      const hostsError = hostsResult.status === 'rejected' ? String(hostsResult.reason?.message || 'Hosts unavailable') : ''
      const filesystemsError = filesystemsResult.status === 'rejected' ? String(filesystemsResult.reason?.message || 'Filesystems unavailable') : ''
      setInfraSnapshot(previous => ({
        hosts: hostsError ? previous.hosts : (hostsResult.value.items || []),
        filesystems: filesystemsError ? previous.filesystems : (filesystemsResult.value.items || []),
        hostsError, filesystemsError,
      }))
      if (hostsError || filesystemsError) retryTimer = window.setTimeout(() => setInfraRetry(value => value + 1), 60_000)
    })
    return () => { controller.abort(); window.clearTimeout(retryTimer) }
  }, [refreshToken, infraRetry])

  const focusHost = focusRequest?.host || selectedJob?.host || ''
  const contextToken = String(focusRequest?.token || '') + ':' + String(focusHost)
  const appKey = chooseUnifiedApp(hosts, focusHost, manualSelection, contextToken, preferredHost)
  const performanceVerified = sourceQuality?.performanceValid === true && !sourceQuality?.collectorBad
  const visibleStates = hosts.map(host => appSignalState(host, performanceVerified))
  const attentionCount = visibleStates.filter(value => value === 'ATTENTION' || value === 'WARNING').length
  const criticalCount = visibleStates.filter(value => value === 'CRITICAL').length
  const highest = field => [...hosts].filter(host => host[field] != null && Number.isFinite(Number(host[field])))
    .sort((a, b) => Number(b[field]) - Number(a[field]))[0] || null
  const highCpu = highest('cpu_pct')
  const highRam = highest('ram_pct')
  const highWp = highest('wp_critical')
  const highWpHosts = highWp ? hosts.filter(row => Number(row.wp_critical) === Number(highWp.wp_critical)).map(row => shortHost(row.host)).join('/') : '—'
  const selectApp = key => {
    setManualSelection({ host: key, contextToken })
    const sapTarget = hosts.find(host => shortHost(host.host) === key)
    const target = sapTarget ? matchedInfrastructureHost(sapTarget, infraSnapshot.hosts) : null
    if (target?.host) {
      setPreferredHost(target.host)
      try { window.localStorage.setItem(KEY, target.host) } catch { /* optional preference */ }
    }
  }


  const selectedHost = hosts.find(row => shortHost(row.host) === appKey) || null
  const sapState = selectedHost ? appSignalState(selectedHost, performanceVerified) : 'UNKNOWN'
  const selectedInfraEvidence = selectedHost
    ? hostInfrastructureEvidence(selectedHost, infraSnapshot.hosts, infraSnapshot.filesystems, nowMs)
    : null
  const infraUnverified = Boolean(infraSnapshot.hostsError || infraSnapshot.filesystemsError)
  const selectedInfra = infraUnverified && selectedInfraEvidence
    ? { ...selectedInfraEvidence, state: 'UNVERIFIED', freshness: 'UNVERIFIED' }
    : selectedInfraEvidence
  const mountPoint = String(selectedInfra?.topFs?.mount_point || '').trim()
  const mountNote = mountPoint
    ? filesystemMountSource(selectedInfra.topFs) + ' ' + mountPoint : 'Mount unverified'
  const fsDetails = [
    'Filesystem used ' + (selectedInfra?.topFs ? metric(selectedInfra.topFs.used_pct, '%') : '—'),
    'Infrastructure ' + (selectedInfra?.state || 'UNKNOWN'),
    'Source ' + (selectedInfra?.infra?.host || 'unverified'),
    'Mount ' + (mountPoint || 'unverified'),
    'Device ' + (String(selectedInfra?.topFs?.device || selectedInfra?.topFs?.filesystem || '').trim() || 'unverified'),
    filesystemCapacitySummary(selectedInfra?.topFs),
    selectedInfra?.topFs?.collected_at ? 'Observed ' + formatWib(selectedInfra.topFs.collected_at, true) + ' WIB' : '',
    'Filesystem threshold: Attention 75% · Critical 90%',
    'SAP and Infrastructure statuses are independent',
  ].filter(Boolean).join(' · ')
  const openSelectedAnalysis = () => {
    if (!selectedHost) return
    onInspectApp?.({ ...selectedHost, infraHost: selectedInfra?.infra?.host || '' })
  }

  return <section className="rundeckUnifiedAppInfra rundeckAppHexWorkspace" aria-label="SAP App Servers and Infrastructure">
    <header className="rundeckUnifiedAppInfraHead">
      <h3 title="SAP uses CPU, RAM, I/O Wait and APP Critical WP; filesystem is separate Infrastructure telemetry."><SphereIcon name="server" /> APP Servers & Infrastructure</h3>
      <div>
        <span>{performanceVerified ? hosts.length + ' APP · ' + attentionCount + ' attention · ' + criticalCount + ' critical' : 'SAP snapshot unverified'}</span>
        {performanceVerified && <span title="Highest values across all APP hosts">Highest CPU {shortHost(highCpu?.host)} {metric(highCpu?.cpu_pct, '%')} · RAM {shortHost(highRam?.host)} {metric(highRam?.ram_pct, '%')} · Critical WP {highWpHosts} {metric(highWp?.wp_critical)}</span>}
        {infraUnverified && <span role="status" className="is-error">Infrastructure data unverified</span>}
      </div>
    </header>
    <div className="rundeckAppHexMain">
      <div className="rundeckAppHexSelectors rundeckUnifiedAppCards" role="group" aria-label="Select APP server">
        {hosts.map(host => {
          const key = shortHost(host.host)
          const state = appSignalState(host, performanceVerified)
          return <button key={host.host} type="button"
            className={'rundeckAppHexSelector is-sap-' + state.toLowerCase() + (appKey === key ? ' is-active' : '')}
            aria-label={key + ' SAP ' + state + ' · Critical WP ' + metric(host.wp_critical) + ' · Select APP'}
            title={key + ' · SAP ' + state + ' · ' + appSignalReason(host, performanceVerified) + ' · select for detail'}
            aria-pressed={appKey === key}
            onClick={() => { selectApp(key); onSelectApp?.(host.host) }}>
            <span className="rundeckAppHexShape" aria-hidden="true">
              <strong>{key}</strong>
              <small>{state === 'ATTENTION' ? 'ATTN' : state === 'WARNING' ? 'WARN' : state}</small>
              <em>WP {metric(host.wp_critical)}</em>
            </span>
          </button>
        })}
        {!hosts.length && <span className="rundeckHistoryState">No aligned APP performance snapshot.</span>}
      </div>
      {selectedHost && <div className="rundeckSelectedAppDetail" aria-label={'Selected APP ' + appKey}>
        <div className="rundeckSelectedAppIdentity">
          <strong>{appKey}</strong>
          <small className={'is-' + sapState.toLowerCase()}>SAP {sapState}</small>
          <span title={appSignalReason(selectedHost, performanceVerified)}>{appSignalReason(selectedHost, performanceVerified)}</span>
        </div>
        <div className="rundeckSelectedAppMetrics">
          <div className={'rundeckSelectedAppMetric is-' + metricResourceState(selectedHost.cpu_pct, 'cpu').toLowerCase()}>
            <small>CPU</small><strong>{metric(selectedHost.cpu_pct, '%')}</strong>
          </div>
          <div className={'rundeckSelectedAppMetric is-' + metricResourceState(selectedHost.ram_pct, 'ram').toLowerCase()}>
            <small>RAM</small><strong>{metric(selectedHost.ram_pct, '%')}</strong>
          </div>
          <div className={'rundeckSelectedAppMetric is-' + sapWorkloadState(selectedHost).toLowerCase()}>
            <small>Critical WP</small><strong>{metric(selectedHost.wp_critical)}</strong>
          </div>
          <div className={'rundeckSelectedAppMetric is-' + String(selectedInfra?.state || 'UNKNOWN').toLowerCase()} title={fsDetails}>
            <small>Filesystem</small><strong>{selectedInfra?.topFs ? metric(selectedInfra.topFs.used_pct, '%') : '—'}</strong>
          </div>
        </div>
        <div className="rundeckSelectedAppSource" title={fsDetails}>
          <small>{mountNote}</small>
          <small>FS {selectedInfra?.state || 'UNKNOWN'} · {selectedInfra?.freshness || 'UNKNOWN'}</small>
        </div>
        <button type="button" className="rundeckSelectedAppOpen" onClick={openSelectedAnalysis}
          aria-label={'Open ' + appKey + ' SAP and Infrastructure full analysis'}>Full Analysis <span aria-hidden="true">↗</span></button>
      </div>}
    </div>
  </section>
}

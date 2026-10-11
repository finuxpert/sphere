import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { shortHost } from './sapUiFormat.js'
import { appSignalState, chooseUnifiedApp, hostInfrastructureEvidence, matchedInfrastructureHost } from './rundeckUnifiedHost.js'

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
  focusRequest = null, onInspectApp = null,
}) {
  const [preferredHost, setPreferredHost] = React.useState(() => {
    try { return window.localStorage.getItem(KEY) || '' } catch { return '' }
  })
  const [manualSelection, setManualSelection] = React.useState(null)
  const [infraSnapshot, setInfraSnapshot] = React.useState({ hosts: [], filesystems: [], error: '' })
  const [nowMs, setNowMs] = React.useState(() => Date.now())

  React.useEffect(() => {
    const update = () => setNowMs(Date.now())
    const timer = window.setInterval(update, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      readJson('/infra/hosts', controller.signal),
      readJson('/infra/filesystems', controller.signal),
    ]).then(([hostData, filesystemData]) => {
      if (!controller.signal.aborted) setInfraSnapshot({
        hosts: hostData.items || [], filesystems: filesystemData.items || [], error: '',
      })
    }).catch((error) => {
      if (!controller.signal.aborted) setInfraSnapshot({ hosts: [], filesystems: [], error: error.message })
    })
    return () => controller.abort()
  }, [refreshToken, nowMs])

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
  const selectApp = key => {
    setManualSelection({ host: key, contextToken })
    const sapTarget = hosts.find(host => shortHost(host.host) === key)
    const target = sapTarget ? matchedInfrastructureHost(sapTarget, infraSnapshot.hosts) : null
    if (target?.host) {
      setPreferredHost(target.host)
      try { window.localStorage.setItem(KEY, target.host) } catch { /* optional preference */ }
    }
  }

  return <section className="rundeckUnifiedAppInfra" aria-label="SAP App Servers and Infrastructure">
    <header className="rundeckUnifiedAppInfraHead">
      <h3><SphereIcon name="server" /> APP Servers & Infrastructure</h3>
      <div>
        <span>{performanceVerified ? hosts.length + ' APP · ' + attentionCount + ' attention · ' + criticalCount + ' critical' : 'SAP snapshot unverified'}</span>
        {performanceVerified && <span>Highest CPU {shortHost(highCpu?.host)} {metric(highCpu?.cpu_pct, '%')} · RAM {shortHost(highRam?.host)} {metric(highRam?.ram_pct, '%')} · Critical WP {shortHost(highWp?.host)} {metric(highWp?.wp_critical)}</span>}
        <span>Infrastructure freshness independent</span>
        {infraSnapshot.error && <span role="status" className="is-error">Infrastructure summary unavailable</span>}
      </div>
    </header>
    <div className="rundeckUnifiedAppCards" role="group" aria-label="Select APP server">
      {hosts.map(host => {
        const key = shortHost(host.host)
        const infra = hostInfrastructureEvidence(host, infraSnapshot.hosts, infraSnapshot.filesystems, nowMs)
        const sapState = appSignalState(host, performanceVerified)
        const selected = key === appKey
        return <button key={host.host} type="button"
          className={'rundeckUnifiedAppCard is-sap-' + sapState.toLowerCase() + (selected ? ' is-active' : '')}
          aria-pressed={selected} onClick={() => { selectApp(key); onInspectApp?.({
            ...host, infraHost: infra.infra?.host || '',
          }) }}
          title={'Open ' + key + ' SAP and Infrastructure analysis · SAP ' + sapState + ' · Infrastructure ' + infra.state}>
          <span className="rundeckUnifiedAppCardTop"><b>{key}</b><em className={'is-' + sapState.toLowerCase()}>{sapState}</em></span>
          <span className="rundeckUnifiedAppCardMetrics">
            <span>CPU <strong>{metric(host.cpu_pct, '%')}</strong></span>
            <span>RAM <strong>{metric(host.ram_pct, '%')}</strong></span>
            <span>IO <strong>{metric(host.io_wait_pct, '%')}</strong></span>
            <span>WP <strong>{metric(host.wp_critical)}</strong></span>
          </span>
          <span className="rundeckUnifiedAppCardInfra">
            <small title={infra.topFs?.mount_point || 'No filesystem observation'}>FS {infra.topFs?.mount_point || '—'} · {infra.freshness}</small>
            <strong className={'is-' + infra.state.toLowerCase()}>
              {infra.topFs ? (infra.freshness === 'FRESH' ? '' : 'Last ') + metric(infra.topFs.used_pct, '%') : '—'}
            </strong>
          </span>
        </button>
      })}
      {!hosts.length && <span className="rundeckHistoryState">No aligned APP performance snapshot. Infrastructure state is not inferred.</span>}
    </div>
  </section>
}

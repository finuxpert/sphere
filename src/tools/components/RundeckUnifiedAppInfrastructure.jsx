import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import RundeckLiveOverview from './RundeckLiveOverview.jsx'
import { shortHost } from './sapUiFormat.js'
import { appSignalState, chooseUnifiedApp, hostInfrastructureEvidence } from './rundeckUnifiedHost.js'

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
  focusRequest = null, onInspectApp = null, onOpenMetric = null,
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
  const selectedApp = hosts.find(host => shortHost(host.host) === appKey)
  const selectedInfra = infraSnapshot.hosts.find(host => shortHost(host.host) === appKey)
  const performanceVerified = sourceQuality?.performanceValid === true && !sourceQuality?.collectorBad
  const selectApp = key => {
    setManualSelection({ host: key, contextToken })
    const target = infraSnapshot.hosts.find(host => shortHost(host.host) === key)
    if (target?.host) {
      setPreferredHost(target.host)
      try { window.localStorage.setItem(KEY, target.host) } catch { /* optional preference */ }
    }
  }

  return <section className="rundeckUnifiedAppInfra" aria-label="SAP App Servers and Infrastructure">
    <header className="rundeckUnifiedAppInfraHead">
      <h3><SphereIcon name="server" /> APP Servers & Infrastructure</h3>
      <div>
        <span>SAP: {performanceVerified ? 'Verified snapshot' : 'Unverified snapshot'}</span>
        <span>Infrastructure: independent freshness</span>
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
          aria-pressed={selected} onClick={() => selectApp(key)}
          title={'SAP ' + sapState + ' · Infrastructure ' + infra.state + ' · ' + host.host}>
          <span className="rundeckUnifiedAppCardTop"><b>{key}</b><em className={'is-' + sapState.toLowerCase()}>{sapState}</em></span>
          <span className="rundeckUnifiedAppCardMetrics">
            <span>CPU <strong>{metric(host.cpu_pct, '%')}</strong></span>
            <span>RAM <strong>{metric(host.ram_pct, '%')}</strong></span>
            <span>WP <strong>{metric(host.wp_critical)}</strong></span>
          </span>
          <span className="rundeckUnifiedAppCardInfra">
            <small>FS · {infra.freshness === 'FRESH' ? 'Fresh' : infra.freshness}</small>
            <strong className={'is-' + infra.state.toLowerCase()}>
              {infra.topFs ? (infra.freshness === 'FRESH' ? '' : 'Last ') + metric(infra.topFs.used_pct, '%') : '—'}
            </strong>
          </span>
        </button>
      })}
      {!hosts.length && <span className="rundeckHistoryState">No aligned APP performance snapshot. Infrastructure state is not inferred.</span>}
    </div>
    <div className="rundeckUnifiedAppInfraDetail">
      <div className="rundeckUnifiedAppInfraDetailHead">
        <span><strong>{appKey || 'APP'}</strong> · Infrastructure details</span>
        <div className="rundeckUnifiedAppActions">
          <button type="button" disabled={!performanceVerified || !selectedApp || !onInspectApp}
            onClick={() => onInspectApp?.(selectedApp)}>Inspect SAP</button>
          <button type="button" disabled={!selectedInfra || !onOpenMetric}
            onClick={() => onOpenMetric?.({ host: selectedInfra.host, metric: 'filesystem' })}>Infrastructure Analysis</button>
        </div>
      </div>
      {selectedInfra && <RundeckLiveOverview key={selectedInfra.host} initialHost={selectedInfra.host}
        refreshToken={refreshToken} embedded onOpenMetric={onOpenMetric} />}
      {!selectedInfra && <p className="rundeckUnifiedInfraMissing" role="status">
        No matching Infrastructure source for {appKey || 'this APP'}. Values are UNKNOWN, not NORMAL.
      </p>}
    </div>
  </section>
}

import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { shortHost } from './sapUiFormat.js'
import { appSignalState, appSignalReason, chooseUnifiedApp, hostInfrastructureEvidence, matchedInfrastructureHost } from './rundeckUnifiedHost.js'
import { OPERATOR_THRESHOLDS } from './rundeckStatusSemantics.js'

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

  return <section className="rundeckUnifiedAppInfra" aria-label="SAP App Servers and Infrastructure">
    <header className="rundeckUnifiedAppInfraHead">
      <h3 title="SAP status uses CPU, RAM, I/O Wait and APP Critical WP. FS is independent Infrastructure telemetry."><SphereIcon name="server" /> APP Servers & Infrastructure</h3>
      <div>
        <span>{performanceVerified ? hosts.length + ' APP · ' + attentionCount + ' attention · ' + criticalCount + ' critical' : 'SAP snapshot unverified'}</span>
        {performanceVerified && <span>Highest CPU {shortHost(highCpu?.host)} {metric(highCpu?.cpu_pct, '%')} · Highest RAM {shortHost(highRam?.host)} {metric(highRam?.ram_pct, '%')} · Critical WP {highWpHosts} {metric(highWp?.wp_critical)}</span>}
        {infraSnapshot.error && <span role="status" className="is-error">Infrastructure summary unavailable</span>}
      </div>
    </header>
    <div className="rundeckUnifiedAppCards" role="group" aria-label="Select APP server">
      {hosts.map(host => {
        const key = shortHost(host.host)
        const infra = hostInfrastructureEvidence(host, infraSnapshot.hosts, infraSnapshot.filesystems, nowMs)
        const sapState = appSignalState(host, performanceVerified)
        const selected = key === appKey
        const ioWait = host.io_wait_pct == null ? null : Number(host.io_wait_pct)
        const reason = appSignalReason(host, performanceVerified)
        const showHostNote = sapState !== 'NORMAL' || infra.freshness !== 'FRESH' || (Number.isFinite(ioWait) && ioWait >= OPERATOR_THRESHOLDS.ioWait.warning)
        return <button key={host.host} type="button"
          className={'rundeckUnifiedAppCard is-sap-' + sapState.toLowerCase() + (selected ? ' is-active' : '')}
          aria-pressed={selected} onClick={() => { selectApp(key); onInspectApp?.({
            ...host, infraHost: infra.infra?.host || '',
          }) }}
          title={'Open ' + key + ' Analysis · SAP ' + sapState + ' (' + reason + ') · Infrastructure ' + infra.state + ' · FS ' + (infra.topFs?.mount_point || 'No mount') + ' ' + metric(infra.topFs?.used_pct,'%') + ' · I/O Wait ' + metric(host.io_wait_pct, '%')}>
          <span className="rundeckUnifiedAppCardTop"><b>{key}</b><em className={'is-' + sapState.toLowerCase()}>{sapState}</em></span>
          <span className="rundeckUnifiedAppCardMetrics">
            <span className="rundeckUnifiedMetric">
              <small>CPU</small><strong>{metric(host.cpu_pct, '%')}</strong>
              <i className="rundeckUnifiedMetricTrack" aria-hidden="true"><i style={{width: host.cpu_pct == null ? '0%' : Math.min(100,Math.max(0,Number(host.cpu_pct)||0)) + '%'}} /></i>
            </span>
            <span className="rundeckUnifiedMetric">
              <small>RAM</small><strong>{metric(host.ram_pct, '%')}</strong>
              <i className="rundeckUnifiedMetricTrack" aria-hidden="true"><i style={{width: host.ram_pct == null ? '0%' : Math.min(100,Math.max(0,Number(host.ram_pct)||0)) + '%'}} /></i>
            </span>
            <span className="rundeckUnifiedMetric" title={'Critical work processes observed: ' + metric(host.wp_critical)}>
              <small>Critical WP</small><strong>{metric(host.wp_critical)}</strong>
              
            </span>
            <span className="rundeckUnifiedMetric is-infrastructure" title={'Filesystem: '+(infra.topFs?.mount_point||'unknown')+' · Infrastructure '+infra.freshness}>
              <small>FS</small><strong className={'is-'+infra.state.toLowerCase()}>{infra.topFs ? metric(infra.topFs.used_pct,'%') : '—'}</strong>
              <i className="rundeckUnifiedMetricTrack" aria-hidden="true"><i style={{width: infra.topFs?.used_pct == null ? '0%' : Math.min(100,Math.max(0,Number(infra.topFs.used_pct)||0)) + '%'}} /></i>
            </span>
          </span>
          {showHostNote && <span className="rundeckUnifiedAppCardInfra">
            <small title={infra.topFs?.mount_point || 'No filesystem observation'}>{sapState !== 'NORMAL' ? reason : ''}{infra.freshness !== 'FRESH' ? (sapState !== 'NORMAL' ? ' · ' : '') + 'Infra ' + infra.freshness : ''}{Number.isFinite(ioWait) && ioWait >= OPERATOR_THRESHOLDS.ioWait.warning ? ' · I/O wait ' + metric(ioWait,'%') : ''}</small>
          </span>}
        </button>
      })}
      {!hosts.length && <span className="rundeckHistoryState">No aligned APP performance snapshot. Infrastructure state is not inferred.</span>}
    </div>
  </section>
}

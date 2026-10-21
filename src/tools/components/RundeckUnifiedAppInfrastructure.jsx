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
  focusRequest = null, onInspectApp = null, onSelectApp = null, operationalChecks = null,
}) {
  const [preferredHost, setPreferredHost] = React.useState(() => {
    try { return window.localStorage.getItem(KEY) || '' } catch { return '' }
  })
  const [manualSelection, setManualSelection] = React.useState(null)
  const [infraSnapshot, setInfraSnapshot] = React.useState({ hosts: [], filesystems: [], hostsError: '', filesystemsError: '' })
  const [infraRetry, setInfraRetry] = React.useState(0)
  const [nowMs, setNowMs] = React.useState(() => Date.now())
  const [orbitEnabled, setOrbitEnabled] = React.useState(false)
  const [orbitExpanded, setOrbitExpanded] = React.useState(false)
  const orbitStageRef = React.useRef(null)
  const orbitWakeRef = React.useRef(null)
  const orbitExpandedRef = React.useRef(false)
  orbitExpandedRef.current = orbitExpanded

  React.useEffect(() => {
    if (hosts.length !== 5 || typeof window.matchMedia !== 'function') {
      setOrbitEnabled(false)
      return undefined
    }
    const query = window.matchMedia('(min-width:900px) and (prefers-reduced-motion: no-preference)')
    const sync = () => setOrbitEnabled(query.matches)
    sync()
    query.addEventListener?.('change', sync)
    return () => query.removeEventListener?.('change', sync)
  }, [hosts.length])

  React.useEffect(() => { orbitWakeRef.current?.() }, [orbitExpanded])

  React.useEffect(() => {
    if (!orbitEnabled || hosts.length !== 5) return undefined
    const stage = orbitStageRef.current
    const buttons = [...(stage?.querySelectorAll('.rundeckAppHexSelector') || [])]
    if (!stage || buttons.length !== 5) return undefined
    let raf = 0
    let last = 0
    let phase = -.7
    let visible = true
    const positions = buttons.map(() => ({ x: NaN, y: NaN, scale: 1 }))
    // Quiet, continuous APP orbit when idle; hover/focus settles into a fixed 3+2
    // selection layout so the host never moves away from the pointer.
    const expandedLocations = [[.14, .25], [.5, .25], [.86, .25], [.32, .77], [.68, .77]]
    const tick = time => {
      raf = 0
      if (document.hidden || !visible || !stage.isConnected) return
      // Restore original responsive APP orbit; 5 nodes use a lightweight animation frame.
      const delta = last ? Math.min((time - last) / 1000, .07) : .016
      last = time
      const expanded = orbitExpandedRef.current
      if (!expanded) phase += delta * .22
      const width = stage.clientWidth
      const height = stage.clientHeight
      const rx = Math.min(width * .35, 118)
      const ry = Math.min(height * .34, 40)
      const blend = 1 - Math.exp(-delta * (expanded ? 7 : 4.6))
      let moving = false
      buttons.forEach((button, index) => {
        const position = positions[index]
        const theta = phase + index * 2 * Math.PI / 5
        const depth = Math.sin(theta)
        const targetX = expanded ? width * expandedLocations[index][0] : width / 2 + Math.cos(theta) * rx
        const targetY = expanded ? height * expandedLocations[index][1] : height / 2 + depth * ry
        const targetScale = expanded ? 1 : .88 + .1 * (depth + 1) / 2
        position.x = Number.isFinite(position.x) ? position.x + (targetX - position.x) * blend : targetX
        position.y = Number.isFinite(position.y) ? position.y + (targetY - position.y) * blend : targetY
        position.scale += (targetScale - position.scale) * blend
        moving = moving || Math.abs(position.x - targetX) > .12 ||
          Math.abs(position.y - targetY) > .12 || Math.abs(position.scale - targetScale) > .003
        button.style.left = position.x + 'px'
        button.style.top = position.y + 'px'
        button.style.transform = 'translate(-50%,-50%) scale(' + position.scale + ')'
        button.style.zIndex = expanded ? '2' : String(depth > .15 ? 3 : 1)
      })
      // Idle keeps breathing slowly; interaction settles to stable targets.
      if (!expanded || moving) raf = window.requestAnimationFrame(tick)
    }
    const wake = () => {
      if (!raf && !document.hidden && visible) {
        last = 0
        raf = window.requestAnimationFrame(tick)
      }
    }
    orbitWakeRef.current = wake
    const viewportObserver = typeof IntersectionObserver === 'undefined' ? null :
      new IntersectionObserver(entries => {
        visible = entries.some(entry => entry.isIntersecting)
        if (visible) wake()
        else { window.cancelAnimationFrame(raf); raf = 0 }
      }, { threshold: 0 })
    viewportObserver?.observe(stage)
    document.addEventListener('visibilitychange', wake)
    wake()
    return () => {
      window.cancelAnimationFrame(raf)
      viewportObserver?.disconnect()
      document.removeEventListener('visibilitychange', wake)
      if (orbitWakeRef.current === wake) orbitWakeRef.current = null
      buttons.forEach(button => { button.style.left = ''; button.style.top = ''; button.style.transform = ''; button.style.zIndex = '' })
    }
  }, [orbitEnabled, hosts.length])

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
  const attentionCount = visibleStates.filter(value => value === 'ATTENTION').length
  const warningCount = visibleStates.filter(value => value === 'WARNING').length
  const unknownCount = visibleStates.filter(value => value === 'UNKNOWN').length
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
  const fsFresh = selectedInfra?.freshness === 'FRESH' && !infraUnverified
  const fsSampleAt = selectedInfra?.topFs?.collected_at
  const fsHistorical = !fsFresh && selectedInfra?.topFs
  const mountPoint = String(selectedInfra?.topFs?.mount_point || '').trim()
  const mountNote = mountPoint
    ? filesystemMountSource(selectedInfra.topFs) + ' ' + mountPoint : 'Mount unverified'
  const fsDetails = [
    'Highest observed filesystem used ' + (selectedInfra?.topFs ? metric(selectedInfra.topFs.used_pct, '%') : '—'),
    'Infrastructure ' + (selectedInfra?.state || 'UNKNOWN'),
    'Source ' + (selectedInfra?.infra?.host || 'unverified'),
    'Mount ' + (mountPoint || 'unverified'),
    'Device ' + (String(selectedInfra?.topFs?.device || selectedInfra?.topFs?.filesystem || '').trim() || 'unverified'),
    filesystemCapacitySummary(selectedInfra?.topFs),
    selectedInfra?.topFs?.collected_at ? 'Observed ' + formatWib(selectedInfra.topFs.collected_at, true) + ' WIB' : '',
    'Filesystem threshold: Attention 75% · Critical 90%',
    'SAP and Infrastructure statuses are independent',
  ].filter(Boolean).join(' · ')
  // Open the existing combined APP modal directly from either the hexagon or Full Analysis.
  // The Infrastructure host is strictly matched from collected evidence, never inferred.
  const openAppAnalysis = (host) => {
    if (!host?.host) return
    const infraHost = infraSnapshot.hostsError ? '' : matchedInfrastructureHost(host, infraSnapshot.hosts)?.host || ''
    onInspectApp?.({ ...host, infraHost, infraHostVerified: Boolean(infraHost) })
  }
  const openSelectedAnalysis = () => openAppAnalysis(selectedHost)

  return <section className="rundeckUnifiedAppInfra rundeckAppHexWorkspace" aria-label="SAP App Servers and Infrastructure">
    <header className="rundeckUnifiedAppInfraHead">
      <h3 title="SAP uses CPU, RAM, I/O Wait and APP Critical WP; filesystem is separate Infrastructure telemetry."><SphereIcon name="server" /> APP Servers & Infrastructure</h3>
      <div>
        <span title="Counts describe APP health classifications, not the number of Critical Work Processes. APP Critical WP is displayed separately below.">{performanceVerified ? 'APP ' + hosts.length + ' · Attention ' + attentionCount + ' · Warning ' + warningCount + ' · Critical ' + criticalCount + (unknownCount ? ' · Unknown ' + unknownCount : '') : 'SAP snapshot unverified'}</span>
        {performanceVerified && <span title={`Across verified APP samples: highest CPU ${shortHost(highCpu?.host)} ${metric(highCpu?.cpu_pct, '%')} · highest RAM ${shortHost(highRam?.host)} ${metric(highRam?.ram_pct, '%')} · Critical WP ${highWpHosts} ${metric(highWp?.wp_critical)}. Timestamp below refers only to the selected APP.`}>SAP APP sample · {appKey} · {selectedHost?.collected_at ? `${formatWib(selectedHost.collected_at, true)} WIB` : 'time unverified'}</span>}
        {infraUnverified && <span role="status" className="is-error">Infrastructure data unverified</span>}
      </div>
    </header>
    <div className="rundeckAppHexMain rundeckAppThreePanels">
      <section className="rundeckAppMotionPanel" aria-label="APP Motion">
        <h4 className="rundeckAppPanelHeading"><SphereIcon name="hexagon" /> APP Motion <small>Choose a server</small></h4>
        <div ref={orbitStageRef}
        className={'rundeckAppHexSelectors rundeckUnifiedAppCards' + (hosts.length === 5 ? ' is-honeycomb' : '') + (orbitEnabled ? ' is-sphere-orbit' + (orbitExpanded ? ' is-expanded' : '') : '')}
        role="group" aria-label="Select APP server"
        onPointerEnter={event => { if (orbitEnabled && event.pointerType !== 'touch') setOrbitExpanded(true) }}
        onPointerLeave={event => {
          if (event.pointerType !== 'touch' && !event.currentTarget.contains(document.activeElement)) setOrbitExpanded(false)
        }}
        onPointerDown={event => { if (orbitEnabled && event.pointerType === 'touch') setOrbitExpanded(true) }}
        onFocusCapture={() => setOrbitExpanded(true)}
        onBlurCapture={event => {
          if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.matches(':hover')) setOrbitExpanded(false)
        }}>
        {hosts.length === 5 && orbitEnabled && <div className="rundeckAppMotionRings" aria-hidden="true"><i /><i /><span>SPHERE<small>APP1–APP5</small></span></div>}
        {hosts.map(host => {
          const key = shortHost(host.host)
          const state = appSignalState(host, performanceVerified)
          return <button key={host.host} type="button"
            className={'rundeckAppHexSelector is-sap-' + state.toLowerCase() + (appKey === key ? ' is-active' : '')}
            aria-label={key + ' SAP ' + state + ' · Critical WP ' + metric(host.wp_critical) + ' · Select APP to see details'}
            title={key + ' · SAP ' + state + ' · ' + appSignalReason(host, performanceVerified) + ' · select APP to see details'}
            aria-pressed={appKey === key}
            onClick={() => { selectApp(key); onSelectApp?.(host.host); openAppAnalysis(host) }}>
            <span className="rundeckAppHexShape" aria-hidden="true">
              <strong>{key}</strong>
              <small>{state === 'ATTENTION' ? 'ATTN' : state === 'WARNING' ? 'WARN' : state}</small>
              <em>WP {metric(host.wp_critical)}</em>
            </span>
          </button>
        })}
        {!hosts.length && <span className="rundeckHistoryState">No aligned APP performance snapshot.</span>}
        </div>
      </section>
      <section className="rundeckAppDetailPanel" aria-label="APP Detail">
        <h4 className="rundeckAppPanelHeading"><SphereIcon name="server" /> APP Detail <small>{selectedHost ? appKey + ' selected' : 'No verified selection'}</small></h4>
        {selectedHost && <div className="rundeckSelectedAppDetail" aria-label={'Selected APP ' + appKey}>
        <div className="rundeckSelectedAppIdentity">
          <strong>{appKey}</strong>
          <small className={'is-' + sapState.toLowerCase()}>SAP {sapState}</small>
          <span title={appSignalReason(selectedHost, performanceVerified)}>{appSignalReason(selectedHost, performanceVerified)}</span>
        </div>
        <div className="rundeckSelectedAppMetrics">
          <div className={'rundeckSelectedAppMetric is-' + (performanceVerified ? metricResourceState(selectedHost.cpu_pct, 'cpu').toLowerCase() : 'unknown')}>
            <small>Host CPU</small><strong>{metric(performanceVerified ? selectedHost.cpu_pct : null, '%')}</strong>
          </div>
          <div className={'rundeckSelectedAppMetric is-' + (performanceVerified ? metricResourceState(selectedHost.ram_pct, 'ram').toLowerCase() : 'unknown')}>
            <small>Host RAM</small><strong>{metric(performanceVerified ? selectedHost.ram_pct : null, '%')}</strong>
          </div>
          <div className={'rundeckSelectedAppMetric is-' + (performanceVerified ? sapWorkloadState(selectedHost).toLowerCase() : 'unknown')}>
            <small>Critical WP</small><strong>{metric(performanceVerified ? selectedHost.wp_critical : null)}</strong>
          </div>
          <div className={'rundeckSelectedAppMetric is-' + String(selectedInfra?.state || 'UNKNOWN').toLowerCase()} title={fsDetails}>
            <small>Highest FS</small><strong>{fsFresh && selectedInfra?.topFs ? metric(selectedInfra.topFs.used_pct, '%') : '—'}</strong>
            <span className="rundeckSelectedAppFsMeta">{fsFresh ? `FS ${selectedInfra.state} · FRESH` : fsHistorical ? `Last observed ${metric(selectedInfra.topFs.used_pct, '%')} · ${selectedInfra?.freshness || 'UNKNOWN'}` : `FS ${selectedInfra?.state || 'UNKNOWN'}`}</span>
          </div>
        </div>
        <div className="rundeckSelectedAppSource" title={fsDetails}>
          <small>Infra FS · {mountNote} · {selectedInfra?.infra?.host || 'Host unverified'}</small>
          <small>{fsSampleAt ? `${fsFresh ? 'Infra sampled' : 'Last Infra sample'} ${formatWib(fsSampleAt, true)} WIB` : 'Infra sample time unavailable'} · {selectedInfra?.freshness || 'UNKNOWN'}</small>
        </div>
        <button type="button" className="rundeckSelectedAppOpen" onClick={openSelectedAnalysis}
          aria-label={'Open ' + appKey + ' SAP and Infrastructure full analysis'}>Process / Infra <span aria-hidden="true">↗</span></button>
        </div>}
        {!selectedHost && <p className="rundeckHistoryState">APP detail unavailable until a server sample is present.</p>}
      </section>
      <aside className="rundeckAppChecksPanel" aria-label="Operational Checks">
        {operationalChecks}
      </aside>
    </div>
  </section>
}

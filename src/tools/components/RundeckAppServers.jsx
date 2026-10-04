import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { shortHost } from './sapUiFormat.js'

const API = `${import.meta.env.BASE_URL}api`
const metric = (value, suffix = '') => value === null || value === undefined || value === '' ? '—' : `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}${suffix}`

const severityRank = { NORMAL: 0, ATTENTION: 1, WARNING: 2, CRITICAL: 3 }
const maxSeverity = (...values) => values.reduce((best, value) => severityRank[value] > severityRank[best] ? value : best, 'NORMAL')
const thresholdState = (value, warning, critical) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return 'NORMAL'
  if (number >= critical) return 'CRITICAL'
  if (number >= warning) return 'WARNING'
  return 'NORMAL'
}
const hostState = (host = {}) => maxSeverity(
  thresholdState(host.cpu_pct, 75, 90),
  thresholdState(host.ram_pct, 75, 90),
  thresholdState(host.io_wait_pct, 5, 10),
  Number(host.wp_critical || 0) >= 3 ? 'CRITICAL' : Number(host.wp_critical || 0) > 0 ? 'ATTENTION' : 'NORMAL',
)


export default function RundeckAppServers({ refreshToken = '', latestCollectionId = '', onInspectApp, focusRequest = null }) {
  const [state, setState] = React.useState({ items: [], error: '' })

  React.useEffect(() => {
    const controller = new AbortController()
    fetch(`${API}/history/hosts/latest`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`APP server data unavailable (${response.status})`)
        return response.json()
      })
      .then((result) => {
        const aligned = !latestCollectionId || !result.collection_id || result.collection_id === latestCollectionId
        setState({ items: aligned ? (result.items || []) : [], error: aligned ? '' : 'Waiting for aligned APP server data.' })
      })
      .catch((failure) => { if (failure.name !== 'AbortError') setState({ items: [], error: failure.message || 'APP server data unavailable.' }) })
    return () => controller.abort()
  }, [latestCollectionId, refreshToken])


  React.useEffect(() => {
    const requested = shortHost(focusRequest?.host || '')
    if (!requested || !state.items.length) return
    const host = state.items.find((item) => shortHost(item.host) === requested)
    if (!host) return
    if (!focusRequest?.highlightOnly) onInspectApp?.(host)
    if (focusRequest?.highlightOnly) return
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    let frames = 0
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const navigate = () => {
      frames += 1
      if (frames < 3) return window.requestAnimationFrame(navigate)
      const row = Array.from(document.querySelectorAll('.rundeckServerTable tr[data-app-key]'))
        .find((node) => node.dataset.appKey === requested)
      row?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' })
    }
    window.requestAnimationFrame(navigate)
  }, [focusRequest?.highlightOnly, focusRequest?.host, focusRequest?.token, onInspectApp, state.items])

  const focusedApp = shortHost(focusRequest?.host || '')
  const appStates = state.items.map((host) => ({ host, state: hostState(host) }))
  const criticalApps = appStates.filter((item) => item.state === 'CRITICAL').length
  const warningApps = appStates.filter((item) => item.state === 'WARNING' || item.state === 'ATTENTION').length
  const highestCpu = [...state.items].sort((a,b) => Number(b.cpu_pct || 0) - Number(a.cpu_pct || 0))[0]
  const highestRam = [...state.items].sort((a,b) => Number(b.ram_pct || 0) - Number(a.ram_pct || 0))[0]
  const highestWp = [...state.items].sort((a,b) => Number(b.wp_critical || 0) - Number(a.wp_critical || 0))[0]

  return <section className="rundeckServerSection rundeckServerSectionV1234" aria-label="SAP App Servers">
    <div className="rundeckSectionTitle"><h3><SphereIcon name="server" /> SAP App Servers</h3></div>
    {!state.error && state.items.length > 0 && <div className="rundeckAppServerSummary">
      <span><b>Observed</b><strong>{state.items.length} APP</strong></span>
      <span><b>Needs attention</b><strong>{warningApps}</strong></span>
      <span><b>Critical</b><strong>{criticalApps}</strong></span>
      <span><b>Highest CPU</b><strong>{shortHost(highestCpu?.host)} {metric(highestCpu?.cpu_pct,'%')}</strong></span>
      <span><b>Highest RAM</b><strong>{shortHost(highestRam?.host)} {metric(highestRam?.ram_pct,'%')}</strong></span>
      <span><b>Highest APP Critical WP</b><strong>{shortHost(highestWp?.host)} {metric(highestWp?.wp_critical)}</strong></span>
    </div>}
    {state.error && <div className="rundeckHistoryState is-error">{state.error}</div>}
    {!state.error && <div className="rundeckServerTableWrap"><table className="rundeckServerTable">
      <thead><tr><th>APP</th><th>CPU</th><th>RAM</th><th>I/O Wait</th><th>APP Critical WP</th><th>Status</th></tr></thead>
      <tbody>{state.items.map((host) => {
        const wpCount = Number(host.wp_critical || 0)
        const actionable = Boolean(onInspectApp)
        const appKey = shortHost(host.host)
        const focused = Boolean(focusedApp && appKey === focusedApp)
        const status = hostState(host)
        return <tr
            key={host.host}
            data-app-key={appKey}
            className={[actionable ? 'is-expandable' : '', focused ? 'is-cross-panel-focus' : ''].filter(Boolean).join(' ')}
            tabIndex={actionable ? 0 : undefined}
            onClick={actionable ? () => onInspectApp?.(host) : undefined}
            onKeyDown={actionable ? (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              onInspectApp?.(host)
            } : undefined}
          >
            <td><strong title={host.host}>{appKey}</strong></td>
            <td>{metric(host.cpu_pct, '%')}</td>
            <td>{metric(host.ram_pct, '%')}</td>
            <td>{metric(host.io_wait_pct, '%')}</td>
            <td className={wpCount > 0 ? (wpCount >= 3 ? 'is-critical' : 'is-attention') : ''}>{wpCount > 0 ? <><SphereIcon name="alert" /> {wpCount}</> : '0'}</td>
            <td><span className={`rundeckAppServerStatus is-${status.toLowerCase()}`}>{status}</span></td>
          </tr>
      })}{!state.items.length && <tr><td colSpan="6">No aligned APP server rows available.</td></tr>}</tbody>
    </table></div>}
  </section>
}

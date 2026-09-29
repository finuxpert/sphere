import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { shortHost } from './sapUiFormat.js'

const API = `${import.meta.env.BASE_URL}api`
const metric = (value, suffix = '') => value === null || value === undefined || value === '' ? '—' : `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}${suffix}`


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

  return <section className="rundeckServerSection rundeckServerSectionV1234" aria-label="SAP App Servers">
    <div className="rundeckSectionTitle"><h3><SphereIcon name="server" /> SAP App Servers</h3></div>
    {state.error && <div className="rundeckHistoryState is-error">{state.error}</div>}
    {!state.error && <div className="rundeckServerTableWrap"><table className="rundeckServerTable">
      <thead><tr><th>APP</th><th>CPU</th><th>Memory</th><th>I/O Wait</th><th>Critical WP</th></tr></thead>
      <tbody>{state.items.map((host) => {
        const wpCount = Number(host.wp_critical || 0)
        const actionable = Boolean(onInspectApp)
        const appKey = shortHost(host.host)
        const focused = Boolean(focusedApp && appKey === focusedApp)
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
          </tr>
      })}{!state.items.length && <tr><td colSpan="5">No aligned APP server rows available.</td></tr>}</tbody>
    </table></div>}
  </section>
}

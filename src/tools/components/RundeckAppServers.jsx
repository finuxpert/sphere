import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { shortHost } from './sapUiFormat.js'
import { hostResourceState, sapWorkloadState } from './rundeckStatusSemantics.js'

const API = `${import.meta.env.BASE_URL}api`
const metric = (value, suffix = '') => value === null || value === undefined || value === '' ? '—' : `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}${suffix}`

const pssText = (row = {}) => {
  const value = Number(row.details?.total_pss_gb ?? row.details?.pss_gb)
  return Number.isFinite(value) ? `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} GB` : '—'
}

const processText = (row = {}) => {
  const value = Number(row.details?.process_count ?? row.details?.pids?.length ?? 1)
  return Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'
}

function StatusPill({ value = 'UNKNOWN' }) {
  return <span className={`rundeckStatus rundeckStatusMotion is-${String(value).toLowerCase()}`}>{value}</span>
}

function scrollToSelectedWorkload() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  let frames = 0
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  const navigate = () => {
    frames += 1
    if (frames < 3) return window.requestAnimationFrame(navigate)
    document.querySelector('.rundeckJobHistory')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
  }
  window.requestAnimationFrame(navigate)
}

export default function RundeckAppServers({ refreshToken = '', latestCollectionId = '', onSelectJob }) {
  const [state, setState] = React.useState({ items: [], error: '' })
  const [drilldown, setDrilldown] = React.useState(null)

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
    setDrilldown(null)
  }, [latestCollectionId])

  const openWp = React.useCallback(async (host) => {
    const hostName = host?.host || ''
    const wpCount = Number(host?.wp_critical || 0)
    if (!hostName || !latestCollectionId || wpCount <= 0) return
    if (drilldown?.host === hostName) return setDrilldown(null)
    setDrilldown({ host: hostName, rows: [], loading: true, error: '' })
    try {
      const response = await fetch(`${API}/history/jobs/current?collection_id=${encodeURIComponent(latestCollectionId)}&limit=100`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`Workload detail unavailable (${response.status})`)
      const result = await response.json()
      const rows = (result.items || [])
        .filter((row) => row.host === hostName)
        .sort((left, right) => Number(right.cpu_pct || 0) - Number(left.cpu_pct || 0))
        .slice(0, 8)
      setDrilldown({ host: hostName, rows, loading: false, error: '' })
    } catch (failure) {
      setDrilldown({ host: hostName, rows: [], loading: false, error: failure.message || 'Workload detail unavailable.' })
    }
  }, [drilldown?.host, latestCollectionId])

  const inspectWorkload = React.useCallback((row) => {
    if (!row?.consumer_key) return
    onSelectJob?.({
      key: row.consumer_key,
      host: row.host,
      consumerType: row.consumer_type,
      source: 'critical-wp-inline-drilldown',
    })
    scrollToSelectedWorkload()
  }, [onSelectJob])

  return <section className="rundeckServerSection rundeckServerSectionV1234" aria-label="SAP App Servers">
    <div className="rundeckSectionTitle"><h3><SphereIcon name="server" /> SAP App Servers</h3></div>
    {state.error && <div className="rundeckHistoryState is-error">{state.error}</div>}
    {!state.error && <div className="rundeckServerTableWrap"><table className="rundeckServerTable">
      <thead><tr><th>APP</th><th>OS Resource</th><th>SAP Workload</th><th>CPU</th><th>Memory</th><th>I/O Wait</th><th>Critical WP</th></tr></thead>
      <tbody>{state.items.map((host) => {
        const workloadState = sapWorkloadState(host)
        const wpCount = Number(host.wp_critical || 0)
        const expandable = wpCount > 0 && Boolean(latestCollectionId)
        const expanded = drilldown?.host === host.host
        return <React.Fragment key={host.host}>
          <tr
            className={[expanded ? 'is-selected' : '', expandable ? 'is-expandable' : ''].filter(Boolean).join(' ')}
            onClick={expandable ? (event) => {
              if (event.target.closest('button, a')) return
              openWp(host)
            } : undefined}
          >
            <td>{expandable
              ? <button type="button" className="rundeckAppExpandButton" onClick={() => openWp(host)} aria-expanded={expanded} title="Show workloads observed on this APP while Critical WP is active"><strong>{shortHost(host.host)}</strong><span>{expanded ? '−' : '+'}</span></button>
              : <strong title={host.host}>{shortHost(host.host)}</strong>}
            </td>
            <td><StatusPill value={hostResourceState(host)} /></td>
            <td><StatusPill value={workloadState} /></td>
            <td>{metric(host.cpu_pct, '%')}</td><td>{metric(host.ram_pct, '%')}</td><td>{metric(host.io_wait_pct, '%')}</td>
            <td className={wpCount > 0 ? `is-${workloadState.toLowerCase()}` : ''}>{wpCount > 0 ? <button type="button" className="rundeckWpButton" onClick={() => openWp(host)} aria-expanded={expanded}><SphereIcon name="alert" /> {wpCount}</button> : '0'}</td>
          </tr>
          {expanded && <tr className="rundeckWpInlineRow"><td colSpan="7">
            <section className="rundeckWpInlinePanel" aria-live="polite">
              <header className="rundeckWpInlineHead">
                <div><h4><SphereIcon name="alert" /> {shortHost(drilldown.host)} · Workloads observed while Critical WP active</h4><small>Same collection/run supporting context. Correlation only; not a direct root-cause mapping.</small></div>
                <button type="button" onClick={() => setDrilldown(null)}>Close</button>
              </header>
              {drilldown.loading && <div className="rundeckWpDrilldownState">Loading workload context…</div>}
              {drilldown.error && <div className="rundeckWpDrilldownState is-error">{drilldown.error}</div>}
              {!drilldown.loading && !drilldown.error && <div className="rundeckWpInlineTableWrap"><table>
                <thead><tr><th>Workload</th><th>Type</th><th>CPU</th><th>PSS</th><th>Processes</th></tr></thead>
                <tbody>{drilldown.rows.map((row, index) => <tr key={`${row.host}-${row.consumer_type}-${row.consumer_key}-${index}`}>
                  <td><button type="button" onClick={() => inspectWorkload(row)}>{row.consumer_key}</button></td>
                  <td>{String(row.consumer_type || '—').toUpperCase()}</td>
                  <td>{metric(row.cpu_pct, '%')}</td>
                  <td>{pssText(row)}</td>
                  <td>{processText(row)}</td>
                </tr>)}{!drilldown.rows.length && <tr><td colSpan="5">No workload rows stored for this APP in the aligned collection.</td></tr>}</tbody>
              </table></div>}
            </section>
          </td></tr>}
        </React.Fragment>
      })}{!state.items.length && <tr><td colSpan="7">No aligned APP server rows available.</td></tr>}</tbody>
    </table></div>}
  </section>
}

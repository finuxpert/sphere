import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { shortHost } from './sapUiFormat.js'
import { hostResourceState, sapWorkloadState } from './rundeckStatusSemantics.js'

const API = `${import.meta.env.BASE_URL}api`
const metric = (value, suffix = '') => value === null || value === undefined || value === '' ? '—' : `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}${suffix}`

function StatusPill({ value = 'UNKNOWN' }) {
  return <span className={`rundeckStatus rundeckStatusMotion is-${String(value).toLowerCase()}`}>{value}</span>
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

  const openWp = React.useCallback(async (host) => {
    const hostName = host?.host || ''
    if (!hostName || !latestCollectionId) return
    if (drilldown?.host === hostName) return setDrilldown(null)
    setDrilldown({ host: hostName, rows: [], loading: true, error: '' })
    try {
      const response = await fetch(`${API}/history/jobs/current?collection_id=${encodeURIComponent(latestCollectionId)}&limit=50`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`Workload detail unavailable (${response.status})`)
      const result = await response.json()
      setDrilldown({ host: hostName, rows: (result.items || []).filter((row) => row.host === hostName).slice(0, 8), loading: false, error: '' })
    } catch (failure) {
      setDrilldown({ host: hostName, rows: [], loading: false, error: failure.message || 'Workload detail unavailable.' })
    }
  }, [drilldown?.host, latestCollectionId])

  return <section className="rundeckServerSection rundeckServerSectionV1234" aria-label="SAP App Servers">
    <div className="rundeckSectionTitle"><h3><SphereIcon name="server" /> SAP App Servers</h3></div>
    {state.error && <div className="rundeckHistoryState is-error">{state.error}</div>}
    {!state.error && <div className="rundeckServerTableWrap"><table className="rundeckServerTable">
      <thead><tr><th>APP</th><th>OS Resource</th><th>SAP Workload</th><th>CPU</th><th>Memory</th><th>I/O Wait</th><th>Critical WP</th></tr></thead>
      <tbody>{state.items.map((host) => {
        const workloadState = sapWorkloadState(host)
        const wpCount = Number(host.wp_critical || 0)
        return <tr key={host.host} className={drilldown?.host === host.host ? 'is-selected' : ''}>
          <td><strong title={host.host}>{shortHost(host.host)}</strong></td>
          <td><StatusPill value={hostResourceState(host)} /></td>
          <td><StatusPill value={workloadState} /></td>
          <td>{metric(host.cpu_pct, '%')}</td><td>{metric(host.ram_pct, '%')}</td><td>{metric(host.io_wait_pct, '%')}</td>
          <td className={wpCount > 0 ? `is-${workloadState.toLowerCase()}` : ''}>{wpCount > 0 ? <button type="button" className="rundeckWpButton" onClick={() => openWp(host)} aria-expanded={drilldown?.host === host.host}><SphereIcon name="alert" /> {wpCount}</button> : '0'}</td>
        </tr>
      })}{!state.items.length && <tr><td colSpan="7">No aligned APP server rows available.</td></tr>}</tbody>
    </table></div>}
    {drilldown && <section className="rundeckWpDrilldown" aria-live="polite">
      <div className="rundeckWpDrilldownHead"><h4><SphereIcon name="alert" /> {shortHost(drilldown.host)} workload context</h4><button type="button" onClick={() => setDrilldown(null)}>Close</button></div>
      {drilldown.loading && <div className="rundeckWpDrilldownState">Loading workload…</div>}
      {drilldown.error && <div className="rundeckWpDrilldownState is-error">{drilldown.error}</div>}
      {!drilldown.loading && !drilldown.error && <div className="rundeckWpDrilldownTableWrap"><table><thead><tr><th>Workload</th><th>CPU</th></tr></thead><tbody>{drilldown.rows.map((row) => <tr key={`${row.host}-${row.consumer_type}-${row.consumer_key}`}><td><button type="button" onClick={() => onSelectJob?.({ key: row.consumer_key, host: row.host, consumerType: row.consumer_type, source: 'critical-wp-drilldown' })}>{row.consumer_key}</button></td><td>{metric(row.cpu_pct, '%')}</td></tr>)}{!drilldown.rows.length && <tr><td colSpan="2">No current workload rows stored for this APP.</td></tr>}</tbody></table></div>}
    </section>}
  </section>
}

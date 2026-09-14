import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { shortHost } from './sapUiFormat.js'
import { hostResourceState, sapWorkloadState } from './rundeckStatusSemantics.js'

const API = `${import.meta.env.BASE_URL}api`
const metric = (value, suffix = '') => value === null || value === undefined || value === '' ? '—' : `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}${suffix}`

function StatusPill({ value = 'UNKNOWN' }) {
  return <span className={`rundeckStatus rundeckStatusMotion is-${String(value).toLowerCase()}`}>{value}</span>
}

export default function RundeckAppServersV1234({ refreshToken = '', latestCollectionId = '' }) {
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

  return <section className="rundeckServerSection rundeckServerSectionV1234" aria-label="SAP App Servers">
    <div className="rundeckSectionTitle"><h3><SphereIcon name="server" /> SAP App Servers</h3></div>
    {state.error && <div className="rundeckHistoryState is-error">{state.error}</div>}
    {!state.error && <div className="rundeckServerTableWrap"><table className="rundeckServerTable">
      <thead><tr><th>APP</th><th>OS Resource</th><th>SAP Workload</th><th>CPU</th><th>Memory</th><th>I/O Wait</th><th>Critical WP</th></tr></thead>
      <tbody>{state.items.map((host) => {
        const workloadState = sapWorkloadState(host)
        return <tr key={host.host}>
          <td><strong title={host.host}>{shortHost(host.host)}</strong></td>
          <td><StatusPill value={hostResourceState(host)} /></td>
          <td><StatusPill value={workloadState} /></td>
          <td>{metric(host.cpu_pct, '%')}</td><td>{metric(host.ram_pct, '%')}</td><td>{metric(host.io_wait_pct, '%')}</td>
          <td className={Number(host.wp_critical || 0) > 0 ? `is-${workloadState.toLowerCase()}` : ''}>{Number(host.wp_critical || 0)}</td>
        </tr>
      })}{!state.items.length && <tr><td colSpan="7">No aligned APP server rows available.</td></tr>}</tbody>
    </table></div>}
  </section>
}

import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { formatWib } from './sapUiFormat.js'
import './RundeckAvailability.css'

const API = `${import.meta.env.BASE_URL}api`

function Status({ value = 'UNKNOWN' }) {
  return <span className={`rundeckAvailabilityStatus is-${String(value).toLowerCase()}`}>{value}</span>
}

function roleMap(rows = []) {
  return Object.fromEntries(rows.map((row) => [row.name, row]))
}

export default function RundeckAvailability({ refreshToken = '' }) {
  const [data, setData] = React.useState(null)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    let active = true
    let controller = new AbortController()

    const load = () => {
      controller.abort()
      controller = new AbortController()
      fetch(`${API}/availability/latest`, { cache: 'no-store', signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) {
            const body = await response.json().catch(() => ({}))
            throw new Error(body.detail || `Availability unavailable (${response.status})`)
          }
          return response.json()
        })
        .then((result) => {
          if (!active) return
          setData(result)
          setError('')
        })
        .catch((failure) => {
          if (!active || failure.name === 'AbortError') return
          setError(failure.message || 'Availability unavailable')
        })
    }

    load()
    const timer = window.setInterval(load, 60000)
    return () => {
      active = false
      window.clearInterval(timer)
      controller.abort()
    }
  }, [refreshToken])

  const apps = data?.sap_app || []
  const hana = roleMap(data?.hana_system_db || [])
  const web = roleMap(data?.web_dispatcher || [])
  const appDown = data?.summary?.sap_app_down || []

  return <section className={`rundeckAvailability ${appDown.length ? 'has-down' : ''}`} aria-label="SAP service availability">
    <div className="rundeckAvailabilityHead">
      <div>
        <h3><SphereIcon name="server" /> SAP Availability</h3>
        <span title="Availability is read from the existing Rundeck Service Availability job. Resource usage is supporting evidence only.">
          Rundeck service check{data?.execution_id ? ` · Run #${data.execution_id}` : ''}
          {data?.collected_at ? ` · ${formatWib(data.collected_at, true)} WIB` : ''}
        </span>
      </div>
      <Status value={data?.summary?.sap_state || (error ? 'UNKNOWN' : 'LOADING')} />
    </div>

    {error && !data && <div className="rundeckAvailabilityError">Service Availability data unavailable. Existing performance monitoring remains active.</div>}

    {data && <div className="rundeckAvailabilityBody">
      <div className="rundeckAvailabilityApps" aria-label="SAP application server availability">
        {apps.map((row) => <span key={row.name} title={`${row.endpoint} · ${row.description}`}><b>{row.name}</b><Status value={row.status} /></span>)}
        {!apps.length && <span><b>APP</b><Status value="UNKNOWN" /></span>}
      </div>
      <div className="rundeckAvailabilityInfra" aria-label="Supporting SAP infrastructure availability">
        <span>HANA Primary <Status value={hana.PRIMARY?.status || 'UNKNOWN'} /></span>
        <span>Secondary <Status value={hana.SECONDARY?.status || 'UNKNOWN'} /></span>
        <span>DR <Status value={hana.DR?.status || 'UNKNOWN'} /></span>
        <span>Web HTTP <Status value={web.HTTP?.status || 'UNKNOWN'} /></span>
        <span>HTTPS <Status value={web.HTTPS?.status || 'UNKNOWN'} /></span>
      </div>
    </div>}
  </section>
}

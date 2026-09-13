import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { formatWib } from './sapUiFormat.js'
import './RundeckAvailability.css'

const API = `${import.meta.env.BASE_URL}api`

function Status({ value = 'UNKNOWN' }) {
  return <span className={`rundeckAvailabilityStatus is-${String(value).toLowerCase()}`}>{value}</span>
}

function roleMap(rows = []) {
  return Object.fromEntries(rows.map((row) => [String(row.name || '').toUpperCase(), row]))
}

function ServiceList({ rows = [], fallback = 'No data' }) {
  if (!rows.length) return <span className="rundeckAvailabilityMuted">{fallback}</span>
  return rows.map((row) => <span key={`${row.category}-${row.name}-${row.endpoint || ''}`} title={`${row.endpoint || ''}${row.description ? ` · ${row.description}` : ''}`}><b>{row.name}</b><Status value={row.status} /></span>)
}

function MatrixCell({ row }) {
  if (!row) return <span className="rundeckAvailabilityMuted">—</span>
  return <span title={`${row.endpoint || ''}${row.description ? ` · ${row.description}` : ''}`}><Status value={row.status} /></span>
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
  const replication = roleMap(data?.hana_replication || [])
  const sshRows = data?.ssh || []
  const ssh = roleMap(sshRows)
  const appSsh = sshRows.filter((row) => /^APP\d+$/i.test(String(row.name || '')))
  const otherSsh = sshRows.filter((row) => !/^(PRIMARY|SECONDARY|DR|APP\d+)$/i.test(String(row.name || '')))
  const primaryRows = [...apps, ...Object.values(hana), ...Object.values(web)]
  const primaryServiceDownCount = primaryRows.filter((row) => String(row?.status || '').toUpperCase() === 'DOWN').length
  const matrixTechnicalRows = [
    ...Object.values(replication),
    ssh.PRIMARY,
    ssh.SECONDARY,
    ssh.DR,
  ].filter(Boolean)
  const technicalDownCount = matrixTechnicalRows.filter((row) => String(row?.status || '').toUpperCase() === 'DOWN').length
  const serviceState = data?.summary?.service_state || data?.summary?.sap_state || (error ? 'UNKNOWN' : 'LOADING')

  return <section className={`rundeckAvailability ${serviceState === 'CRITICAL' ? 'has-down' : serviceState === 'ATTENTION' ? 'has-attention' : ''}`} aria-label="Current SAP service availability">
    <div className="rundeckAvailabilityHead">
      <div>
        <h3><SphereIcon name="server" /> SAP Availability</h3>
        <span title="Current snapshot from the existing Rundeck Service Availability job. Resource usage is supporting evidence only.">
          Current service check{data?.execution_id ? ` · Run #${data.execution_id}` : ''}
          {data?.collected_at ? ` · ${formatWib(data.collected_at, true)} WIB` : ''}
        </span>
      </div>
      <div className="rundeckAvailabilityState">
        <Status value={serviceState} />
        {data && primaryServiceDownCount > 0 && <small>{primaryServiceDownCount} primary service{primaryServiceDownCount === 1 ? '' : 's'} down</small>}
      </div>
    </div>

    {error && !data && <div className="rundeckAvailabilityError">Service Availability data unavailable. Existing performance monitoring remains active.</div>}

    {data && <>
      <div className="rundeckAvailabilityBody">
        <div className="rundeckAvailabilityGroup" aria-label="SAP application server availability">
          <span className="rundeckAvailabilityLabel">SAP App</span>
          <div className="rundeckAvailabilityApps"><ServiceList rows={apps} /></div>
        </div>
        <div className="rundeckAvailabilityGroup" aria-label="HANA availability">
          <span className="rundeckAvailabilityLabel">HANA</span>
          <div className="rundeckAvailabilityInfra">
            <span>Primary <Status value={hana.PRIMARY?.status || 'UNKNOWN'} /></span>
            <span>Secondary <Status value={hana.SECONDARY?.status || 'UNKNOWN'} /></span>
            <span>DR <Status value={hana.DR?.status || 'UNKNOWN'} /></span>
          </div>
        </div>
        <div className="rundeckAvailabilityGroup" aria-label="Web Dispatcher availability">
          <span className="rundeckAvailabilityLabel">Web</span>
          <div className="rundeckAvailabilityInfra">
            <span>HTTP <Status value={web.HTTP?.status || 'UNKNOWN'} /></span>
            <span>HTTPS <Status value={web.HTTPS?.status || 'UNKNOWN'} /></span>
          </div>
        </div>
      </div>

      <details className="rundeckAvailabilityMore">
        <summary>More technical checks{technicalDownCount > 0 && <span>{technicalDownCount} down</span>}</summary>
        <div className="rundeckAvailabilityMoreBody">
          <div className="rundeckAvailabilityMatrix" aria-label="HANA technical checks">
            <div className="is-head"><span>Check</span><span>Primary</span><span>Secondary</span><span>DR</span></div>
            <div><b>Replication</b><MatrixCell row={replication.PRIMARY} /><MatrixCell row={replication.SECONDARY} /><MatrixCell row={replication.DR} /></div>
            <div><b>SSH</b><MatrixCell row={ssh.PRIMARY} /><MatrixCell row={ssh.SECONDARY} /><MatrixCell row={ssh.DR} /></div>
          </div>
          <div className="rundeckAvailabilityTechnicalRow">
            <span className="rundeckAvailabilityLabel">SAP App SSH</span>
            <div className="rundeckAvailabilityInfra"><ServiceList rows={appSsh} /></div>
          </div>
          {otherSsh.length > 0 && <div className="rundeckAvailabilityTechnicalRow">
            <span className="rundeckAvailabilityLabel">Other SSH</span>
            <div className="rundeckAvailabilityInfra"><ServiceList rows={otherSsh} /></div>
          </div>}
        </div>
      </details>
    </>}
  </section>
}

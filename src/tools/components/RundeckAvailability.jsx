import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { formatWib } from './sapUiFormat.js'
import './RundeckAvailability.css'

const API = `${import.meta.env.BASE_URL}api`
const STALE_MINUTES = 20

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

function bundleSourceStatus(bundle, key) {
  const source = bundle?.sources?.[key]
  if (!source) return 'WAITING'
  const status = String(source.status || '').toUpperCase()
  if (status === 'SUCCEEDED' && source.ingest_status === 'READY') return 'READY'
  if (status === 'RUNNING' || status === 'SCHEDULED') return 'RUNNING'
  if (['FAILED', 'ABORTED', 'TIMEDOUT'].includes(status)) return 'FAILED'
  return String(source.ingest_status || status || 'WAITING').toUpperCase()
}

function ageMinutes(value) {
  const timestamp = Date.parse(value || '')
  if (!Number.isFinite(timestamp)) return null
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60000))
}

export default function RundeckAvailability({ refreshToken = '', compact = false, onOpen = null }) {
  const [data, setData] = React.useState(null)
  const [error, setError] = React.useState('')
  const [bundle, setBundle] = React.useState(null)
  const previousBundleRunning = React.useRef(false)

  const loadAvailability = React.useCallback(async (signal) => {
    const response = await fetch(`${API}/availability/latest`, { cache: 'no-store', signal })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.detail || `Availability unavailable (${response.status})`)
    }
    return response.json()
  }, [])

  React.useEffect(() => {
    let active = true
    let controller = new AbortController()

    const load = () => {
      controller.abort()
      controller = new AbortController()
      loadAvailability(controller.signal)
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
  }, [loadAvailability, refreshToken])

  React.useEffect(() => {
    let active = true
    let controller = new AbortController()

    const checkBundle = async () => {
      controller.abort()
      controller = new AbortController()
      try {
        const response = await fetch(`${API}/collect-now/status`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) return
        const result = await response.json()
        if (!active) return
        const wasRunning = previousBundleRunning.current
        const isRunning = Boolean(result.running)
        previousBundleRunning.current = isRunning
        setBundle(result)
        if (wasRunning && !isRunning) {
          try {
            const latest = await loadAvailability(controller.signal)
            if (!active) return
            setData(latest)
            setError('')
          } catch (failure) {
            if (failure.name !== 'AbortError' && active) setError(failure.message || 'Availability unavailable')
          }
        }
      } catch (failure) {
        if (failure.name !== 'AbortError' && active) setBundle((current) => current)
      }
    }

    checkBundle()
    const timer = window.setInterval(checkBundle, 4000)
    return () => {
      active = false
      window.clearInterval(timer)
      controller.abort()
    }
  }, [loadAvailability])

  const apps = data?.sap_app || []
  const hana = roleMap(data?.hana_system_db || [])
  const web = roleMap(data?.web_dispatcher || [])
  const replication = roleMap(data?.hana_replication || [])
  const sshRows = data?.ssh || []
  const ssh = roleMap(sshRows)
  const appSsh = sshRows.filter((row) => /^APP\d+$/i.test(String(row.name || '')))
  const otherSsh = sshRows.filter((row) => !/^(PRIMARY|SECONDARY|DR|APP\d+)$/i.test(String(row.name || '')))
  const technicalDownCount = Number(data?.summary?.technical_down_count ?? [
    ...Object.values(replication),
    ssh.PRIMARY,
    ssh.SECONDARY,
    ssh.DR,
  ].filter(Boolean).filter((row) => String(row?.status || '').toUpperCase() === 'DOWN').length)
  const serviceState = String(data?.summary?.service_state || data?.summary?.sap_state || (error ? 'UNKNOWN' : 'LOADING')).toUpperCase()
  const issueText = String(data?.summary?.issue_text || '').replace(/\bDr\b/g, 'DR').trim()
  const availabilityAge = ageMinutes(data?.collected_at)
  const stale = availabilityAge !== null && availabilityAge >= STALE_MINUTES
  const displayState = stale ? 'STALE' : serviceState
  const bundlePerformance = bundleSourceStatus(bundle, 'performance')
  const bundleAvailability = bundleSourceStatus(bundle, 'availability')
  const bundleState = String(bundle?.bundle_status || '').toUpperCase()
  const skew = Number(bundle?.source_skew_seconds)
  const skewWarning = Number.isFinite(skew) && skew >= 300
  const bundleAbnormal = ['PARTIAL', 'FAILED'].includes(bundleState)
  const showCollectionGap = bundleAbnormal && skewWarning
  const bundleTitle = bundle?.requested_at
    ? `Performance ${bundlePerformance} · Availability ${bundleAvailability}${showCollectionGap ? ` · time difference ${skew}s` : ''}`
    : ''
  const collectionNotice = bundleState === 'RUNNING'
    ? 'Data refresh running'
    : bundleState === 'PARTIAL'
      ? 'Refresh incomplete'
      : bundleState === 'FAILED'
        ? 'Refresh failed'
        : ''
  const showDataTrust = Boolean(collectionNotice || showCollectionGap)
  const up = (row) => String(row?.status || '').toUpperCase() === 'UP'
  const appsUp = apps.filter(up).length
  const hanaRows = [hana.PRIMARY, hana.SECONDARY, hana.DR].filter(Boolean)
  const hanaUp = hanaRows.filter(up).length
  const webRows = [web.HTTP, web.HTTPS].filter(Boolean)
  const webUp = webRows.filter(up).length
  const healthyApps = apps.length > 0 && appsUp === apps.length
  const healthyHana = hanaRows.length > 0 && hanaUp === hanaRows.length
  const healthyWeb = webRows.length > 0 && webUp === webRows.length
  const technicalCheckCount = Object.values(replication).filter(Boolean).length + sshRows.length

  const healthySummary = healthyApps && healthyHana && healthyWeb && technicalDownCount === 0 && !showDataTrust

  if (compact) {
    return <button type="button" className="rundeckEvidenceCard rundeckAvailabilityCard" onClick={onOpen} aria-label="Open SAP Availability details">
      <span className="rundeckEvidenceCardTitle"><SphereIcon name="server" /> SAP Availability</span>
      <strong>{apps.length ? `${appsUp}/${apps.length} APP` : 'APP —'} · {hanaRows.length ? `${hanaUp}/${hanaRows.length} HANA` : 'HANA —'} · {webRows.length ? `${webUp}/${webRows.length} Web` : 'Web —'}{stale ? ` · STALE ${availabilityAge}m` : ''}</strong>
      <em aria-hidden="true">›</em>
    </button>
  }

  return <section className={`rundeckAvailability ${serviceState === 'CRITICAL' ? 'has-down' : serviceState === 'ATTENTION' ? 'has-attention' : ''} ${healthySummary ? 'is-healthy-compact' : ''}`} aria-label="Current SAP service availability">
    <div className="rundeckAvailabilityHead">
      <div>
        <h3><SphereIcon name="server" /> SAP Availability</h3>
        <span title="Current snapshot from the Rundeck Service Availability job.">
          {data?.collected_at ? `Last update ${formatWib(data.collected_at, true)} WIB` : 'Waiting for service check'}
          {data?.execution_id ? ` · Run #${data.execution_id}` : ''}
        </span>
      </div>
      <div className="rundeckAvailabilityState">
        {displayState !== 'NORMAL' && <Status value={displayState} />}
        {stale && <small>{availabilityAge}m old · last reliable: {serviceState}</small>}
        {!stale && issueText && <small>{issueText}</small>}
      </div>
    </div>

    {showDataTrust && <div className={`rundeckAvailabilityDataTrust${bundleState === 'RUNNING' ? ' is-running-info' : ''}`} aria-label="Availability data quality">
      {collectionNotice && <small className={`rundeckAvailabilityBundle is-${bundleState.toLowerCase()}`} title={bundleTitle}>{collectionNotice}{bundleState === 'PARTIAL' ? ' · using last reliable data' : ''}</small>}
      {showCollectionGap && <small className="rundeckAvailabilityTrust is-warning" title={bundleTitle}>Data time difference {Math.round(skew / 60)}m</small>}
    </div>}

    {error && !data && <div className="rundeckAvailabilityError">Availability data unavailable.</div>}

    {data && <>
      <div className="rundeckAvailabilitySummaryStrip" aria-label="Availability summary">
        <span><b>SAP APP</b><strong>{apps.length ? `${appsUp}/${apps.length} UP` : '—'}</strong></span>
        <span><b>HANA</b><strong>{hanaRows.length ? `${hanaUp}/${hanaRows.length} UP` : '—'}</strong></span>
        <span><b>WEB</b><strong>{webRows.length ? `${webUp}/${webRows.length} UP` : '—'}</strong></span>
        <span><b>TECHNICAL</b><strong>{technicalDownCount > 0 ? `${technicalCheckCount - technicalDownCount}/${technicalCheckCount} PASS` : `${technicalCheckCount}/${technicalCheckCount} PASS`}</strong></span>
      </div>

      <div className="rundeckAvailabilityDetailSections">
        <section>
          <h4>Landscape Checks</h4>
          <div className="rundeckAvailabilityMatrix" aria-label="HANA technical checks">
            <div className="is-head"><span>Check</span><span>Primary</span><span>Secondary</span><span>DR</span></div>
            <div><b>Replication</b><MatrixCell row={replication.PRIMARY} /><MatrixCell row={replication.SECONDARY} /><MatrixCell row={replication.DR} /></div>
            <div><b>SSH</b><MatrixCell row={ssh.PRIMARY} /><MatrixCell row={ssh.SECONDARY} /><MatrixCell row={ssh.DR} /></div>
          </div>
        </section>
        <section>
          <h4>SAP APP SSH</h4>
          <div className="rundeckAvailabilityInfra"><ServiceList rows={appSsh} /></div>
        </section>
        {otherSsh.length > 0 && <section>
          <h4>Other SSH</h4>
          <div className="rundeckAvailabilityInfra"><ServiceList rows={otherSsh} /></div>
        </section>}
      </div>
    </>}
  </section>
}

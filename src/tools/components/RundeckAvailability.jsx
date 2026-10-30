import React from 'react'
import { createPortal } from 'react-dom'
import SphereIcon from './SphereIcon.jsx'
import { formatWib } from './sapUiFormat.js'
import './RundeckAvailability.css'

const API = `${import.meta.env.BASE_URL}api`
const STALE_MINUTES = 20

function Status({ value = 'UNKNOWN', historical = false }) {
  // A prior UP is a retained observation, not the current SAP service state.
  return <span className={`rundeckAvailabilityStatus is-${historical ? 'historical' : String(value).toLowerCase()}`} title={historical ? 'Historical service check; current state unverified' : undefined}>{historical ? 'LAST ' + value : value}</span>
}

function roleMap(rows = []) {
  return Object.fromEntries(rows.map((row) => [String(row.name || '').toUpperCase(), row]))
}

function ServiceList({ rows = [], fallback = 'No data', historical = false }) {
  if (!rows.length) return <span className="rundeckAvailabilityMuted">{fallback}</span>
  return rows.map((row) => <span key={`${row.category}-${row.name}-${row.endpoint || ''}`} title={`${row.endpoint || ''}${row.description ? ` · ${row.description}` : ''}`}><b>{row.name}</b><Status value={row.status} historical={historical} /></span>)
}

function MatrixCell({ row, historical = false }) {
  if (!row) return <span className="rundeckAvailabilityMuted">—</span>
  return <span title={`${row.endpoint || ''}${row.description ? ` · ${row.description}` : ''}`}><Status value={row.status} historical={historical} /></span>
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

export default function RundeckAvailability({ refreshToken = '', compact = false, inlineSummary = false, onOpen = null, paired = false, summaryRoot = null }) {
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
  // Report only verified positive technical states as PASS, never infer from absent DOWN.
  const technicalRows = [...Object.values(replication).filter(Boolean), ...sshRows]
  const technicalCheckCount = technicalRows.length
  const technicalPassCount = technicalRows.filter((row) =>
    ['UP', 'PASS', 'OK', 'NORMAL', 'ACTIVE'].includes(String(row?.status || '').toUpperCase())).length
  const serviceState = String(data?.summary?.service_state || data?.summary?.sap_state || (error ? 'UNKNOWN' : 'LOADING')).toUpperCase()
  const issueText = String(data?.summary?.issue_text || '').replace(/\bDr\b/g, 'DR').trim()
  const availabilityAge = ageMinutes(data?.collected_at)
  const stale = availabilityAge !== null && availabilityAge >= STALE_MINUTES
  const unverified = Boolean(error || availabilityAge === null)
  const displayState = unverified ? 'UNKNOWN' : stale ? 'STALE' : serviceState
  const lastSnapshot = stale || unverified
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
  const healthySummary = healthyApps && healthyHana && healthyWeb &&
    technicalCheckCount > 0 && technicalPassCount === technicalCheckCount &&
    availabilityAge !== null && !stale && !error && !showDataTrust

  const summary = <div className="rundeckAvailabilitySummaryStrip" aria-label="Availability summary" title={lastSnapshot ? 'Last recorded availability snapshot; current service state not verified' : 'Saved availability check'}>
    <span title="SAP application service checks reported by Service Availability, not SSH reachability or SAP workload health"><b>SAP APP</b><strong>{apps.length ? `${lastSnapshot ? '' : ''}${appsUp}/${apps.length} UP` : '—'}</strong></span>
    <span title="HANA system DB service checks, separate from SSH and replication checks"><b>HANA DB</b><strong>{hanaRows.length ? `${lastSnapshot ? '' : ''}${hanaUp}/${hanaRows.length} UP` : '—'}</strong></span>
    <span title="Web Dispatcher HTTP and HTTPS checks, not an end-to-end Fiori transaction"><b>WEB HTTP</b><strong>{webRows.length ? `${lastSnapshot ? '' : ''}${webUp}/${webRows.length} UP` : '—'}</strong></span>
    <span title="SSH and HANA replication only. PASS counts reported positive checks; missing or failed checks do not count. SM37 is separate."><b>SSH / REPL</b><strong>{technicalCheckCount ? `${lastSnapshot ? '' : ''}${technicalPassCount}/${technicalCheckCount} PASS` : '—'}</strong></span>
  </div>

  if (inlineSummary) return <section className="sphereHealthInlineBlock" aria-label="SAP Availability overview">
    <div className="sphereHealthInlineHead"><h4>{lastSnapshot || stale ? "SAP Availability · Last Known" : "SAP Availability"}</h4><button type="button" onClick={onOpen}>Details</button></div>
    <div className="sphereHealthInlineValues">
      <span><b>APP</b><strong>{apps.length && !unverified ? `${lastSnapshot ? 'Last ' : ''}${appsUp}/${apps.length}` : 'No Data'}</strong></span>
      <span><b>HANA</b><strong>{hanaRows.length && !unverified ? `${lastSnapshot ? 'Last ' : ''}${hanaUp}/${hanaRows.length}` : 'No Data'}</strong></span>
      <span><b>Web</b><strong>{webRows.length && !unverified ? `${lastSnapshot ? 'Last ' : ''}${webUp}/${webRows.length}` : 'No Data'}</strong></span>
    </div>
    <small>{stale ? `Checked ${data?.collected_at ? formatWib(data.collected_at, true) + " WIB · " : ""}${availabilityAge}m ago · current state unverified` : unverified ? 'Availability not verified' : data?.collected_at ? `Checked ${formatWib(data.collected_at, true)} WIB` : 'Awaiting service check'}</small>
  </section>
  if (compact) {
    return <button type="button" className="rundeckEvidenceCard rundeckAvailabilityCard" onClick={onOpen} aria-label="Open SAP Availability details">
      <span className="rundeckEvidenceCardTitle"><SphereIcon name="server" /> SAP Availability</span>
      <strong>{apps.length ? `${appsUp}/${apps.length} APP` : 'APP —'} · {hanaRows.length ? `${hanaUp}/${hanaRows.length} HANA` : 'HANA —'} · {webRows.length ? `${webUp}/${webRows.length} Web` : 'Web —'}{stale ? ` · STALE ${availabilityAge}m` : ''}</strong>
      <em aria-hidden="true">›</em>
    </button>
  }

  return <section className={`rundeckAvailability ${displayState === 'CRITICAL' ? 'has-down' : displayState === 'ATTENTION' ? 'has-attention' : ''} ${healthySummary ? 'is-healthy-compact' : ''}`} aria-label="Current SAP service availability">
    <div className="rundeckAvailabilityHead">
      <div>
        {!paired && <h3><SphereIcon name="server" /> SAP Availability</h3>}
        <span title="Current snapshot from the Rundeck Service Availability job.">
          {data?.collected_at ? `Checked ${formatWib(data.collected_at, true)} WIB` : 'Waiting for service check'}
          {data?.execution_id ? ` · Availability Run #${data.execution_id}` : ''}
        </span>
      </div>
      <div className="rundeckAvailabilityState">
        {displayState !== 'NORMAL' && <Status value={displayState} />}
        {stale && <small>{availabilityAge}m old · last reported: {serviceState}</small>}
        {unverified && <small>{error ? 'Latest request failed · showing last received values' : 'Sample time not verified'}</small>}
        {!lastSnapshot && issueText && <small>{issueText}</small>}
      </div>
    </div>

    {showDataTrust && <div className={`rundeckAvailabilityDataTrust${bundleState === 'RUNNING' ? ' is-running-info' : ''}`} aria-label="Availability data quality">
      {collectionNotice && <small className={`rundeckAvailabilityBundle is-${bundleState.toLowerCase()}`} title={bundleTitle}>{collectionNotice}{bundleState === 'PARTIAL' ? ' · using last reliable data' : ''}</small>}
      {showCollectionGap && <small className="rundeckAvailabilityTrust is-warning" title={bundleTitle}>Data time difference {Math.round(skew / 60)}m</small>}
    </div>}

    {error && <div className="rundeckAvailabilityError" role="status">{data ? 'Availability refresh failed. Values below are from the last received snapshot.' : 'Availability data unavailable.'}</div>}

    {paired && summaryRoot && createPortal(summary, summaryRoot)}
    {data && <>
      {!summaryRoot && summary}
      <div className="rundeckAvailabilityEvidenceNote" role="note">Service Availability source · {data?.collected_at ? 'Last verified sample: ' + formatWib(data.collected_at, true) + ' WIB' : 'Sample time unknown'} · {stale ? 'STALE (' + availabilityAge + 'm old), current service state not verified' : unverified ? 'Current state unverified' : 'Fresh saved check'}. Service availability is not SM37 job execution status.</div>
      <div className="rundeckAvailabilityDetailSections">
        <section>
          <h4>HANA checks {lastSnapshot && <small>· last recorded, not current</small>}</h4>
          <div className="rundeckAvailabilityMatrix" aria-label="HANA technical checks">
            <div className="is-head"><span>Check</span><span>Primary</span><span>Secondary</span><span>DR</span></div>
            <div><b>Replication</b><MatrixCell row={replication.PRIMARY} historical={lastSnapshot} /><MatrixCell row={replication.SECONDARY} historical={lastSnapshot} /><MatrixCell row={replication.DR} historical={lastSnapshot} /></div>
            <div><b>SSH</b><MatrixCell row={ssh.PRIMARY} historical={lastSnapshot} /><MatrixCell row={ssh.SECONDARY} historical={lastSnapshot} /><MatrixCell row={ssh.DR} historical={lastSnapshot} /></div>
          </div>
        </section>
        <section>
          <h4>SAP APP SSH</h4>
          <div className="rundeckAvailabilityInfra"><ServiceList rows={appSsh} historical={lastSnapshot} /></div>
        </section>
        {otherSsh.length > 0 && <section>
          <h4>Other SSH</h4>
          <div className="rundeckAvailabilityInfra"><ServiceList rows={otherSsh} historical={lastSnapshot} /></div>
        </section>}
      </div>
    </>}
  </section>
}

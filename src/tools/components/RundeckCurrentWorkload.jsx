import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { formatWib, numberText, shortHost, workloadTypeLabel } from './sapUiFormat.js'
import './RundeckCurrentWorkload.css'

const API = `${import.meta.env.BASE_URL}api`
const CPU_HINT = 'CPU Usage is the grouped workload CPU observation and can exceed 100 percent when more than one CPU core is used.'
const STALE_MINUTES = 15

function jobContext(row) {
  if (!row?.consumer_key) return null
  return {
    key: row.consumer_key,
    host: row.host || '',
    consumerType: row.consumer_type || '',
    source: 'current-workload',
  }
}

function pssGb(row = {}) {
  const raw = row.details?.total_pss_gb ?? row.details?.pss_gb
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function wpText(details = {}) {
  return [details.wp_type, details.wp].filter(Boolean).join(' ') || '—'
}

function processCount(details = {}) {
  const value = Number(details.process_count || 0)
  return Number.isFinite(value) && value > 0 ? value : 1
}

function relativeAge(value, nowMs) {
  const observed = Date.parse(value || '')
  if (!Number.isFinite(observed)) return ''
  const minutes = Math.max(0, Math.floor((nowMs - observed) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m ago` : `${hours}h ago`
}

function ageMinutes(value, nowMs) {
  const observed = Date.parse(value || '')
  return Number.isFinite(observed) ? Math.max(0, Math.floor((nowMs - observed) / 60000)) : null
}

function identitySummary(row = {}) {
  const details = row.details || {}
  const type = String(row.consumer_type || '').toUpperCase()
  const workload = String(row.consumer_key || '').trim()
  const jobName = String(details.job_name || '').trim()
  const program = String(details.program || '').trim()
  const processes = processCount(details)
  const wp = wpText(details)
  const pid = String(details.pid || '').trim()
  const parts = []

  const related = type === 'JOB'
    ? program
    : type === 'PROGRAM'
      ? jobName
      : program || jobName
  if (related && related.toUpperCase() !== workload.toUpperCase()) parts.push(related)
  if (wp !== '—') parts.push(wp)
  if (pid) parts.push(`PID ${pid}`)
  if (processes > 1) parts.push(`${processes} proc`)
  return parts.join(' · ') || workloadTypeLabel(row.consumer_type)
}

function identityTitle(row = {}) {
  const details = row.details || {}
  const values = []
  const push = (label, value) => {
    const text = Array.isArray(value) ? value.filter(Boolean).join(', ') : String(value || '').trim()
    if (text) values.push(`${label}: ${text}`)
  }
  push('APP Server', row.host)
  push('Job Name', details.job_name || (String(row.consumer_type || '').toUpperCase() === 'JOB' ? row.consumer_key : ''))
  push('ABAP Program', details.program || (String(row.consumer_type || '').toUpperCase() === 'PROGRAM' ? row.consumer_key : ''))
  push('Work Process', details.wps?.length ? details.wps.map((value) => `${details.wp_type || ''} ${value}`.trim()) : wpText(details) === '—' ? '' : wpText(details))
  push('PID', details.pids?.length ? details.pids : details.pid)
  push('SAP User', details.users?.length ? details.users : details.user)
  push('Client', details.client || details.mandt || details.sap_client)
  push('Transaction', details.transaction || details.tcode || details.transaction_code)
  push('Report', details.report)
  return values.join(' | ')
}

export default function RundeckCurrentWorkload({ collectionId = '', selectedJob = null, onSelectJob }) {
  const [rows, setRows] = React.useState([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [showAll, setShowAll] = React.useState(false)
  const [nowMs, setNowMs] = React.useState(() => Date.now())

  React.useEffect(() => {
    if (!collectionId) {
      setRows([])
      return undefined
    }
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(`${API}/history/jobs/current?collection_id=${encodeURIComponent(collectionId)}&limit=50`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail || `Current SAP Workload unavailable (${response.status})`)
        }
        return response.json()
      })
      .then((result) => {
        setRows(result.items || [])
        setNowMs(Date.now())
      })
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message || 'Current SAP Workload unavailable')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [collectionId])

  React.useEffect(() => setShowAll(false), [collectionId])
  React.useEffect(() => {
    if (!rows.length) return undefined
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [rows.length])

  const sortedRows = [...rows].sort((left, right) => Number(right.cpu_pct || 0) - Number(left.cpu_pct || 0))
  const visible = showAll ? sortedRows : sortedRows.slice(0, 10)
  const latestObservedAt = rows.reduce((latest, row) => {
    const timestamp = Date.parse(row.collected_at || '')
    return Number.isFinite(timestamp) && timestamp > Date.parse(latest || '') ? row.collected_at : latest
  }, rows[0]?.collected_at || '')
  const freshness = latestObservedAt ? relativeAge(latestObservedAt, nowMs) : ''
  const freshnessMinutes = latestObservedAt ? ageMinutes(latestObservedAt, nowMs) : null
  const showFreshness = freshnessMinutes !== null && freshnessMinutes >= STALE_MINUTES

  return <section className="rundeckCurrentWorkload" aria-label="Current SAP workloads">
    <div className="rundeckCurrentWorkloadHead">
      <h3><SphereIcon name="workload" /> Current Workloads <span className="rundeckCurrentWorkloadCount">{rows.length} active</span></h3>
      <div className="rundeckCurrentWorkloadTools">
        {showFreshness && <span className="rundeckWorkloadFreshness is-stale" title="Age of the latest stored Rundeck workload observation">STALE · {formatWib(latestObservedAt, true)} WIB · {freshness}</span>}
        {rows.length > 10 && <button type="button" onClick={() => setShowAll((value) => !value)}>
          {showAll ? 'Top 10' : `View all ${rows.length}`}
        </button>}
      </div>
    </div>

    {loading && <div className="rundeckCurrentWorkloadState">Loading workloads…</div>}
    {error && <div className="rundeckCurrentWorkloadState is-error">{error}</div>}

    {!loading && !error && <div className="rundeckCurrentWorkloadTableWrap">
      <table>
        <thead><tr><th>APP</th><th>Workload</th><th title={CPU_HINT}>CPU Usage ↓</th><th>PSS Memory</th><th>Processes</th><th>WP</th></tr></thead>
        <tbody>
          {visible.map((row) => {
            const details = row.details || {}
            const context = jobContext(row)
            const active = context && selectedJob?.key === context.key && selectedJob?.host === context.host
            const pss = pssGb(row)
            const cpu = Number(row.cpu_pct)
            const processes = processCount(details)
            const identity = identitySummary(row)
            const fullIdentity = identityTitle(row)
            return <tr key={`${row.collection_id}-${row.host}-${row.consumer_type}-${row.consumer_key}`} className={active ? 'is-selected' : ''}>
              <td title={row.host}>{shortHost(row.host)}</td>
              <td className="rundeckCurrentWorkloadName">
                <button type="button" onClick={() => context && onSelectJob?.(context)}>{row.consumer_key}</button>
                <small title={fullIdentity || identity}>{identity}</small>
              </td>
              <td title={CPU_HINT} className={Number.isFinite(cpu) && cpu >= 80 ? 'is-attention' : ''}>{numberText(row.cpu_pct)}%</td>
              <td>{pss === null ? '—' : `${numberText(pss, 2)} GB`}</td>
              <td>{numberText(processes, 0)}</td>
              <td>{wpText(details)}</td>
            </tr>
          })}
          {!rows.length && <tr><td colSpan="6">No current workload stored for this run.</td></tr>}
        </tbody>
      </table>
    </div>}
  </section>
}
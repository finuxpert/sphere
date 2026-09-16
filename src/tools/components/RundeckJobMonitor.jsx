import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { formatWib, numberText, shortHost } from './sapUiFormat.js'
import './RundeckJobMonitor.css'

const API = `${import.meta.env.BASE_URL}api`
const PERIODS = [[1, '1 Day'], [7, '7 Days'], [30, '30 Days']]

async function loadJson(url, signal) {
  const response = await fetch(url, { cache: 'no-store', signal })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${response.status})`)
  }
  return response.json()
}

function durationText(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value < 0) return '—'
  const minutes = Math.round(value / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

function statusClass(value = '') {
  const key = String(value).toUpperCase()
  if (['FAILED', 'ERROR', 'CANCELED', 'CANCELLED', 'ABORTED', 'CRITICAL'].includes(key)) return 'is-critical'
  if (['ATTENTION', 'WARNING', 'ACTIVE', 'RUNNING'].includes(key)) return 'is-attention'
  if (['FINISHED', 'COMPLETED', 'SUCCESS', 'READY'].includes(key)) return 'is-normal'
  return 'is-unknown'
}

function SourceState({ source }) {
  const state = source?.status || 'UNKNOWN'
  return <div className={`rundeckJobMonitorSource ${statusClass(state)}`}>
    <strong>SM37 Execution Feed</strong>
    <span>{state}</span>
    {source?.rows > 0 && <small>{source.rows.toLocaleString()} execution rows · latest import {formatWib(source.latest_imported_at, false)} WIB</small>}
    {!source?.authoritative && <small>Authoritative SM37 data is not configured. SPHERE keeps verification as NOT VERIFIED and does not infer an SM37 match from WP snapshots.</small>}
  </div>
}

export default function RundeckJobMonitor({ refreshToken, onOpenLiveJob }) {
  const [days, setDays] = React.useState(1)
  const [data, setData] = React.useState(null)
  const [readiness, setReadiness] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    Promise.all([
      loadJson(`${API}/jobs/monitor?days=${days}&limit=500`, controller.signal),
      loadJson(`${API}/platform/readiness`, controller.signal).catch(() => null),
    ]).then(([monitor, platform]) => {
      setData(monitor)
      setReadiness(platform)
    }).catch((failure) => {
      if (failure.name !== 'AbortError') setError(failure.message || 'Job Monitor unavailable.')
    }).finally(() => setLoading(false))
    return () => controller.abort()
  }, [days, refreshToken])

  const review = data?.review || []
  const summary = data?.summary || {}

  async function downloadInvestigation(item) {
    const execution = item?.execution || {}
    if (!execution.job_name) return
    const params = new URLSearchParams({ job: execution.job_name, days: String(Math.max(days, 7)) })
    if (execution.program) params.set('program', execution.program)
    if (execution.server) params.set('host', execution.server)
    if (execution.started_at) params.set('observed_at', execution.started_at)
    try {
      const report = await loadJson(`${API}/reports/investigation?${params.toString()}`)
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `SPHERE_Job_Investigation_${execution.job_name}_${String(execution.started_at || '').slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (failure) {
      setError(failure.message || 'Investigation report unavailable.')
    }
  }

  return <section className="rundeckJobMonitor" aria-label="SAP Job Monitor">
    <header className="rundeckJobMonitorHead">
      <div>
        <h3><SphereIcon name="history" /> SAP Job Monitor</h3>
        <p>Execution health, long-running jobs, failed jobs and performance correlation. Signals require Basis validation.</p>
      </div>
      <div className="rundeckJobMonitorPeriods" role="group" aria-label="Job Monitor period">
        {PERIODS.map(([value, label]) => <button key={value} type="button" className={days === value ? 'is-active' : ''} onClick={() => setDays(value)}>{label}</button>)}
      </div>
    </header>

    <SourceState source={data?.source} />
    {error && <div className="rundeckJobMonitorMessage is-error">{error}</div>}
    {loading && <div className="rundeckJobMonitorMessage">Loading SAP job execution context…</div>}

    <div className="rundeckJobMonitorStats">
      <div><span>Executions</span><strong>{summary.executions ?? '—'}</strong></div>
      <div><span>Active</span><strong>{summary.active ?? '—'}</strong></div>
      <div><span>Failed or Canceled</span><strong>{summary.failed ?? '—'}</strong></div>
      <div><span>Long Running</span><strong>{summary.long_running ?? '—'}</strong></div>
    </div>

    <div className="rundeckJobMonitorSectionTitle">
      <div><strong>Needs Review</strong><span>{review.length} execution signals</span></div>
      <small>Priority queue · supporting evidence</small>
    </div>

    <div className="rundeckJobMonitorTableWrap">
      <table className="rundeckJobMonitorTable">
        <thead><tr><th>Severity</th><th>Job</th><th>Program</th><th>Status</th><th>Start WIB</th><th>Duration</th><th>Server</th><th>Peak CPU</th><th>Critical WP</th><th>Signal</th><th /></tr></thead>
        <tbody>
          {review.map((item, index) => {
            const execution = item.execution || {}
            const performance = item.performance || {}
            return <tr key={`${execution.job_name}-${execution.job_count}-${execution.step_no}-${index}`}>
              <td><span className={`rundeckJobMonitorStatus ${statusClass(item.severity)}`}>{item.severity}</span></td>
              <td><button type="button" className="rundeckJobMonitorWorkload" onClick={() => onOpenLiveJob?.({ key: execution.job_name, host: execution.server, consumerType: 'JOB', source: 'job-monitor', at: execution.started_at })}>{execution.job_name || '—'}</button></td>
              <td title={execution.program || ''}>{execution.program || '—'}</td>
              <td><span className={statusClass(execution.status)}>{execution.status || '—'}</span></td>
              <td>{formatWib(execution.started_at, true)} WIB</td>
              <td>{durationText(execution.duration_seconds)}</td>
              <td>{shortHost(execution.server || '') || '—'}</td>
              <td>{performance.peak_cpu_pct == null ? '—' : `${numberText(performance.peak_cpu_pct, 1)}%`}</td>
              <td>{performance.max_critical_wp ?? '—'}</td>
              <td>{(item.signals || []).join(' · ') || 'Review required'}</td>
              <td><button type="button" className="rundeckJobMonitorReport" onClick={() => downloadInvestigation(item)} title="Download structured investigation evidence">Report</button></td>
            </tr>
          })}
          {!loading && !review.length && <tr><td colSpan="11">{data?.source?.authoritative ? 'No execution currently needs review for this period.' : 'Job Monitor will populate after an approved SM37 execution feed is imported.'}</td></tr>}
        </tbody>
      </table>
    </div>

    {readiness && <footer className="rundeckJobMonitorReadiness">
      <span>Workload History <b>{readiness.features?.workload_history || 'UNKNOWN'}</b></span>
      <span>SM37 Verification <b>{readiness.features?.sm37_verification || 'UNKNOWN'}</b></span>
      <span>Baseline <b>{readiness.features?.baseline || 'UNKNOWN'}</b></span>
      <span>Correlation <b>{readiness.features?.correlation || 'UNKNOWN'}</b></span>
    </footer>}
  </section>
}

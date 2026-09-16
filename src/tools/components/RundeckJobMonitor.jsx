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
  if (['ATTENTION', 'WARNING', 'ACTIVE', 'RUNNING', 'REVIEW'].includes(key)) return 'is-attention'
  if (['FINISHED', 'COMPLETED', 'SUCCESS', 'READY', 'NORMAL', 'MATCHED'].includes(key)) return 'is-normal'
  return 'is-unknown'
}

function SourceState({ source }) {
  const state = source?.status || 'UNKNOWN'
  return <div className={`rundeckJobMonitorSource ${statusClass(state)}`}>
    <strong>SM37 Execution Feed</strong>
    <span>{state}</span>
    {source?.rows > 0 && <small>{source.rows.toLocaleString()} execution rows · latest import {formatWib(source.latest_imported_at, false)} WIB</small>}
    {!source?.authoritative && <small>Authoritative SM37 data is not configured. SPHERE does not infer an SM37 match from sampled Work Process observations.</small>}
  </div>
}

function pct(value) {
  return value == null ? '—' : `${numberText(value, 1)}%`
}

function gb(value) {
  return value == null ? '—' : `${numberText(value, 2)} GB`
}

function JobIntelligence({ item, days }) {
  const execution = item?.execution || {}
  const [detail, setDetail] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (!execution.job_name) {
      setDetail(null)
      return undefined
    }
    const controller = new AbortController()
    const params = new URLSearchParams({ job: execution.job_name, days: String(Math.max(days, 7)) })
    const baselineParams = new URLSearchParams({ job: execution.job_name, current_hours: '24', baseline_days: '7' })
    const correlationParams = new URLSearchParams({ job: execution.job_name, days: String(Math.min(Math.max(days, 1), 30)), limit: '120' })
    if (execution.program) {
      params.set('program', execution.program)
      baselineParams.set('program', execution.program)
      correlationParams.set('program', execution.program)
    }
    setLoading(true)
    setError('')
    Promise.all([
      loadJson(`${API}/jobs/analytics?${params.toString()}`, controller.signal),
      loadJson(`${API}/jobs/baseline?${baselineParams.toString()}`, controller.signal),
      loadJson(`${API}/jobs/correlation?${correlationParams.toString()}`, controller.signal),
    ]).then(([analytics, baseline, correlation]) => setDetail({ analytics, baseline, correlation }))
      .catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message || 'Job intelligence unavailable.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [days, execution.job_name, execution.program])

  if (!execution.job_name) return null
  const analytics = detail?.analytics || {}
  const baseline = detail?.baseline || {}
  const correlation = detail?.correlation || {}
  const signals = baseline?.signals || []
  const events = (correlation?.events || []).slice(-12).reverse()

  return <section className="rundeckJobIntelligence" aria-label="Job performance intelligence">
    <header>
      <div><strong>{execution.job_name}</strong><span>{execution.program || 'No Step Program supplied'} · {shortHost(execution.server || '') || 'Server not supplied'}</span></div>
      <span className={`rundeckJobMonitorStatus ${statusClass(baseline.status)}`}>{baseline.status || 'LOADING'}</span>
    </header>
    {loading && <div className="rundeckJobMonitorMessage">Loading execution analytics and historical baseline…</div>}
    {error && <div className="rundeckJobMonitorMessage is-error">{error}</div>}
    {!loading && !error && <>
      <div className="rundeckJobIntelligenceStats">
        <div><span>Executions</span><b>{analytics.execution_count ?? '—'}</b></div>
        <div><span>Success Rate</span><b>{analytics.success_rate_pct == null ? '—' : `${numberText(analytics.success_rate_pct, 1)}%`}</b></div>
        <div><span>Avg Duration</span><b>{durationText(analytics.avg_duration_seconds)}</b></div>
        <div><span>Max Duration</span><b>{durationText(analytics.max_duration_seconds)}</b></div>
        <div><span>Current Avg CPU</span><b>{pct(baseline.current_window?.avg_cpu_pct)}</b></div>
        <div><span>Baseline Avg CPU</span><b>{pct(baseline.baseline_window?.avg_cpu_pct)}</b></div>
        <div><span>Current Peak PSS</span><b>{gb(baseline.current_window?.peak_pss_gb)}</b></div>
        <div><span>Baseline Peak PSS</span><b>{gb(baseline.baseline_window?.peak_pss_gb)}</b></div>
      </div>
      <div className="rundeckJobIntelligenceGrid">
        <div>
          <strong>Baseline Signals</strong>
          {signals.length
            ? <ul>{signals.map((signal) => <li key={signal.metric}><span className={statusClass(signal.severity)}>{signal.severity}</span> {signal.label}: {signal.ratio}x baseline</li>)}</ul>
            : <p>No retained performance metric is 1.5x or more above the selected baseline.</p>}
        </div>
        <div>
          <strong>Correlation Timeline</strong>
          {events.length
            ? <ol>{events.map((event, index) => <li key={`${event.at}-${event.type}-${index}`}><time>{formatWib(event.at, true)} WIB</time><span>{event.label}</span></li>)}</ol>
            : <p>No correlated execution or workload events in the selected period.</p>}
        </div>
      </div>
      <small className="rundeckJobIntelligenceNote">Temporal alignment and baseline deviation are investigation signals only. Root-cause validation remains a Basis step.</small>
    </>}
  </section>
}

export default function RundeckJobMonitor({ refreshToken, onOpenLiveJob }) {
  const [days, setDays] = React.useState(1)
  const [data, setData] = React.useState(null)
  const [readiness, setReadiness] = React.useState(null)
  const [selected, setSelected] = React.useState(null)
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
      setSelected((current) => current || monitor?.review?.[0] || null)
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
        <p>SM37 execution health, long-running and failed jobs, retained performance baseline, and correlation evidence.</p>
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
        <thead><tr><th>Severity</th><th>Job</th><th>Program</th><th>Status</th><th>Start WIB</th><th>Duration</th><th>Server</th><th>Peak CPU</th><th>Critical WP</th><th>Signal</th><th>Actions</th></tr></thead>
        <tbody>
          {review.map((item, index) => {
            const execution = item.execution || {}
            const performance = item.performance || {}
            const active = selected === item
            return <tr key={`${execution.job_name}-${execution.job_count}-${execution.step_no}-${index}`} className={active ? 'is-selected' : ''}>
              <td><span className={`rundeckJobMonitorStatus ${statusClass(item.severity)}`}>{item.severity}</span></td>
              <td><button type="button" className="rundeckJobMonitorWorkload" onClick={() => setSelected(item)}>{execution.job_name || '—'}</button></td>
              <td title={execution.program || ''}>{execution.program || '—'}</td>
              <td><span className={statusClass(execution.status)}>{execution.status || '—'}</span></td>
              <td>{formatWib(execution.started_at, true)} WIB</td>
              <td>{durationText(execution.duration_seconds)}</td>
              <td>{shortHost(execution.server || '') || '—'}</td>
              <td>{performance.peak_cpu_pct == null ? '—' : `${numberText(performance.peak_cpu_pct, 1)}%`}</td>
              <td>{performance.max_critical_wp ?? '—'}</td>
              <td>{(item.signals || []).join(' · ') || 'Review required'}</td>
              <td><div className="rundeckJobMonitorActions"><button type="button" className="rundeckJobMonitorReport" onClick={() => onOpenLiveJob?.({ key: execution.job_name, host: execution.server, consumerType: 'JOB', source: 'job-monitor', at: execution.started_at })}>Live</button><button type="button" className="rundeckJobMonitorReport" onClick={() => downloadInvestigation(item)}>Report</button></div></td>
            </tr>
          })}
          {!loading && !review.length && <tr><td colSpan="11">{data?.source?.authoritative ? 'No execution currently needs review for this period.' : 'Job Monitor will populate after an approved SM37 execution feed is imported.'}</td></tr>}
        </tbody>
      </table>
    </div>

    {selected && <JobIntelligence item={selected} days={days} />}

    {readiness && <footer className="rundeckJobMonitorReadiness">
      <span>Workload History <b>{readiness.features?.workload_history || 'UNKNOWN'}</b></span>
      <span>SM37 Verification <b>{readiness.features?.sm37_verification || 'UNKNOWN'}</b></span>
      <span>Job Monitor <b>{readiness.features?.job_monitor || 'UNKNOWN'}</b></span>
      <span>Baseline <b>{readiness.features?.baseline || 'UNKNOWN'}</b></span>
      <span>Correlation <b>{readiness.features?.correlation || 'UNKNOWN'}</b></span>
    </footer>}
  </section>
}

import React from 'react'
import RundeckEvidenceTimeline from './RundeckEvidenceTimeline.jsx'
import RundeckJobHistory from './RundeckJobHistory.jsx'
import { numberText, workloadTypeLabel } from './sapUiFormat.js'
import { evaluationReasonText } from './rundeckEvaluationExplain.js'
import './RundeckReviewQuickAnalysis.css'

const API = `${import.meta.env.BASE_URL}api`
const STATUSES = [
  ['NORMAL_EXPECTED', 'Normal / Expected'],
  ['OBSERVE', 'Observe'],
  ['OPTIMIZATION_NEEDED', 'Optimization Needed'],
  ['SCHEDULE_REVIEW', 'Schedule Review'],
  ['INFRA_CORRELATED', 'Infra Correlated'],
  ['SAP_CAPACITY_REVIEW', 'SAP Capacity Review'],
  ['NEEDS_FURTHER_RCA', 'Needs Further RCA'],
  ['RESOLVED', 'Resolved'],
]

const pct = (value) => value === null || value === undefined ? '—' : `${numberText(value, 1)}%`
const gb = (value) => value === null || value === undefined ? '—' : `${numberText(value, 2)} GB`

function suggestedFinding(row = {}) {
  const parts = []
  const signals = row.signals || {}
  if (signals.sustained_high_cpu) parts.push('High CPU was repeatedly observed during the selected review window.')
  else if (signals.cpu_spike) parts.push('A CPU peak was observed during the selected review window.')
  if (signals.high_memory) parts.push('Memory usage was also above the review range.')
  if (signals.performance_shift || signals.increasing) parts.push('Recent CPU usage increased compared with the preceding window.')
  if (signals.critical_wp_correlated || signals.wp_excess_association) parts.push('Critical WP was observed in the same time window.')
  if (signals.baseline_anomaly) parts.push('The workload was above its retained historical baseline.')
  if (!parts.length) parts.push('The job or program met the performance review criteria for this period.')
  parts.push('These observations identify a review target and do not by themselves prove root cause.')
  return parts.join(' ')
}

function suggestedRecommendation(row = {}) {
  const signals = row.signals || {}
  if (signals.sustained_high_cpu || signals.high_memory || signals.baseline_anomaly) {
    return 'Review program processing logic and execution characteristics with the application or ABAP owner. Recheck CPU, memory, duration and Critical WP after the next execution.'
  }
  if (signals.performance_shift || signals.increasing) {
    return 'Review the recent workload change and compare it with prior executions. Validate again after the next scheduled run.'
  }
  return 'Continue observation and validate the next execution before closing the performance review.'
}

function defaultStatus(row = {}) {
  const signals = row.signals || {}
  if (signals.sustained_high_cpu || signals.high_memory || signals.baseline_anomaly) return 'OPTIMIZATION_NEEDED'
  if (signals.performance_shift || signals.increasing) return 'OBSERVE'
  return 'OBSERVE'
}

export default function RundeckReviewQuickAnalysis({
  row,
  reviewContext,
  refreshToken = '',
  incidentStart = '',
  onClose,
  onOpenFull,
}) {
  const [closing, setClosing] = React.useState(null)
  const [form, setForm] = React.useState(null)
  const [closingLoading, setClosingLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [saveMessage, setSaveMessage] = React.useState('')
  const drawerRef = React.useRef(null)

  const host = row?.hosts?.length === 1 ? row.hosts[0] : ''
  const job = row ? {
    key: row.consumer_key,
    host,
    consumerType: row.consumer_type,
    source: 'performance-review',
    days: reviewContext?.days || 1,
  } : null

  React.useEffect(() => {
    if (!row) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    queueMicrotask(() => drawerRef.current?.focus())
    return () => window.removeEventListener('keydown', onKey)
  }, [row, onClose])

  React.useEffect(() => {
    if (!row || !reviewContext?.end) return undefined
    const controller = new AbortController()
    const params = new URLSearchParams({
      type: row.consumer_type,
      job: row.consumer_key,
      period: reviewContext.period || '1d',
      window_end: reviewContext.end,
      host,
    })
    setClosingLoading(true)
    setSaveMessage('')
    fetch(`${API}/analysis/closing?${params.toString()}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail || `Closing record unavailable (${response.status})`)
        }
        return response.json()
      })
      .then((result) => {
        const item = result.item || null
        setClosing(item)
        setForm({
          closing_status: item?.closing_status || defaultStatus(row),
          finding: item?.finding || suggestedFinding(row),
          recommendation: item?.recommendation || suggestedRecommendation(row),
          owner: item?.owner || 'ABAP / Application',
          follow_up: item?.follow_up || 'Validate the next execution and compare CPU, memory, duration and Critical WP.',
        })
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        setClosing(null)
        setForm({
          closing_status: defaultStatus(row),
          finding: suggestedFinding(row),
          recommendation: suggestedRecommendation(row),
          owner: 'ABAP / Application',
          follow_up: 'Validate the next execution and compare CPU, memory, duration and Critical WP.',
        })
        setSaveMessage(error.message || 'Closing storage unavailable')
      })
      .finally(() => {
        if (!controller.signal.aborted) setClosingLoading(false)
      })
    return () => controller.abort()
  }, [host, reviewContext?.end, reviewContext?.period, row])

  if (!row) return null

  const reason = evaluationReasonText(row) || row.status || 'Review'
  const summaryMetrics = {
    avg_cpu_pct: row.avg_cpu_pct,
    peak_cpu_pct: row.peak_cpu_pct,
    avg_pss_gb: row.avg_pss_gb,
    peak_pss_gb: row.peak_pss_gb,
    avg_process_count: row.avg_process_count,
    peak_process_count: row.peak_process_count,
    occurrences: row.occurrences,
    observations: row.observations,
    critical_wp_checks: row.critical_wp_checks,
    first_seen: row.first_seen,
    last_seen: row.last_seen,
    baseline_status: row.baseline_status,
    anomaly_status: row.anomaly_status,
  }

  const saveClosing = async (event) => {
    event.preventDefault()
    if (!form || !reviewContext?.end) return
    setSaving(true)
    setSaveMessage('')
    try {
      const response = await fetch(`${API}/analysis/closing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consumer_type: row.consumer_type,
          consumer_key: row.consumer_key,
          host,
          period_key: reviewContext.period || '1d',
          window_start: reviewContext.start || null,
          window_end: reviewContext.end,
          closing_status: form.closing_status,
          finding: form.finding,
          recommendation: form.recommendation,
          owner: form.owner,
          follow_up: form.follow_up,
          metrics: summaryMetrics,
          evidence: {
            review_reason: reason,
            assessment_reason: row.assessment_reason || '',
            signals: row.signals || {},
            baseline_status: row.baseline_status || '',
            anomaly_status: row.anomaly_status || '',
            overall_confidence: row.overall_confidence || '',
          },
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.detail || `Save failed (${response.status})`)
      setClosing(body.item || null)
      setSaveMessage('Closing saved')
    } catch (error) {
      setSaveMessage(error.message || 'Closing save failed')
    } finally {
      setSaving(false)
    }
  }

  return <aside className="rundeckQuickAnalysisDrawer" aria-label="Quick performance analysis" ref={drawerRef} tabIndex={-1}>
    <header className="rundeckQuickAnalysisHead">
      <div>
        <span>{workloadTypeLabel(row.consumer_type)} · Quick Analysis</span>
        <h3>{row.consumer_key}</h3>
        <small>{reason}</small>
      </div>
      <button type="button" className="rundeckQuickClose" onClick={onClose} aria-label="Close quick analysis">×</button>
    </header>

    <div className="rundeckQuickMetrics">
      <span><b>Avg CPU</b>{pct(row.avg_cpu_pct)}</span>
      <span><b>Peak CPU</b>{pct(row.peak_cpu_pct)}</span>
      <span><b>Memory</b>{gb(row.avg_pss_gb)}</span>
      <span><b>Checks</b>{row.occurrences ?? '—'}</span>
      <span><b>Critical WP</b>{row.critical_wp_checks ?? '—'}</span>
      <span><b>Baseline</b>{row.anomaly_status || row.baseline_status || '—'}</span>
    </div>

    <div className="rundeckQuickScroll">
      <section className="rundeckQuickSection">
        <RundeckJobHistory job={job} refreshToken={refreshToken} incidentStart={incidentStart} />
      </section>

      <section className="rundeckQuickSection is-events">
        <RundeckEvidenceTimeline refreshToken={refreshToken} job={job} incidentActive />
      </section>

      <form className="rundeckClosingForm" onSubmit={saveClosing}>
        <div className="rundeckClosingHead">
          <div>
            <span>Closing Analysis</span>
            <strong>{closing ? 'Saved closing record' : 'Create closing record'}</strong>
          </div>
          {closingLoading && <small>Loading…</small>}
          {!closingLoading && closing?.closed_at && <small>Last saved</small>}
        </div>

        {form && <>
          <label>
            <span>Closing Status</span>
            <select value={form.closing_status} onChange={(event) => setForm({ ...form, closing_status: event.target.value })}>
              {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <label>
            <span>Finding</span>
            <textarea rows="4" value={form.finding} onChange={(event) => setForm({ ...form, finding: event.target.value })} />
          </label>

          <label>
            <span>Recommendation</span>
            <textarea rows="3" value={form.recommendation} onChange={(event) => setForm({ ...form, recommendation: event.target.value })} />
          </label>

          <div className="rundeckClosingGrid">
            <label>
              <span>Owner</span>
              <input value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} placeholder="ABAP / Basis / Application" />
            </label>
            <label>
              <span>Follow-up</span>
              <input value={form.follow_up} onChange={(event) => setForm({ ...form, follow_up: event.target.value })} placeholder="Validation after next execution" />
            </label>
          </div>

          <div className="rundeckClosingPreview">
            <strong>Report Preview</strong>
            <p><b>{row.consumer_key}</b> · {workloadTypeLabel(row.consumer_type)} · {reviewContext?.period?.toUpperCase() || '1D'}</p>
            <p>CPU {pct(row.avg_cpu_pct)} avg / {pct(row.peak_cpu_pct)} peak · Memory {gb(row.avg_pss_gb)} · Critical WP checks {row.critical_wp_checks ?? '—'}.</p>
            <p>{form.finding}</p>
            <p><b>{form.closing_status.replaceAll('_', ' ')}</b> · Owner: {form.owner || '—'} · {form.recommendation}</p>
          </div>

          <div className="rundeckClosingActions">
            <button type="button" onClick={() => onOpenFull?.(job)}>Open Full Analysis</button>
            <button type="submit" className="is-primary" disabled={saving}>{saving ? 'Saving…' : closing ? 'Update Closing' : 'Save Closing'}</button>
          </div>
          {saveMessage && <div className={`rundeckClosingMessage ${saveMessage === 'Closing saved' ? 'is-success' : ''}`}>{saveMessage}</div>}
        </>}
      </form>
    </div>
  </aside>
}

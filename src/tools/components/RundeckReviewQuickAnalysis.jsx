import React from 'react'
import RundeckEvidenceTimeline from './RundeckEvidenceTimeline.jsx'
import { numberText, workloadTypeLabel } from './sapUiFormat.js'
import { evaluationReasonText } from './rundeckEvaluationExplain.js'
import './RundeckReviewQuickAnalysis.css'

const API = `${import.meta.env.BASE_URL}api`
const STATUSES = [
  ['NORMAL_EXPECTED', 'Expected / No Action'],
  ['OBSERVE', 'Monitor'],
  ['OPTIMIZATION_NEEDED', 'Program Optimization Required'],
  ['SCHEDULE_REVIEW', 'Job Schedule Review'],
  ['INFRA_CORRELATED', 'Infrastructure Correlation'],
  ['SAP_CAPACITY_REVIEW', 'SAP Capacity Review'],
  ['NEEDS_FURTHER_RCA', 'Further RCA Required'],
  ['RESOLVED', 'Resolved'],
]

const pct = (value) => value === null || value === undefined ? '—' : `${numberText(value, 1)}%`
const gb = (value) => value === null || value === undefined ? '—' : `${numberText(value, 2)} GB`

function suggestedFinding(row = {}) {
  const parts = []
  const signals = row.signals || {}
  if (signals.sustained_high_cpu) parts.push('Sustained high CPU was observed during the selected review period.')
  else if (signals.cpu_spike) parts.push('A CPU spike was observed during the selected review period.')
  if (signals.high_memory) parts.push('Memory usage was above the normal range for this job or program.')
  if (signals.performance_shift || signals.increasing) parts.push('CPU usage increased compared with the previous review period.')
  if (signals.critical_wp_correlated || signals.wp_excess_association) parts.push('Critical Work Process activity overlapped with this job or program.')
  if (signals.baseline_anomaly) parts.push('Performance was above the retained historical baseline.')
  if (!parts.length) parts.push('This job or program met the configured performance review criteria.')
  parts.push('This is a performance correlation, not a confirmed root cause.')
  return parts.join(' ')
}

function suggestedRecommendation(row = {}) {
  const signals = row.signals || {}
  if (signals.sustained_high_cpu || signals.high_memory || signals.baseline_anomaly) {
    return 'Review the program logic, execution duration and data volume with the ABAP or application owner. Validate CPU, memory and Critical WP again on the next execution.'
  }
  if (signals.performance_shift || signals.increasing) {
    return 'Compare this execution with previous runs and review any recent program, variant, data-volume or scheduling changes. Validate again on the next run.'
  }
  return 'Monitor the next execution and compare CPU, memory, duration and Critical WP before closing the review.'
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
        setSaveMessage(error.message || 'Analysis result storage unavailable')
      })
      .finally(() => {
        if (!controller.signal.aborted) setClosingLoading(false)
      })
    return () => controller.abort()
  }, [host, reviewContext?.end, reviewContext?.period, row])

  if (!row) return null

  const reason = evaluationReasonText(row) || row.status || 'Review'
  const reviewDataPoints = Number(row.occurrences ?? row.observations ?? 0)
  const limitedSample = Number.isFinite(reviewDataPoints) && reviewDataPoints > 0 && reviewDataPoints < 6
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
      setSaveMessage('Analysis saved')
    } catch (error) {
      setSaveMessage(error.message || 'Analysis save failed')
    } finally {
      setSaving(false)
    }
  }

  return <aside className="rundeckQuickAnalysisDrawer" aria-label="Quick performance analysis" ref={drawerRef} tabIndex={-1}>
    <header className="rundeckQuickAnalysisHead">
      <div>
        <span>{workloadTypeLabel(row.consumer_type)} · Performance Review</span>
        <h3>{row.consumer_key}</h3>
        <small>{reason}</small>
      </div>
      <button type="button" className="rundeckQuickClose" onClick={onClose} aria-label="Close performance analysis">×</button>
    </header>

    <div className="rundeckQuickMetrics">
      <span><b>CPU Avg</b>{pct(row.avg_cpu_pct)}</span>
      <span><b>CPU Peak</b>{pct(row.peak_cpu_pct)}</span>
      <span><b>Memory Avg (PSS)</b>{gb(row.avg_pss_gb)}</span>
      <span className={limitedSample ? 'is-limited-sample' : ''}><b>Data Points</b>{row.occurrences ?? row.observations ?? '—'}{limitedSample && <em className="rundeckQuickSampleHint">Limited sample</em>}</span>
      <span><b>Critical WP During Period</b>{row.critical_wp_checks ?? '—'}</span>
      <span><b>Baseline</b>{row.anomaly_status || row.baseline_status || '—'}</span>
    </div>

    <div className="rundeckQuickScroll">
      <section className="rundeckQuickSection is-review-context">
        <div className="rundeckQuickReviewContext">
          <span><b>Review Period</b>{reviewContext?.period?.toUpperCase() || '1D'}</span>
          <span><b>Start</b>{reviewContext?.start || '—'}</span>
          <span><b>End</b>{reviewContext?.end || '—'}</span>
        </div>
        <button type="button" className="rundeckQuickOpenPerformance" onClick={() => onOpenFull?.(job)}>Open Performance Analysis</button>
      </section>

      <section className="rundeckQuickSection is-events">
        <RundeckEvidenceTimeline refreshToken={refreshToken} job={job} incidentActive />
      </section>

      <form className="rundeckClosingForm" onSubmit={saveClosing}>
        <div className="rundeckClosingHead">
          <div>
            <span>Analysis Result</span>
            <strong>{closing ? 'Saved analysis result' : 'New analysis result'}</strong>
          </div>
          {closingLoading && <small>Loading…</small>}
          {!closingLoading && closing?.closed_at && <small>Last saved</small>}
        </div>

        {form && <>
          <label>
            <span>Result</span>
            <select value={form.closing_status} onChange={(event) => setForm({ ...form, closing_status: event.target.value })}>
              {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <label>
            <span>Analysis Summary</span>
            <textarea rows="4" value={form.finding} onChange={(event) => setForm({ ...form, finding: event.target.value })} />
          </label>

          <label>
            <span>Recommended Action</span>
            <textarea rows="3" value={form.recommendation} onChange={(event) => setForm({ ...form, recommendation: event.target.value })} />
          </label>

          <div className="rundeckClosingGrid">
            <label>
              <span>Action Owner</span>
              <input value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} placeholder="ABAP / Basis / Application" />
            </label>
            <label>
              <span>Validation / Follow-up</span>
              <input value={form.follow_up} onChange={(event) => setForm({ ...form, follow_up: event.target.value })} placeholder="Validation after next execution" />
            </label>
          </div>

          <div className="rundeckClosingPreview">
            <strong>Closing Summary</strong>
            <p><b>{row.consumer_key}</b> · {workloadTypeLabel(row.consumer_type)} · {reviewContext?.period?.toUpperCase() || '1D'}</p>
            <p>CPU {pct(row.avg_cpu_pct)} avg / {pct(row.peak_cpu_pct)} peak · Memory {gb(row.avg_pss_gb)} · Critical WP during period {row.critical_wp_checks ?? '—'}.</p>
            <p>{form.finding}</p>
            <p><b>{form.closing_status.replaceAll('_', ' ')}</b> · Action Owner: {form.owner || '—'} · {form.recommendation}</p>
          </div>

          <div className="rundeckClosingActions">
            <button type="button" onClick={() => onOpenFull?.(job)}>Open Detailed Analysis</button>
            <button type="submit" className="is-primary" disabled={saving}>{saving ? 'Saving…' : closing ? 'Update Analysis' : 'Save Analysis'}</button>
          </div>
          {saveMessage && <div className={`rundeckClosingMessage ${saveMessage === 'Analysis saved' ? 'is-success' : ''}`}>{saveMessage}</div>}
        </>}
      </form>
    </div>
  </aside>
}

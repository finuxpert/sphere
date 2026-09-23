import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { numberText, workloadTypeLabel } from './sapUiFormat.js'
import { evaluationReasonText } from './rundeckEvaluationExplain.js'

const API = `${import.meta.env.BASE_URL}api`
const PERIODS = [['1d', '1 Day'], ['7d', '7 Days'], ['30d', '30 Days']]
const TYPES = [['ALL', 'All'], ['PROGRAM', 'Programs'], ['JOB', 'Jobs']]
const CPU_HINT = 'CPU Usage is the grouped workload observation and can exceed 100 percent when more than one CPU core is used.'

const pct = (value, digits = 1) => value === null || value === undefined ? '—' : `${numberText(value, digits)}%`
const gb = (value) => value === null || value === undefined ? '—' : `${numberText(value, 2)} GB`

function Segmented({ options, value, onChange, label }) {
  return <div className="rundeckReviewSegmented" role="group" aria-label={label}>
    {options.map(([key, text]) => <button key={key} type="button" className={value === key ? 'is-active' : ''} aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}
  </div>
}

export default function RundeckPerformanceReview({ refreshToken = '', selectedJob = null, onSelectJob }) {
  const [period, setPeriod] = React.useState('1d')
  const [type, setType] = React.useState('ALL')
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [showAll, setShowAll] = React.useState(false)

  React.useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(`${API}/evaluation/workloads?period=${encodeURIComponent(period)}&type=${encodeURIComponent(type)}&limit=100`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail || `Performance review unavailable (${response.status})`)
        }
        return response.json()
      })
      .then(setData)
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message || 'Performance review unavailable')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [period, type, refreshToken])

  const quality = data?.quality || {}
  const reviewRows = [...(data?.items || [])]
    .filter((row) => String(row.status || '').toUpperCase() === 'REVIEW REQUIRED')
    .sort((left, right) => Number(right.avg_cpu_pct || 0) - Number(left.avg_cpu_pct || 0))
  const reviewCount = Number(data?.summary?.review_required ?? data?.summary?.needs_review ?? reviewRows.length)
  const visibleRows = showAll ? reviewRows : reviewRows.slice(0, 4)
  const lowCoverage = String(quality.confidence || '').toUpperCase() === 'LOW'
  const incomplete = Number(quality.partial_or_incomplete_checks || 0)
  const showQualityWarning = lowCoverage || incomplete > 0

  const select = (row) => onSelectJob?.({
    key: row.consumer_key,
    host: '',
    consumerType: row.consumer_type,
    source: 'performance-review',
    days: data?.days || 1,
  })

  return <section className="rundeckPerformanceReviewV1231" aria-label="Performance review">
    <header className="rundeckReviewHeadV1231">
      <div>
        <h3><SphereIcon name="trend" /> Performance Review</h3>
        {!loading && !error && data && <span>{reviewCount} workload{reviewCount === 1 ? '' : 's'} need review</span>}
      </div>
      <div className="rundeckReviewControlsV1231">
        <Segmented options={PERIODS} value={period} onChange={(value) => { setPeriod(value); setShowAll(false) }} label="Review period" />
        <Segmented options={TYPES} value={type} onChange={(value) => { setType(value); setShowAll(false) }} label="Workload type" />
        {reviewRows.length > 4 && <button type="button" className="rundeckReviewMoreV1237" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Top 4' : `View all ${reviewRows.length}`}</button>}
      </div>
    </header>

    {loading && <div className="rundeckReviewState">Loading workload review…</div>}
    {error && <div className="rundeckReviewState is-error">{error}</div>}

    {!loading && !error && data && <>
      {showQualityWarning && <div className="rundeckReviewQualityWarning">
        {lowCoverage && <span>LIMITED DATA · {pct(quality.coverage_pct)} coverage</span>}
        {incomplete > 0 && <span>{numberText(incomplete, 0)} incomplete check{incomplete === 1 ? '' : 's'} excluded</span>}
      </div>}

      <div className="rundeckReviewTableWrapV1231">
        <table className="rundeckReviewTableV1231">
          <thead><tr><th>Workload</th><th>Signal</th><th>Avg CPU</th><th>Peak</th><th>PSS</th></tr></thead>
          <tbody>
            {visibleRows.map((row) => {
              const selected = selectedJob?.key === row.consumer_key && selectedJob?.consumerType === row.consumer_type
              const reason = evaluationReasonText(row)
              const title = [
                `Type: ${workloadTypeLabel(row.consumer_type)}`,
                row.assessment_reason || '',
                row.baseline_status ? `Baseline: ${row.baseline_status}` : '',
              ].filter(Boolean).join('\n')
              return <tr key={`${row.consumer_type}-${row.consumer_key}`} className={selected ? 'is-selected' : ''}>
                <td className="rundeckReviewWorkloadV1231" title={title}>
                  <button type="button" onClick={() => select(row)}>{row.consumer_key}</button>
                  <small>{workloadTypeLabel(row.consumer_type)}</small>
                </td>
                <td>{reason || row.status || 'Review'}</td>
                <td title={CPU_HINT}>{pct(row.avg_cpu_pct)}</td>
                <td title={CPU_HINT}>{pct(row.peak_cpu_pct)}</td>
                <td>{gb(row.avg_pss_gb)}</td>
              </tr>
            })}
            {!reviewRows.length && <tr><td colSpan="5">No workloads currently require review for this period.</td></tr>}
          </tbody>
        </table>
      </div>
    </>}
  </section>
}

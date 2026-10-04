import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { numberText, workloadTypeLabel } from './sapUiFormat.js'
import { evaluationReasonParts } from './rundeckEvaluationExplain.js'
import RundeckReviewQuickAnalysis from './RundeckReviewQuickAnalysis.jsx'

const API = `${import.meta.env.BASE_URL}api`
const PERIODS = [['1d', '1D'], ['7d', '7D'], ['30d', '30D']]
const TYPES = [['ALL', 'All'], ['PROGRAM', 'Programs'], ['JOB', 'Jobs']]
const CPU_HINT = 'CPU Usage is the grouped workload observation and can exceed 100 percent when more than one CPU core is used.'

const pct = (value, digits = 1) => value === null || value === undefined ? '—' : `${numberText(value, digits)}%`
const gb = (value) => value === null || value === undefined ? '—' : `${numberText(value, 2)} GB`

function Segmented({ options, value, onChange, label, disabled = false }) {
  return <div className="rundeckReviewSegmented" role="group" aria-label={label}>
    {options.map(([key, text]) => <button key={key} type="button" className={value === key ? 'is-active' : ''} aria-pressed={value === key} disabled={disabled} onClick={() => onChange(key)}>{text}</button>)}
  </div>
}

export default function RundeckPerformanceReview({ refreshToken = '', selectedJob = null, onSelectJob, incidentStart = '', onOpenQuickAnalysis = null, externalQuickKey = '', embedded = false, forceSearch = false }) {
  const [period, setPeriod] = React.useState('1d')
  const [type, setType] = React.useState('ALL')
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [hasLoaded, setHasLoaded] = React.useState(false)
  const [quickRow, setQuickRow] = React.useState(null)
  const [loadedPeriod, setLoadedPeriod] = React.useState('')
  const [loadedType, setLoadedType] = React.useState('')
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')

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
      .then((result) => {
        setData(result)
        setLoadedPeriod(period)
        setLoadedType(type)
        setHasLoaded(true)
      })
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message || 'Performance review unavailable')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [period, type, refreshToken])

  const quality = data?.quality || {}
  const periodLabel = PERIODS.find(([key]) => key === period)?.[1] || period.toUpperCase()
  const typeLabel = TYPES.find(([key]) => key === type)?.[1] || type
  const showingPreviousResult = loading && hasLoaded && (loadedPeriod !== period || loadedType !== type)
  const allRows = [...(data?.items || [])]
  const reviewRows = allRows
    .filter((row) => String(row.status || '').toUpperCase() === 'REVIEW REQUIRED')
    .sort((left, right) => Number(right.avg_cpu_pct || 0) - Number(left.avg_cpu_pct || 0))
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const effectiveSearchOpen = forceSearch || searchOpen
  const searchActive = effectiveSearchOpen && normalizedSearch.length >= 2
  const searchRows = searchActive
    ? allRows.filter((row) => [row.consumer_key, row.program, row.details?.program]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch)))
        .sort((left, right) => Number(right.peak_cpu_pct || right.avg_cpu_pct || 0) - Number(left.peak_cpu_pct || left.avg_cpu_pct || 0))
    : []
  const reviewCount = Number(data?.summary?.review_required ?? data?.summary?.needs_review ?? reviewRows.length)
  const visibleRows = searchActive ? searchRows : reviewRows
  const lowCoverage = String(quality.confidence || '').toUpperCase() === 'LOW'
  const incomplete = Number(quality.partial_or_incomplete_checks || 0)
  const showQualityWarning = lowCoverage || incomplete > 0

  const openQuick = (row) => {
    if (onOpenQuickAnalysis) {
      setQuickRow(null)
      onOpenQuickAnalysis(row, { period, days: data?.days || 1, start: data?.start || '', end: data?.end || '' })
      return
    }
    setQuickRow(row)
  }
  const openFull = (job) => {
    setQuickRow(null)
    onSelectJob?.(job)
  }

  return <section className="rundeckPerformanceReviewV1231 is-scroll-list" aria-label="Performance review">
    <header className={`rundeckReviewHeadV1231${embedded ? ' is-embedded' : ''}`}>
      <div>
        {!embedded && <h3><SphereIcon name="trend" /> Jobs & Programs to Review</h3>}
        {!loading && !error && data && <span>{searchActive
          ? `${searchRows.length} historical match${searchRows.length === 1 ? '' : 'es'} · ${periodLabel}`
          : `${reviewCount} item${reviewCount === 1 ? '' : 's'} · Basis review priority`}</span>}
      </div>
      <div className="rundeckReviewControlsV1231">
        {!forceSearch && <button type="button" className={searchOpen ? 'is-active' : ''} onClick={() => { setSearchOpen((value) => !value); if (searchOpen) setSearchQuery('') }}>Search</button>}
        <Segmented options={PERIODS} value={period} onChange={(value) => setPeriod(value)} label="Review period" disabled={loading && !hasLoaded} />
        <Segmented options={TYPES} value={type} onChange={(value) => setType(value)} label="Workload type" disabled={loading && !hasLoaded} />
      </div>
    </header>

    {effectiveSearchOpen && <div className="rundeckReviewSearch">
      <input
        type="search"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Search job or program (min. 2 characters)"
        aria-label="Search historical job or program"
        autoFocus
      />
      {searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search">×</button>}
    </div>}
    {loading && !hasLoaded && <div className="rundeckReviewState">Loading performance review…</div>}
    {loading && hasLoaded && <div className="rundeckReviewUpdating" role="status">
      Updating {periodLabel}{type !== 'ALL' ? ` · ${typeLabel}` : ''}…
      {showingPreviousResult && <span>Showing previous result until the new review is ready.</span>}
    </div>}
    {error && <div className="rundeckReviewState is-error">{error}</div>}

    {!error && data && <>
      {showQualityWarning && <div className="rundeckReviewQualityWarning">
        {lowCoverage && <span>LIMITED DATA · {pct(quality.coverage_pct)} coverage</span>}
        {incomplete > 0 && <span>{numberText(incomplete, 0)} incomplete check{incomplete === 1 ? '' : 's'} excluded</span>}
      </div>}

      <div className={`rundeckReviewTableWrapV1231${loading && hasLoaded ? ' is-updating' : ''}`}>
        <table className="rundeckReviewTableV1231">
          <thead><tr><th>Job / Program</th><th>Reason</th><th>Avg CPU</th><th>Peak CPU</th><th>Avg PSS</th></tr></thead>
          <tbody>
            {visibleRows.map((row) => {
              const selected = selectedJob?.key === row.consumer_key && selectedJob?.consumerType === row.consumer_type
              const internalQuickSelected = quickRow?.consumer_key === row.consumer_key && quickRow?.consumer_type === row.consumer_type
              const externalQuickSelected = externalQuickKey === `${row.consumer_type}:${row.consumer_key}`
              const quickSelected = internalQuickSelected || externalQuickSelected
              const reasonParts = evaluationReasonParts(row)
              const title = [
                `Type: ${workloadTypeLabel(row.consumer_type)}`,
                row.assessment_reason || '',
                row.baseline_status ? `Baseline: ${row.baseline_status}` : '',
              ].filter(Boolean).join('\n')
              return <tr
                key={`${row.consumer_type}-${row.consumer_key}`}
                className={`${selected ? 'is-selected ' : ''}${quickSelected ? 'is-quick-selected' : ''}`.trim()}
                tabIndex={0}
                role="button"
                title="Open quick performance analysis"
                onClick={() => openQuick(row)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  openQuick(row)
                }}
              >
                <td className="rundeckReviewWorkloadV1231" title={title}>
                  <button type="button" title={row.consumer_key} onClick={(event) => { event.stopPropagation(); openQuick(row) }}>{row.consumer_key}</button>
                  <small>{workloadTypeLabel(row.consumer_type)}</small>
                </td>
                <td><div className="rundeckReviewReasonChips">{reasonParts.length ? reasonParts.map((part) => <span key={part}>{part}</span>) : <span>{row.status || 'Review'}</span>}</div></td>
                <td title={CPU_HINT}>{pct(row.avg_cpu_pct)}</td>
                <td title={CPU_HINT}>{pct(row.peak_cpu_pct)}</td>
                <td>{gb(row.avg_pss_gb)}</td>
              </tr>
            })}
            {!visibleRows.length && <tr><td colSpan="5">{searchActive ? 'No historical job or program matches this search.' : 'No job or program needs review for this period.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </>}
    {!onOpenQuickAnalysis && quickRow && <RundeckReviewQuickAnalysis
      row={quickRow}
      reviewContext={{ period, days: data?.days || 1, start: data?.start || '', end: data?.end || '' }}
      refreshToken={refreshToken}
      incidentStart={incidentStart}
      onClose={() => setQuickRow(null)}
      onOpenFull={openFull}
    />}
  </section>
}

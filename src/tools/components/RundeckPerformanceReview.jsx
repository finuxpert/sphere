import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { formatWib, numberText, workloadTypeLabel, shortHost } from './sapUiFormat.js'
import { evaluationReasonParts } from './rundeckEvaluationExplain.js'

const RundeckReviewQuickAnalysis = React.lazy(() => import('./RundeckReviewQuickAnalysis.jsx'))
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

export default function RundeckPerformanceReview({ refreshToken = '', selectedJob = null, onSelectJob, incidentStart = '', onOpenQuickAnalysis = null, externalQuickKey = '', embedded = false, forceSearch = false, hideSearchButton = false, reviewJumpToken = 0, reviewJumpHealth = 'REVIEW' }) {

  const [period, setPeriod] = React.useState('1d')
  const [type, setType] = React.useState('ALL')
  const [healthGroup, setHealthGroup] = React.useState(forceSearch ? 'ALL' : reviewJumpToken ? reviewJumpHealth : 'REVIEW')
  const [pageIndex, setPageIndex] = React.useState(0)
  const [viewportHeight, setViewportHeight] = React.useState(() => typeof window === 'undefined' ? 864 : window.innerHeight)
  const [fittedRows, setFittedRows] = React.useState(null)
  const tableWrapRef = React.useRef(null)
  const initialPageSize = viewportHeight <= 720 ? 5 : viewportHeight <= 860 ? 8 : 10
  const pageSize = fittedRows ?? initialPageSize
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [hasLoaded, setHasLoaded] = React.useState(false)
  const [loadedKey, setLoadedKey] = React.useState('')
  const [quickRow, setQuickRow] = React.useState(null)
  const [loadedPeriod, setLoadedPeriod] = React.useState('')
  const [loadedType, setLoadedType] = React.useState('')
  const [searchOpen, setSearchOpen] = React.useState(embedded)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [appliedQuery, setAppliedQuery] = React.useState('')
  React.useEffect(() => {
    if (!reviewJumpToken) return
    setPeriod('1d')
    setHealthGroup(['REVIEW','ATTENTION','UNKNOWN','NORMAL'].includes(reviewJumpHealth) ? reviewJumpHealth : 'REVIEW')
    setSearchQuery('')
    setAppliedQuery('')
    setSearchOpen(embedded)
    setPageIndex(0)
  }, [reviewJumpToken, reviewJumpHealth])
  React.useLayoutEffect(() => {
    if (typeof window === 'undefined') return undefined
    const updateFit = () => {
      const top = tableWrapRef.current?.getBoundingClientRect().top
      if (!Number.isFinite(top)) return
      // Fit complete rows; pagination remains backend owned.
       const fits = Math.min(16, Math.max(3, Math.floor((window.innerHeight - top - 86) / 47)))
      setFittedRows(old => old === fits ? old : fits)
    }
    updateFit()
    window.addEventListener('resize', updateFit, { passive: true })
    return () => window.removeEventListener('resize', updateFit)
  }, [viewportHeight, data?.end, healthGroup, period, type])

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const update = () => setViewportHeight(window.innerHeight)
    window.addEventListener('resize', update, { passive:true })
    return () => window.removeEventListener('resize', update)
  }, [])
  React.useEffect(() => {
    const timer = setTimeout(() => setAppliedQuery(searchQuery.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])
  const effectiveSearchOpen = forceSearch || searchOpen
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const searchActive = effectiveSearchOpen && normalizedSearch.length >= 2
  const searchPending = searchActive && appliedQuery.toLowerCase() !== normalizedSearch
  const requestKey = [period,type,healthGroup,pageIndex,pageSize,forceSearch ? 'SEARCH' : 'REVIEW',effectiveSearchOpen && appliedQuery.length >= 2 ? appliedQuery : ''].join('|')
  React.useEffect(() => {
    if (forceSearch && appliedQuery.length < 2) {
      setData(null)
      setHasLoaded(false)
      setLoadedKey('')
      setLoading(false)
      return undefined
    }
    const controller = new AbortController()
    setLoading(true)
    setError('')
    const params = new URLSearchParams({
      period, type, health:healthGroup, limit:String(pageSize),
      offset:String(pageIndex * pageSize),
      q: effectiveSearchOpen && appliedQuery.length >= 2 ? appliedQuery : '',
    })
    fetch(`${API}/evaluation/workloads?${params.toString()}`, { cache:'no-store', signal:controller.signal })
      .then(async response => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail || `Performance review unavailable (${response.status})`)
        }
        return response.json()
      })
      .then(result => {
        if (controller.signal.aborted) return
        if (!result.page || result.page.scope !== 'FULL_EVALUATED_POPULATION') {
          throw new Error('Backend pagination unavailable; refusing partial historical search')
        }
        if (pageIndex > 0 && pageIndex * pageSize >= result.page.total) {
          setPageIndex(Math.max(0, Math.ceil(result.page.total / pageSize) - 1))
          return
        }
        setData(result)
        setLoadedPeriod(period)
        setLoadedType(type)
        setLoadedKey(requestKey)
        setHasLoaded(true)
      })
      .catch(failure => {
        if (failure.name !== 'AbortError' && !controller.signal.aborted) setError(failure.message || 'Performance review unavailable')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [period, type, healthGroup, appliedQuery, pageIndex, pageSize, refreshToken, forceSearch, effectiveSearchOpen, requestKey])

  const quality = data?.quality || {}
  const periodLabel = PERIODS.find(([key]) => key === period)?.[1] || period.toUpperCase()
  const typeLabel = TYPES.find(([key]) => key === type)?.[1] || type
  const showingPreviousResult = loading && hasLoaded && (loadedPeriod !== period || loadedType !== type)
  const allRows = [...(data?.items || [])] // Backend-filtered and paginated, never global top 100.
  const reviewRows = allRows
  const searchRows = allRows
  const visibleRows = loadedKey !== requestKey ? [] : forceSearch ? (searchActive && !searchPending ? searchRows : []) : (searchActive && !searchPending ? searchRows : reviewRows)
  const totalMatching = Number(data?.page?.total ?? 0)
  const totalPages = Math.max(1, Math.ceil(totalMatching / pageSize))
  const currentPage = Math.min(pageIndex, totalPages-1)
  const lowCoverage = String(quality.confidence || '').toUpperCase() === 'LOW'
  const incomplete = Number(quality.partial_or_incomplete_checks || 0)
  const showQualityWarning = lowCoverage || incomplete > 0
  const changePage = next => setPageIndex(Math.max(0, Math.min(totalPages-1, next)))
  const changePeriod = value => { setPeriod(value); setPageIndex(0) }
  const changeType = value => { setType(value); setPageIndex(0) }
  const changeGroup = value => { setHealthGroup(value); setPageIndex(0) }

  const reviewHosts = (row) => {
    const names = Array.isArray(row?.hosts) ? row.hosts : (row?.host ? [row.host] : [])
    return [...new Set(names.map(host => typeof host === 'string' ? host : host?.host).filter(Boolean))]
  }
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
        {!loading && !error && data && <span>{forceSearch
          ? (searchActive ? `${totalMatching} matches · ${periodLabel}` : 'Search historical jobs and programs')
          : searchActive ? `${totalMatching} matches · ${periodLabel}`
            : `${totalMatching} ${healthGroup === 'REVIEW' ? 'items · Basis review priority' : 'evaluations · selected category'}`}</span>}
      </div>
      <div className="rundeckReviewControlsV1231">
        {!forceSearch && !hideSearchButton && <button type="button" className={searchOpen ? 'is-active' : ''} onClick={() => { setSearchOpen((value) => !value); if (searchOpen) setSearchQuery('') }}>Search</button>}
        <Segmented options={PERIODS} value={period} onChange={changePeriod} label="Review period" disabled={loading && !hasLoaded} />
        <Segmented options={TYPES} value={type} onChange={changeType} label="Workload type" disabled={loading && !hasLoaded} />
        <select className="rundeckReviewHealthFilter" aria-label="Evaluation category" value={healthGroup} onChange={event => changeGroup(event.target.value)}>
          <option value="REVIEW">Review required</option>
          <option value="ATTENTION">Watch</option>
          <option value="NORMAL">Normal</option>
          <option value="UNKNOWN">Limited / unknown</option>
          <option value="ALL">All evaluations</option>
        </select>
    {effectiveSearchOpen && <div className="rundeckReviewSearch">
      <input
        type="search"
        value={searchQuery}
        onChange={(event) => { setSearchQuery(event.target.value); setPageIndex(0) }}
        placeholder="Search job / program"
        aria-label="Search historical job or program"
      />
      {searchQuery && <button type="button" onClick={() => {setSearchQuery('');setPageIndex(0)}} aria-label="Clear search">×</button>}
    </div>}
      </div>
    </header>

    {loading && !hasLoaded && <div className="rundeckReviewState">Loading performance review…</div>}
    {loading && hasLoaded && <div className="rundeckReviewUpdating" role="status">
      Updating {periodLabel}{type !== 'ALL' ? ` · ${typeLabel}` : ''}…
      {showingPreviousResult && <span>Showing previous result until the new review is ready.</span>}
    </div>}
    {error && <div className="rundeckReviewState is-error">{error}</div>}

    {!error && data && <>
      <div className="rundeckReviewWindow" title="Window bounds are saved evaluation observations, not job start/end times">Saved evaluation {periodLabel} · {data?.start ? formatWib(data.start, true) + ' WIB' : 'start unknown'} – {data?.end ? formatWib(data.end, true) + ' WIB' : 'end unknown'}</div>
      {showQualityWarning && <div className="rundeckReviewQualityWarning">
        {lowCoverage && <span>LIMITED DATA · {pct(quality.coverage_pct)} coverage</span>}
        {incomplete > 0 && <span>{numberText(incomplete, 0)} incomplete check{incomplete === 1 ? '' : 's'} excluded</span>}
      </div>}

      <div ref={tableWrapRef} className={`rundeckReviewTableWrapV1231${loading && hasLoaded ? ' is-updating' : ''}`}>
        <table className="rundeckReviewTableV1231">
          <thead><tr><th scope="col">Job / Program</th><th scope="col">Review Reason</th><th scope="col" title={CPU_HINT}>Avg CPU (cores)</th><th scope="col" title={CPU_HINT}>Peak CPU (cores)</th><th scope="col" title="Proportional Set Size; not APP host RAM">Avg PSS (GB)</th></tr></thead>
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
                  <small>{workloadTypeLabel(row.consumer_type)} · {reviewHosts(row).length ? reviewHosts(row).map(host => shortHost(host)).join(', ') : 'APP evidence unavailable'}</small>
                </td>
                <td title={[row.assessment_reason || '', row.baseline_status ? 'Baseline: ' + row.baseline_status : ''].filter(Boolean).join(' · ') || 'Evaluation reason not provided'}><div className="rundeckReviewReasonChips">{reasonParts.length ? reasonParts.map((part) => <span key={part}>{part}</span>) : <span>{row.status || 'Review'}</span>}</div></td>
                <td title={CPU_HINT}>{pct(row.avg_cpu_pct)}</td>
                <td title={CPU_HINT}>{pct(row.peak_cpu_pct)}</td>
                <td>{gb(row.avg_pss_gb)}</td>
              </tr>
            })}
            {!visibleRows.length && <tr><td colSpan="5">{searchPending || loading || loadedKey !== requestKey
              ? 'Searching the saved evaluations…'
              : forceSearch && normalizedSearch.length < 2
                ? 'Type at least 2 characters to search historical jobs and programs.'
                : 'No matching jobs or programs in the full evaluated population.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <nav className="rundeckReviewPager" aria-label="Historical evaluation pages">
        <small>{totalMatching} {totalMatching === 1 ? 'match' : 'matches'} · Page {currentPage+1}/{totalPages}</small>
        <button type="button" disabled={loading || currentPage === 0} onClick={() => changePage(currentPage - 1)}>Previous</button>
        <button type="button" disabled={loading || currentPage >= totalPages - 1} onClick={() => changePage(currentPage + 1)}>Next</button>
      </nav>
    </>}
    {!onOpenQuickAnalysis && quickRow && <React.Suspense fallback={<div className="rundeckReviewState" role="status">Loading quick analysis…</div>}><RundeckReviewQuickAnalysis
      row={quickRow}
      reviewContext={{ period, days: data?.days || 1, start: data?.start || '', end: data?.end || '' }}
      refreshToken={refreshToken}
      incidentStart={incidentStart}
      onClose={() => setQuickRow(null)}
      onOpenFull={openFull}
    /></React.Suspense>}
  </section>
}

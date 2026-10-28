import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { formatWib } from './sapUiFormat.js'
import { validatedWorkloadDots, workloadHealthLevel, workloadHealthPreview } from './rundeckWorkloadHealthState.js'
import { workloadDotLayout } from './rundeckWorkloadGrid.js'
import RundeckEvaluationGlobe from './RundeckEvaluationGlobe.jsx'
import RundeckWorkloadAppLanes from './RundeckWorkloadAppLanes.jsx'
import { validatedAppEvaluationMemberships } from './rundeckWorkloadAppLanes.js'

const API = import.meta.env.BASE_URL + 'api'
const MIN_REFRESH_MS = 5 * 60 * 1000
const API_PAGE_SIZE = 100
// All visible hexagons represent individually verified backend evaluations.
// Beyond this limit, show verified counts and a Review link rather than hiding records.
const MAX_VISIBLE_DOTS = 800
const SEVERITY_ORDER = { review: 0, attention: 1, unknown: 2, normal: 3 }
const LEVELS = [
  { key: 'review', label: 'Review', health: 'REVIEW' },
  { key: 'attention', label: 'Attention', health: 'ATTENTION' },
  { key: 'unknown', label: 'Data limited', health: 'UNKNOWN' },
  { key: 'normal', label: 'Normal', health: 'NORMAL' },
]

async function readPage(offset, signal) {
  const params = new URLSearchParams({
    period: '1d', type: 'ALL', health: 'ALL',
    limit: String(API_PAGE_SIZE), offset: String(offset),
  })
  const response = await fetch(API + '/evaluation/workloads?' + params.toString(), { cache: 'no-store', signal })
  if (!response.ok) throw new Error('Evaluation unavailable (' + response.status + ')')
  return response.json()
}

async function readVerifiedPopulation(signal) {
  const first = await readPage(0, signal)
  const preview = workloadHealthPreview(first)
  if (!preview || !Array.isArray(first.items) ||
      first.page?.scope !== 'FULL_EVALUATED_POPULATION' ||
      first.page?.health !== 'ALL' || first.page?.offset !== 0 ||
      first.page?.total !== preview.total ||
      first.page?.returned !== first.items.length ||
      first.items.length !== Math.min(preview.total, API_PAGE_SIZE)) {
    throw new Error('Evaluated workload population unverified')
  }
  if (preview.total > MAX_VISIBLE_DOTS) {
    return { preview, rows: [], tooMany: true, start: first.start || '', end: first.end || '' }
  }
  const offsets = []
  for (let offset = API_PAGE_SIZE; offset < preview.total; offset += API_PAGE_SIZE) offsets.push(offset)
  const following = await Promise.all(offsets.map(offset => readPage(offset, signal)))
  const completePageSize = Math.max(API_PAGE_SIZE, Math.ceil(preview.total / API_PAGE_SIZE) * API_PAGE_SIZE)
  // Validate full backend identity, window, totals and population before drawing any evaluation hexagon.
  // Existing validator ensures every page has identical window, population and status totals,
  // unique consumer identity, and category counts matching the backend summary.
  const verified = validatedWorkloadDots(first, following, 0, completePageSize)
  if (!verified || verified.rows.length !== preview.total) {
    throw new Error('Workload rows do not match the saved evaluation snapshot')
  }
  if (!validatedAppEvaluationMemberships(verified.rows, preview.total)) {
    throw new Error('APP evaluation membership totals do not match the saved population')
  }
  return { preview: verified.preview, rows: verified.rows, tooMany: false, start: verified.start, end: verified.end }
}

/** One saved 1D evaluation = one selectable hexagon, without 400+1 pagination. */
export default function RundeckWorkloadHealth({ refreshToken = '', performanceVerified = false, onReview, onSelectWorkload, onOpenApp, viewMode = 'globe' }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [retryToken, setRetryToken] = React.useState(0)
  const loadedAt = React.useRef(0)
  const loadedRefreshToken = React.useRef(null)
  const dotGridRef = React.useRef(null)
  const [dotLayout, setDotLayout] = React.useState({ size: 10, gap: 2, columns: 1, fits: true })
  const [globeEnabled, setGlobeEnabled] = React.useState(false)
  const [globeExpanded, setGlobeExpanded] = React.useState(false)
  const [activeDotIndex, setActiveDotIndex] = React.useState(0)
  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia('(min-width:900px) and (prefers-reduced-motion: no-preference)')
    const sync = () => setGlobeEnabled(query.matches)
    sync()
    query.addEventListener?.('change', sync)
    return () => query.removeEventListener?.('change', sync)
  }, [])

  React.useEffect(() => {
    if (loadedAt.current > 0 && loadedRefreshToken.current === refreshToken &&
        Date.now() - loadedAt.current < MIN_REFRESH_MS) return undefined
    const controller = new AbortController()
    let retryTimer
    setLoading(true)
    setError('')
    readVerifiedPopulation(controller.signal).then(result => {
      if (controller.signal.aborted) return
      setData(result)
      loadedAt.current = Date.now()
      loadedRefreshToken.current = refreshToken
    }).catch(failure => {
      if (controller.signal.aborted) return
      setData(null)
      loadedAt.current = 0
      loadedRefreshToken.current = null
      setError(failure.message || 'Evaluation unavailable')
      retryTimer = window.setTimeout(() => setRetryToken(value => value + 1), 60_000)
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort(); window.clearTimeout(retryTimer) }
  }, [refreshToken, retryToken])

  const preview = loading || error ? null : data?.preview
  const rows = React.useMemo(() =>
    preview && !data?.tooMany ? [...(data?.rows || [])].sort((left, right) =>
      SEVERITY_ORDER[workloadHealthLevel(left)] - SEVERITY_ORDER[workloadHealthLevel(right)] ||
      String(left.consumer_key).localeCompare(String(right.consumer_key))) : [],
  [data, preview])
  React.useEffect(() => { setActiveDotIndex(0) }, [rows])
  React.useLayoutEffect(() => {
    const grid = dotGridRef.current
    if (!grid) return undefined
    const measure = () => {
      const next = workloadDotLayout({ count: rows.length, width: grid.clientWidth, height: grid.clientHeight })
      setDotLayout(previous => previous.size === next.size && previous.gap === next.gap &&
        previous.columns === next.columns && previous.fits === next.fits ? previous : next)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(grid)
    window.addEventListener('resize', measure, { passive: true })
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [rows.length])

  const insufficient = rows.filter(row => workloadHealthLevel(row) === 'unknown' &&
    String(row.status || '').toUpperCase() === 'INSUFFICIENT DATA').length
  const otherUnknown = preview && !data?.tooMany
    ? Math.max(0, Number(preview.health.unknown) - insufficient) : null
  const unknownDescription = otherUnknown === null
    ? 'Unknown evaluations need evidence review.'
    : `${insufficient} insufficient data · ${otherUnknown} other unknown statuses. UNKNOWN is not NORMAL and is not an SM37 result.`
  const state = error ? 'unavailable' : loading ? 'loading' : !preview ? 'unavailable' :
    preview.total === 0 ? 'empty' : preview.reviewRequired > 0 ? 'review' :
    Number(preview.health.attention) > 0 ? 'attention' :
    (preview.limited || Number(preview.health.unknown) > 0) ? 'limited' : 'normal'
  const period = data?.start && data?.end
    ? `${formatWib(data.start, true)} – ${formatWib(data.end, true)} WIB`
    : 'Window unavailable'
  const outcome = error ? 'Evaluation unavailable' : loading ? 'Loading evaluations…' :
    !preview ? 'No verified evaluation' : preview.total === 0 ? 'No evaluations' :
      data?.tooMany ? 'Open Review for individual evaluations' :
      preview.reviewRequired ? 'Needs review' :
    Number(preview.health.attention) > 0 ? 'Watch items recorded' :
    (preview.limited || Number(preview.health.unknown) > 0) ? 'Limited evidence' : 'No review flagged'
  const openWorkload = row => onSelectWorkload?.(row, {
    period: '1d', days: 1, start: data?.start || '', end: data?.end || '',
  })
  // A single Tab enters the entire 1:1 saved-evaluation population.
  // Arrow keys navigate real buttons; Enter/Space open the same verified detail.
  const handleDotNavigation = (event, index) => {
    const buttons = dotGridRef.current?.querySelectorAll('button.rundeckWorkloadDot')
    const count = buttons?.length || 0
    if (!count) return
    let next = index
    const columns = Math.max(1, dotLayout.columns)
    if (event.key === 'ArrowRight') next = index + 1
    else if (event.key === 'ArrowLeft') next = index - 1
    else if (event.key === 'ArrowDown') next = index + columns
    else if (event.key === 'ArrowUp') next = index - columns
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = count - 1
    else return
    event.preventDefault()
    next = Math.max(0, Math.min(count - 1, next))
    setActiveDotIndex(next)
    buttons[next]?.focus({ preventScroll: true })
  }
  const statusNote = rows.length && dotLayout.fits
    ? viewMode === 'by-app'
      ? '1 hexagon = 1 saved evaluation–APP link (not an OS process)'
      : '1 hexagon = 1 saved evaluation (not an OS process)'
    : 'Open Review to inspect individual evaluations'

  return <section className={'rundeckWorkloadHealth' + (viewMode === 'by-app' ? ' is-by-app' : '')}
    data-state={state} data-coverage={preview && Number(preview.health.unknown) > 0 ? 'limited' : 'complete'} data-density={rows.length > 500 ? 'dense' : 'normal'}
    aria-label="Workload Health evaluated jobs and programs" aria-busy={loading}>
    <header className="rundeckWorkloadHealthTitle">
      <span><span className="rundeckWorkloadHealthBrand"><SphereIcon name="hexagon" /><strong>Job &amp; Program Evaluation</strong></span><small title={`Saved evaluation window: ${period}. A 1D evaluated population is different from Current collection workloads; neither is SAP SM37 job status.`}>Saved 24h · {preview ? preview.total.toLocaleString('en-US') + ' evaluated' : 'unverified'} · {preview && data?.end ? formatWib(data.end, true) + ' WIB' : 'time unverified'}</small></span>
      <button type="button" className="rundeckWorkloadHealthReview" onClick={() => onReview?.('REVIEW')}
        aria-label="Open Jobs & Programs Review">Open Review</button>
    </header>
    <div className="rundeckWorkloadHealthLegend" aria-label="Filter saved evaluations by review category">
      {LEVELS.map(level => <button type="button" key={level.key} className={'rundeckWorkloadCategory is-' + level.key}
        onClick={() => onReview?.(level.health)} disabled={!preview}
        title={level.key === 'unknown' ? unknownDescription + ' Click to review full saved evaluations.' : 'Click to open 1D saved evaluations filtered to ' + level.label}
        aria-label={`Open ${preview ? preview.health[level.key] : 'unverified'} ${level.label} evaluations in Review`}>
        <i className={'is-' + level.key} aria-hidden="true" />
        <strong>{preview ? preview.health[level.key] : '—'}</strong>
        <span>{level.label}</span>
      </button>)}
    </div>
    {viewMode === 'by-app'
      ? rows.length > 0
        ? <RundeckWorkloadAppLanes rows={rows} onSelectWorkload={openWorkload} onOpenApp={onOpenApp} period={period} />
        : <div className="rundeckAppEvalState" role="status">{outcome}</div>
      : <div ref={dotGridRef} className={'rundeckWorkloadDotGrid' + (globeEnabled && dotLayout.fits && rows.length ? ' is-sphere-globe' + (globeExpanded ? ' is-expanded' : '') : '')}
      role="group" aria-label="Individual saved workload evaluations"
      onPointerEnter={event => { if (globeEnabled && event.pointerType !== 'touch') setGlobeExpanded(true) }}
      onPointerLeave={event => { if (event.pointerType !== 'touch') setGlobeExpanded(false) }}
      onPointerDown={event => { if (globeEnabled && event.pointerType === 'touch') setGlobeExpanded(true) }}
      onFocusCapture={() => setGlobeExpanded(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setGlobeExpanded(false) }}
      style={{ '--workload-dot-size': `${dotLayout.size}px`, '--workload-dot-gap': `${dotLayout.gap}px`, '--workload-columns': dotLayout.columns }}>
      {globeEnabled && dotLayout.fits && rows.length > 0 &&
        <RundeckEvaluationGlobe rows={rows} layout={dotLayout} expanded={globeExpanded}
          onSelectIndex={index => { if (rows[index]) openWorkload(rows[index]) }} />}
      {(dotLayout.fits ? rows : []).map((row, index) => {
        const level = workloadHealthLevel(row)
        const type = String(row.consumer_type || '').toUpperCase() === 'JOB' ? 'Job' : 'Program'
        const cpu = row.avg_cpu_pct == null ? '—' : row.avg_cpu_pct + '%'
        const pss = row.avg_pss_gb == null ? '—' : row.avg_pss_gb + ' GB'
        const description = `${type} ${row.consumer_key} · ${level === 'review' ? 'Review Required' :
          level === 'attention' ? 'Watch' : level === 'normal' ? 'Normal' : 'Unknown'} · avg grouped CPU ${cpu} · avg PSS ${pss}`
        const detail = [description, row.host ? 'APP ' + row.host : '',
          'Saved status ' + (row.status || 'UNKNOWN'), 'Window ' + period,
          'Saved performance evaluation; not SAP SM37 execution status'].filter(Boolean).join(' · ')
        return <button key={row.consumer_type + ':' + row.consumer_key} type="button"
          className={'rundeckWorkloadDot is-' + level +
            (dotLayout.columns > 0 && Math.floor(index / dotLayout.columns) % 2 ? ' is-staggered-row' : '') +
            (preview?.limited ? ' is-limited' : '')}
          title={detail} aria-label={description + ' · open saved 1D evaluation'}
          tabIndex={index === activeDotIndex ? 0 : -1}
          onFocus={() => setActiveDotIndex(index)}
          onKeyDown={event => handleDotNavigation(event, index)}
          onClick={() => openWorkload(row)} />
      })}
      {(!rows.length || !dotLayout.fits) && <span className="rundeckWorkloadDotEmpty" role="status">
        {!dotLayout.fits && rows.length ? `${rows.length} evaluated · hexagons do not fit · open Review` : outcome}
      </span>}
    </div>}
    {(viewMode !== 'by-app' || (preview && Number(preview.health.unknown) > 0 && otherUnknown !== null) || !performanceVerified) && <footer className="rundeckWorkloadHealthFooter">
      {viewMode !== 'by-app' && <span className={'is-' + state} title="Evaluation priority is based on saved evidence, not SAP SM37 execution status.">{statusNote} · not SAP SM37 job status</span>}
      {preview && Number(preview.health.unknown) > 0 && otherUnknown !== null &&
        <small title={unknownDescription}>Data limited {preview.health.unknown}/{preview.total} ({preview.unknownSharePct}%) · {insufficient} insufficient</small>}
      {!performanceVerified && <small title="Current host performance freshness is unverified; this panel contains saved 1D evaluations">Host data unverified</small>}
    </footer>}
  </section>
}

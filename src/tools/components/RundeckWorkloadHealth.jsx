import React from 'react'
import { formatWib } from './sapUiFormat.js'
import { validatedWorkloadDots, workloadHealthLevel, workloadHealthPreview } from './rundeckWorkloadHealthState.js'

const API = import.meta.env.BASE_URL + 'api'
const MIN_REFRESH_MS = 5 * 60 * 1000
const API_PAGE_SIZE = 100
// All visible hexagons represent individually verified backend evaluations.
// Beyond this limit, show verified counts and a Review link rather than hiding records.
const MAX_VISIBLE_DOTS = 800
const SEVERITY_ORDER = { review: 0, attention: 1, unknown: 2, normal: 3 }
const LEVELS = [
  { key: 'review', label: 'Review' },
  { key: 'attention', label: 'Watch' },
  { key: 'normal', label: 'Normal' },
  { key: 'unknown', label: 'Unknown' },
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
  // Existing validator ensures every page has identical window, population and status totals,
  // unique consumer identity, and category counts matching the backend summary.
  const verified = validatedWorkloadDots(first, following, 0, completePageSize)
  if (!verified || verified.rows.length !== preview.total) {
    throw new Error('Workload rows do not match the saved evaluation snapshot')
  }
  return { preview: verified.preview, rows: verified.rows, tooMany: false, start: verified.start, end: verified.end }
}

/** One saved 1D evaluation = one selectable hexagon, without 400+1 pagination. */
export default function RundeckWorkloadHealth({ refreshToken = '', performanceVerified = false, onReview, onSelectWorkload }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [retryToken, setRetryToken] = React.useState(0)
  const loadedAt = React.useRef(0)
  const loadedRefreshToken = React.useRef(null)

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
  const state = error ? 'unavailable' : loading ? 'loading' : !preview ? 'unavailable' :
    preview.total === 0 ? 'empty' : preview.limited ? 'limited' :
      preview.reviewRequired > 0 ? 'review' : 'normal'
  const period = data?.start && data?.end
    ? `${formatWib(data.start, true)} – ${formatWib(data.end, true)} WIB`
    : 'Window unavailable'
  const outcome = error ? 'Evaluation unavailable' : loading ? 'Loading evaluations…' :
    !preview ? 'No verified evaluation' : preview.total === 0 ? 'No evaluations' :
      data?.tooMany ? 'Open Review for individual evaluations' :
      preview.limited ? 'Limited evidence' : preview.reviewRequired ? 'Needs review' : 'No review flagged'
  const openWorkload = row => onSelectWorkload?.(row, {
    period: '1d', days: 1, start: data?.start || '', end: data?.end || '',
  })

  return <section className="rundeckWorkloadHealth"
    data-state={state} data-density={rows.length > 500 ? 'dense' : 'normal'}
    aria-label="Workload Health evaluated jobs and programs" aria-busy={loading}>
    <header className="rundeckWorkloadHealthTitle">
      <span><strong>Workload Health</strong><small>1D · {period} · {preview ? preview.total.toLocaleString('en-US') + ' evaluated' : 'unverified'}</small></span>
      <button type="button" className="rundeckWorkloadHealthReview" onClick={onReview}
        aria-label="Open Jobs & Programs Review">Review list</button>
    </header>
    <div className="rundeckWorkloadHealthLegend" aria-label="Full population evaluation categories">
      {LEVELS.map(level => <span key={level.key}><i className={'is-' + level.key} />{preview ? preview.health[level.key] : '—'} {level.label}</span>)}
    </div>
    <div className="rundeckWorkloadDotGrid" role="group" aria-label="Individual saved workload evaluations">
      {rows.map(row => {
        const level = workloadHealthLevel(row)
        const type = String(row.consumer_type || '').toUpperCase() === 'JOB' ? 'Job' : 'Program'
        const cpu = row.avg_cpu_pct == null ? '—' : row.avg_cpu_pct + '%'
        const pss = row.avg_pss_gb == null ? '—' : row.avg_pss_gb + ' GB'
        const description = `${type} ${row.consumer_key} · ${level === 'review' ? 'Review Required' :
          level === 'attention' ? 'Watch' : level === 'normal' ? 'Normal' : 'Unknown'} · avg CPU ${cpu} · avg PSS ${pss}`
        return <button key={row.consumer_type + ':' + row.consumer_key} type="button"
          className={'rundeckWorkloadDot is-' + level + (preview?.limited ? ' is-limited' : '')}
          title={description} aria-label={description}
          onClick={() => openWorkload(row)} />
      })}
      {!rows.length && <span className="rundeckWorkloadDotEmpty" role="status">{outcome}</span>}
    </div>
    <footer className="rundeckWorkloadHealthFooter">
      <span className={'is-' + state}>{outcome} · {rows.length ? '1 hexagon = 1 saved evaluation' : 'saved evaluations'} · not SM37 status</span>
      {!performanceVerified && <small title="Current host performance freshness is unverified; this panel contains saved 1D evaluations">Host data unverified</small>}
    </footer>
  </section>
}

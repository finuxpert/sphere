import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { formatWib } from './sapUiFormat.js'
import { validatedWorkloadDots, workloadHealthLevel, workloadHealthPreview } from './rundeckWorkloadHealthState.js'

const API = import.meta.env.BASE_URL + 'api'
const MIN_REFRESH_MS = 5 * 60 * 1000
const API_PAGE_SIZE = 100
// All visible hexagons represent individually verified backend evaluations.
// Beyond this limit, show verified counts and a Review link rather than hiding records.
const MAX_VISIBLE_DOTS = 800
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
  // Existing validator ensures every page has identical window, population and status totals,
  // unique consumer identity, and category counts matching the backend summary.
  const verified = validatedWorkloadDots(first, following, 0, completePageSize)
  if (!verified || verified.rows.length !== preview.total) {
    throw new Error('Workload rows do not match the saved evaluation snapshot')
  }
  return { preview: verified.preview, rows: verified.rows, tooMany: false, start: verified.start, end: verified.end }
}

/** One verified 1D population; individual job/program records remain in Review. */
export default function RundeckWorkloadHealth({ refreshToken = '', performanceVerified = false, onReview }) {
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
  const rows = data?.tooMany ? [] : data?.rows || []
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
  const statusNote = 'Saved 1D performance evaluations; not SAP SM37 job status'

  return <section className="rundeckWorkloadHealth"
    data-state={state} data-coverage={preview && Number(preview.health.unknown) > 0 ? 'limited' : 'complete'} data-density={rows.length > 500 ? 'dense' : 'normal'}
    aria-label="Job and program performance evaluations" aria-busy={loading}>
    <header className="rundeckWorkloadHealthTitle">
      <span><span className="rundeckWorkloadHealthBrand"><SphereIcon name="activity" /><strong>Job & Program Evaluation</strong></span><small title={`Saved evaluation window: ${period}. A 1D evaluated population is different from Current collection workloads; neither is SAP SM37 job status.`}>Last 1D · {preview ? preview.total.toLocaleString('en-US') + ' evaluated' : 'unverified'} · {preview && data?.end ? formatWib(data.end, true) + ' WIB' : 'time unverified'}</small></span>
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
    <div className="rundeckWorkloadDistribution" role="group" aria-label="Proportion of saved evaluations by category">
      {preview && preview.total > 0 ? LEVELS.map(level => {
        const count = Number(preview.health[level.key]) || 0
        return count > 0 ? <button type="button" key={level.key}
          className={'is-' + level.key}
          style={{ flexGrow: count }}
          onClick={() => onReview?.(level.health)}
          title={level.label + ': ' + count + ' of ' + preview.total + ' saved evaluations; open Review'}
          aria-label={level.label + ': ' + count + ' of ' + preview.total + '; open Review'} /> : null
      }) : <span className="rundeckWorkloadDistributionEmpty">{outcome}</span>}
    </div>
    <footer className="rundeckWorkloadHealthFooter">
      <span className={'is-' + state} title="Evaluation priority is based on saved evidence, not SAP SM37 execution status.">{statusNote}</span>
      {preview && Number(preview.health.unknown) > 0 && otherUnknown !== null &&
        <small title={unknownDescription}>Unknown {preview.health.unknown}/{preview.total} ({preview.unknownSharePct}%) · {insufficient} insufficient</small>}
      {!performanceVerified && <small title="Current host performance freshness is unverified; this panel contains saved 1D evaluations">Host data unverified</small>}
    </footer>
  </section>
}

import React from 'react'
import { formatWib } from './sapUiFormat.js'
import { workloadHealthPreview } from './rundeckWorkloadHealthState.js'

const API = import.meta.env.BASE_URL + 'api'
const MIN_REFRESH_MS = 5 * 60 * 1000
const API_PAGE_SIZE = 100
const LEVELS = [
  { key: 'review', label: 'Review' },
  { key: 'attention', label: 'Watch' },
  { key: 'normal', label: 'Normal' },
  { key: 'unknown', label: 'Unknown' },
]

/** Full-population counts are supplied by the backend summary, not counted from the first API page. */
async function readSummary(signal) {
  const params = new URLSearchParams({ period: '1d', type: 'ALL', health: 'ALL', limit: String(API_PAGE_SIZE), offset: '0' })
  const response = await fetch(API + '/evaluation/workloads?' + params.toString(), { cache: 'no-store', signal })
  if (!response.ok) throw new Error('Evaluation unavailable (' + response.status + ')')
  const report = await response.json()
  const preview = workloadHealthPreview(report)
  if (!preview || report.page?.scope !== 'FULL_EVALUATED_POPULATION' ||
      report.page?.health !== 'ALL' || report.page?.offset !== 0 ||
      report.page?.total !== preview.total || report.page?.returned !== report.items.length ||
      report.items.length !== Math.min(preview.total, API_PAGE_SIZE)) {
    throw new Error('Evaluated workload population unverified')
  }
  return { preview, start: report.start || '', end: report.end || '' }
}

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
    readSummary(controller.signal).then(report => {
      if (controller.signal.aborted) return
      setData(report)
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
  }, [refreshToken, retryToken]) // Refresh token identifies the collection; cached data is kept for 5 minutes.

  const preview = loading || error ? null : data?.preview
  const state = error ? 'unavailable' : loading ? 'loading' : !preview ? 'unavailable' :
    preview.total === 0 ? 'empty' : preview.limited ? 'limited' :
      preview.reviewRequired > 0 ? 'review' : 'normal'
  const period = data?.start && data?.end
    ? `${formatWib(data.start, true)} – ${formatWib(data.end, true)} WIB`
    : 'Window unavailable'
  const outcome = error ? 'Evaluation unavailable' : loading ? 'Loading evaluations…' :
    !preview ? 'No verified evaluation' : preview.total === 0 ? 'No evaluations' :
      preview.limited ? 'Limited evidence' : preview.reviewRequired ? 'Needs review' : 'No review flagged'
  const segments = preview && preview.total > 0 ? LEVELS.map(level => ({
    ...level, count: Number(preview.health[level.key]), width: Number(preview.health[level.key]) / preview.total * 100,
  })) : []

  return <section className="rundeckWorkloadHealth" data-state={state} aria-label="Workload Health evaluated jobs and programs">
    <header className="rundeckWorkloadHealthTitle">
      <span><strong>Workload Health</strong><small>1D · {period} · {preview ? preview.total.toLocaleString('en-US') + ' evaluated' : 'unverified'}</small></span>
      <button type="button" className="rundeckWorkloadHealthReview" onClick={onReview}
        aria-label="Open Jobs & Programs Review">Review list</button>
    </header>
    <div className="rundeckWorkloadHealthLegend" aria-label="Full population evaluation categories">
      {LEVELS.map(level => <span key={level.key}><i className={'is-' + level.key} />{preview ? preview.health[level.key] : '—'} {level.label}</span>)}
    </div>
    <div className="rundeckWorkloadHealthBand" role="img"
      aria-label={preview ? 'Evaluated workload totals: ' + LEVELS.map(level => preview.health[level.key] + ' ' + level.label).join(', ') : outcome}>
      {segments.map(segment => segment.count > 0 && <span key={segment.key}
        className={'is-' + segment.key} style={{ width: segment.width + '%' }}
        title={segment.label + ': ' + segment.count} />)}
      {!segments.length && <span className="rundeckWorkloadHealthBandEmpty" aria-hidden="true" />}
    </div>
    <footer className="rundeckWorkloadHealthFooter">
      <span className={'is-' + state}>{outcome} · saved evaluations · not SM37 status</span>
      {!performanceVerified && <small title="Current host performance freshness is unverified; this panel contains saved 1D evaluations">Host data unverified</small>}
    </footer>
  </section>
}

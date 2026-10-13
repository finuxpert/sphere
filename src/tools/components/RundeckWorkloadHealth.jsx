import React from 'react'
import { formatWib } from './sapUiFormat.js'
import { validatedWorkloadDots, workloadHealthLevel, workloadHealthPreview } from './rundeckWorkloadHealthState.js'

const API = import.meta.env.BASE_URL + 'api'
const MIN_REFRESH_MS = 5 * 60 * 1000
const DOTS_PER_PAGE = 400
const API_PAGE_SIZE = 100
const SEVERITY_ORDER = { review: 0, attention: 1, unknown: 2, normal: 3 }

const readPage = async (offset, signal) => {
  const params = new URLSearchParams({ period: '1d', type: 'ALL', health: 'ALL', limit: String(API_PAGE_SIZE), offset: String(offset) })
  const response = await fetch(API + '/evaluation/workloads?' + params.toString(), { cache: 'no-store', signal })
  if (!response.ok) throw new Error('Evaluation unavailable (' + response.status + ')')
  return response.json()
}

/** Every rendered dot comes from an individual saved workload evaluation. */
export default function RundeckWorkloadHealth({ refreshToken = '', performanceVerified = false, onReview, onSelectWorkload }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [dotPage, setDotPage] = React.useState(0)
  const [retryToken, setRetryToken] = React.useState(0)
  const loadedAt = React.useRef(0)
  const loadedRefreshToken = React.useRef(null)
  const loadedPage = React.useRef(-1)

  React.useEffect(() => {
    if (loadedPage.current === dotPage && loadedRefreshToken.current === refreshToken &&
        Date.now() - loadedAt.current < MIN_REFRESH_MS) return undefined
    const controller = new AbortController()
    let retryTimer
    setLoading(true)
    setError('')
    const load = async () => {
      const firstOffset = dotPage * DOTS_PER_PAGE
      const first = await readPage(firstOffset, controller.signal)
      const preview = workloadHealthPreview(first)
      if (!preview || first.page?.scope !== 'FULL_EVALUATED_POPULATION' || first.page?.health !== 'ALL' ||
          first.page?.total !== preview.total) throw new Error('Evaluated workload population unverified')
      const remainingOffsets = []
      for (let step = 1; step * API_PAGE_SIZE < DOTS_PER_PAGE; step++) {
        const offset = firstOffset + step * API_PAGE_SIZE
        if (offset >= preview.total) break
        remainingOffsets.push(offset)
      }
      const otherPages = await Promise.all(remainingOffsets.map(offset => readPage(offset, controller.signal)))
      const validated = validatedWorkloadDots(first, otherPages, dotPage, DOTS_PER_PAGE)
      if (!validated) throw new Error('Workload rows do not match the saved evaluation snapshot')
      if (!controller.signal.aborted) {
        setData(validated)
        loadedAt.current = Date.now()
        loadedRefreshToken.current = refreshToken
        loadedPage.current = dotPage
      }
    }
    load().catch(failure => {
      if (controller.signal.aborted) return
      setData(null)
      loadedPage.current = -1
      setError(failure.message || 'Evaluation unavailable')
      retryTimer = window.setTimeout(() => setRetryToken(value => value + 1), 60_000)
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort(); window.clearTimeout(retryTimer) }
  }, [refreshToken, retryToken, dotPage])

  const ready = !loading && !error && data?.pageIndex === dotPage
  const preview = ready ? data.preview : null
  const rows = React.useMemo(() => ready ? [...data.rows].sort((a, b) =>
    SEVERITY_ORDER[workloadHealthLevel(a)] - SEVERITY_ORDER[workloadHealthLevel(b)] ||
    String(a.consumer_key).localeCompare(String(b.consumer_key))) : [], [data, ready])
  const pages = preview ? Math.max(1, Math.ceil(preview.total / DOTS_PER_PAGE)) : 1
  const state = error ? 'unavailable' : loading ? 'loading' : !preview ? 'unavailable' :
    preview.total === 0 ? 'empty' : preview.limited ? 'limited' :
      preview.reviewRequired > 0 ? 'review' : 'normal'
  const timeLabel = preview?.end ? formatWib(preview.end, true) + ' WIB' : 'time unavailable'
  const outcome = error ? 'Evaluation unavailable' : loading ? 'Loading evaluations…' :
    !preview ? 'No verified evaluation' : preview.total === 0 ? 'No evaluations' :
      preview.limited ? 'Limited evidence' : preview.reviewRequired ? 'Needs review' : 'No review flagged'
  const openWorkload = row => {
    onSelectWorkload?.(row, { period: '1d', days: 1, start: data?.start || '', end: data?.end || '' })
  }

  return <section className="rundeckWorkloadHealth" data-state={state} aria-label="Workload Health evaluated jobs and programs">
    <header className="rundeckWorkloadHealthTitle">
      <span><strong>Workload Health</strong><small>1D · {timeLabel} · {preview ? preview.total.toLocaleString('en-US') + ' evaluated' : 'unverified'}</small></span>
      <button type="button" className="rundeckWorkloadHealthReview" onClick={onReview}
        aria-label="Open Jobs & Programs Review">Review list</button>
    </header>
    <div className="rundeckWorkloadHealthLegend" aria-label="Full population evaluation categories">
      <span><i className="is-review" />{preview ? preview.health.review : '—'} Review</span>
      <span><i className="is-attention" />{preview ? preview.health.attention : '—'} Watch</span>
      <span><i className="is-normal" />{preview ? preview.health.normal : '—'} Normal</span>
      <span><i className="is-unknown" />{preview ? preview.health.unknown : '—'} Unknown</span>
    </div>
    <div className="rundeckWorkloadDotGrid" role="group" aria-label="Select an individual evaluated job or program">
      {rows.map(row => {
        const level = workloadHealthLevel(row)
        const type = String(row.consumer_type || '').toUpperCase() === 'JOB' ? 'Job' : 'Program'
        const cpu = row.avg_cpu_pct == null ? '—' : row.avg_cpu_pct + '%'
        const pss = row.avg_pss_gb == null ? '—' : row.avg_pss_gb + ' GB'
        const label = type + ' ' + row.consumer_key + ' · ' +
          (level === 'review' ? 'Review Required' : level === 'attention' ? 'Watch' :
            level === 'normal' ? 'Normal' : 'Unknown') +
          ' · avg CPU ' + cpu + ' · avg PSS ' + pss
        return <button key={row.consumer_type + ':' + row.consumer_key} type="button"
          className={'rundeckWorkloadDot is-' + level + (preview?.limited ? ' is-limited' : '')}
          title={label} aria-label={label}
          onClick={() => openWorkload(row)} />
      })}
      {!rows.length && <span className="rundeckWorkloadDotEmpty" role="status">{outcome}</span>}
    </div>
    <footer className="rundeckWorkloadHealthFooter">
      <span className={'is-' + state}>{outcome} · 1 dot = 1 workload · not SM37 status</span>
      {pages > 1 && <nav className="rundeckWorkloadDotPager" aria-label="Workload dot pages">
        <button type="button" disabled={loading || dotPage === 0} onClick={() => setDotPage(page => Math.max(0, page - 1))} aria-label="Previous workload dots">‹</button>
        <small>{dotPage + 1}/{pages}</small>
        <button type="button" disabled={loading || dotPage >= pages - 1} onClick={() => setDotPage(page => Math.min(pages - 1, page + 1))} aria-label="Next workload dots">›</button>
      </nav>}
      {!performanceVerified && <small title="Current host performance freshness is unverified; this panel contains saved 1D evaluations">Host data unverified</small>}
    </footer>
  </section>
}

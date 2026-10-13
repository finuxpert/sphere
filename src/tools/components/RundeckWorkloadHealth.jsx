import React from 'react'
import { formatWib } from './sapUiFormat.js'
import { workloadHealthPreview } from './rundeckWorkloadHealthState.js'

const API = `${import.meta.env.BASE_URL}api`
const MIN_REFRESH_MS = 5 * 60 * 1000
const HEX_ROWS = [3, 4, 5, 6, 5, 4, 3] // 30 positions, centered as a honeycomb

/** Read-only, compact 1D evaluated workload preview; not SM37 execution health. */
export default function RundeckWorkloadHealth({ refreshToken = '', performanceVerified = false, onReview }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const fetchedAt = React.useRef(0)
  const hasData = React.useRef(false)
  const [retryToken, setRetryToken] = React.useState(0)
  const loadedRefreshToken = React.useRef(null)

  React.useEffect(() => {
    if (hasData.current && loadedRefreshToken.current === refreshToken && Date.now() - fetchedAt.current < MIN_REFRESH_MS) return undefined
    const controller = new AbortController()
    let retryTimer
    setLoading(true)
    setError('')
    fetch(`${API}/evaluation/workloads?period=1d&type=ALL&limit=100`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`Evaluation unavailable (${response.status})`)
        return response.json()
      })
      .then(result => {
        if (controller.signal.aborted) return
        if (!workloadHealthPreview(result)) throw new Error('Evaluation data incomplete')
        fetchedAt.current = Date.now()
        hasData.current = true
        loadedRefreshToken.current = refreshToken
        setData(result)
      })
      .catch(failure => {
        if (!controller.signal.aborted) {
          hasData.current = false
          setError(failure.message || 'Evaluation unavailable')
          setData(null)
          retryTimer = window.setTimeout(() => setRetryToken(value => value + 1), 60_000)
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort(); window.clearTimeout(retryTimer) }
  }, [refreshToken, retryToken])

  const preview = workloadHealthPreview(data, 30)
  const reviewCount = preview?.reviewRequired
  const totalCount = preview?.total
  const state = error ? 'unavailable' : !preview ? (loading ? 'loading' : 'unavailable')
    : totalCount === 0 ? 'empty' : preview.limited ? 'limited' : reviewCount > 0 ? 'review' : 'normal'
  const outcome = error ? 'Unavailable' : !preview ? (loading ? 'Loading' : 'Unavailable')
    : totalCount === 0 ? 'No evaluations' : preview.limited ? 'Limited evidence'
      : reviewCount > 0 ? 'Needs review' : 'No review flagged'
  const timeLabel = preview?.end ? `${formatWib(preview.end, true)} WIB` : 'time unavailable'
  const description = preview
    ? `${totalCount} evaluated workloads over 1D: ${preview.health.review} review, ${preview.health.attention} attention, ${preview.health.normal} normal, ${preview.health.unknown} insufficient/unknown. Hexagons represent proportions of the ENTIRE population, approximately one cell per ${(totalCount/30).toFixed(1)} workloads; individual cells are not individual jobs. As of ${timeLabel}. ${preview.limited ? 'Coverage is limited; hexagons are muted. ' : ''}${performanceVerified ? '' : 'Current host performance freshness unverified. '}Not an SM37 execution status.`
    : error || '1D distribution unavailable until the backend returns validated full-population counts'
  let cellIndex = 0
  return <button type="button" className="rundeckWorkloadHealth" onClick={onReview}
    title={description} aria-label={`Open Jobs & Programs Review. ${description}`}
    data-state={state}>
    <span className="rundeckWorkloadHealthTitle">
      <strong>Workload Health</strong>
      <small>1D · {preview?.end ? formatWib(preview.end, true) + ' WIB' : 'evaluation time unavailable'}</small>
    </span>
    <span className="rundeckWorkloadHexGrid" aria-hidden="true">
      {HEX_ROWS.map((length, rowIndex) =>
        <span className="rundeckWorkloadHexRow" key={rowIndex}>
          {Array.from({length}, (_,columnIndex) => {
            const category = preview?.hexagons[cellIndex++]
            return <i key={columnIndex} className={category && !preview?.limited ? `is-${category}` : 'is-empty'} />
          })}
        </span>
      )}
    </span>
    <span className="rundeckWorkloadHealthFooter">
      <span className={`is-${state}`}>{outcome}</span>
      <strong title={preview ? `${totalCount} workloads evaluated in 1D` : 'Evaluation total unavailable'}>{preview ? totalCount.toLocaleString('en-US') : '—'}</strong>
    </span>
    <span className="rundeckWorkloadHealthLegend" aria-label={preview ? `${reviewCount} review required, ${preview.health.attention} watch, ${preview.health.normal} normal, ${preview.health.unknown} unknown` : 'Evaluation distribution unavailable'}>
      <span><i className="is-review" />{preview ? `${reviewCount} Review` : 'Review'}</span>
      <span><i className="is-attention" />{preview ? `${preview.health.attention} Watch` : 'Watch'}</span>
      <span><i className="is-normal" />Normal</span>
      <span><i className="is-unknown" />Unknown</span>
    </span>
  </button>
}

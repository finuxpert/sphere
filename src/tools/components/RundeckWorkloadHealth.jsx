import React from 'react'
import { formatWib } from './sapUiFormat.js'
import { workloadHealthPreview } from './rundeckWorkloadHealthState.js'

const API = `${import.meta.env.BASE_URL}api`
const MIN_REFRESH_MS = 5 * 60 * 1000

/** Read-only, compact 1D evaluated workload preview; not SM37 execution health. */
export default function RundeckWorkloadHealth({ refreshToken = '', performanceVerified = false, onReview }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const fetchedAt = React.useRef(0)
  const hasData = React.useRef(false)

  React.useEffect(() => {
    if (hasData.current && Date.now() - fetchedAt.current < MIN_REFRESH_MS) return undefined
    const controller = new AbortController()
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
        setData(result)
      })
      .catch(failure => {
        if (!controller.signal.aborted) {
          hasData.current = false
          setError(failure.message || 'Evaluation unavailable')
          setData(null)
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refreshToken])

  const preview = workloadHealthPreview(data)
  const label = error ? 'Review unavailable'
    : !preview ? '1D evaluation'
      : preview.limited ? `1D · ${preview.reviewRequired} review · limited`
        : `1D · ${preview.reviewRequired} review`
  const timeLabel = preview?.end ? formatWib(preview.end, true) + ' WIB' : 'unknown'
  const description = preview
    ? `${preview.reviewRequired} require review of ${preview.total} evaluated workloads. Top ${preview.sample.length} ranked shown as dots. As of ${timeLabel}. ${performanceVerified ? '' : 'Current performance freshness not verified. '}Historical one-day evaluation, not an SM37 execution status.`
    : error || 'Loading saved workload evaluations'
  return <button type="button" className="rundeckWorkloadHealth" onClick={onReview}
    title={description} aria-label={`Open Jobs & Programs Review. ${description}`}
    data-state={error ? 'error' : loading ? 'loading' : 'ready'}>
    <span className="rundeckWorkloadHealthWords">
      <strong>Workload health</strong>
      <small>{label}</small>
    </span>
    <span className="rundeckWorkloadHealthDots" aria-hidden="true">
      {preview?.sample.length ? preview.sample.map((item, index) =>
        <i key={`${item.key}:${index}`} className={`is-${item.level}`} />)
        : <span className="rundeckWorkloadHealthPending">{loading ? '···' : '—'}</span>}
    </span>
  </button>
}

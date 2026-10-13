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
  const lastAttemptAt = React.useRef(0)

  React.useEffect(() => {
    if (hasData.current && Date.now() - fetchedAt.current < MIN_REFRESH_MS) return undefined
    if (!hasData.current && lastAttemptAt.current && Date.now() - lastAttemptAt.current < 60_000) return undefined
    lastAttemptAt.current = Date.now()
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

  const preview = workloadHealthPreview(data, 30)
  const reviewCount = preview?.reviewRequired
  const totalCount = preview?.total
  const state = error ? 'unavailable' : !preview ? 'loading'
    : preview.limited ? 'limited' : reviewCount > 0 ? 'review' : 'normal'
  const outcome = error ? 'Unavailable' : !preview ? 'Loading'
    : reviewCount > 0 ? 'Needs review' : preview.limited ? 'Limited evidence' : 'No review flagged'
  const timeLabel = preview?.end ? `${formatWib(preview.end, true)} WIB` : 'unknown'
  const description = preview
    ? `${reviewCount} requiring review from ${totalCount} evaluated workloads. Colored hexagons show only the first ${preview.sample.length} ranked evaluations. As of ${timeLabel}. ${preview.limited ? 'Evaluation quality is limited. ' : ''}${performanceVerified ? '' : 'Latest Performance is not verified. '}Historical one-day evaluation, not an SM37 execution status.`
    : error || 'Waiting for 1D workload evaluation; missing data is not a healthy signal'
  let cellIndex = 0
  return <button type="button" className="rundeckWorkloadHealth" onClick={onReview}
    title={description} aria-label={`Open Jobs & Programs Review. ${description}`}
    data-state={state}>
    <span className="rundeckWorkloadHealthTitle">
      <strong>Workload Health</strong>
      <small>1D evaluation</small>
    </span>
    <span className="rundeckWorkloadHexGrid" aria-hidden="true">
      {HEX_ROWS.map((length, rowIndex) =>
        <span className="rundeckWorkloadHexRow" key={rowIndex}>
          {Array.from({ length }, (_, columnIndex) => {
            const item = preview?.sample[cellIndex++]
            return <i key={columnIndex} className={item ? `is-${item.level}` : 'is-empty'} />
          })}
        </span>
      )}
    </span>
    <span className="rundeckWorkloadHealthFooter">
      <span className={`is-${state}`}>{outcome}</span>
      <strong title={preview ? `${totalCount} workloads evaluated in the saved 1D period` : 'Evaluation total unavailable'}>{preview ? totalCount.toLocaleString('en-US') : '—'}</strong>
    </span>
    <span className="rundeckWorkloadHealthCount" aria-hidden="true">{preview ? `${reviewCount} review` : 'No evaluation data'}</span>
  </button>
}

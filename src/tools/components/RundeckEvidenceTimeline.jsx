import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { formatWib } from './sapUiFormat.js'
import './RundeckEvidenceTimeline.css'

const API = `${import.meta.env.BASE_URL}api`

function alignmentClass(value = '') {
  const key = String(value || '').toLowerCase().replaceAll(' ', '-')
  return `is-${key || 'unknown'}`
}

export default function RundeckEvidenceTimeline({ refreshToken = '', job = null, incidentActive = false }) {
  const [data, setData] = React.useState(null)
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  const jobKey = job?.key || ''
  const host = job?.host || ''
  const consumerType = job?.consumerType || ''

  React.useEffect(() => {
    if (!incidentActive) {
      setData(null)
      setError('')
      return undefined
    }
    const controller = new AbortController()
    const params = new URLSearchParams({ availability_range: '7d' })
    if (jobKey) params.set('job', jobKey)
    if (host) params.set('host', host)
    if (consumerType) params.set('type', consumerType)
    setLoading(true)
    fetch(`${API}/analysis/evidence?${params.toString()}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail || `Evidence unavailable (${response.status})`)
        }
        return response.json()
      })
      .then((result) => {
        setData(result)
        setError('')
      })
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message || 'Operational events unavailable')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [consumerType, host, incidentActive, jobKey, refreshToken])

  if (!incidentActive) return null

  const alignment = data?.alignment || {}
  const coverage = data?.coverage || {}
  const events = data?.events || []
  const interpretation = data?.interpretation || []
  const state = alignment.state || (loading ? 'LOADING' : error ? 'UNAVAILABLE' : 'UNKNOWN')
  const skew = alignment.max_skew_minutes
  const hasSkew = skew !== null && skew !== undefined && Number.isFinite(Number(skew))
  const threshold = Number(alignment.threshold_minutes)
  const hasThreshold = Number.isFinite(threshold)
  const alignmentHint = state === 'ALIGNED'
    ? `Source timestamps are within the ${hasThreshold ? `${threshold} minute` : 'configured'} alignment window. Timing alignment supports correlation only; it does not establish causation.`
    : state === 'LIMITED'
      ? `Source timestamps exceed the ${hasThreshold ? `${threshold} minute` : 'configured'} alignment window. Cross-source conclusions are limited.`
      : state === 'INSUFFICIENT DATA'
        ? 'Fewer than two timestamped evidence sources are available.'
        : 'Cross-source timing status.'

  return <section className="rundeckEvidenceTimeline" aria-label="Operational Events">
    <div className="rundeckEvidenceSummary">
      <span className="rundeckEvidenceTitle"><SphereIcon name="history" /> Operational Events</span>
      <span className={`rundeckEvidenceAlignment ${alignmentClass(state)}`} title={alignmentHint}>{state}</span>
      <small>{hasSkew ? `${Number(skew).toLocaleString('en-US', { maximumFractionDigits: 1 })}m skew` : 'timing'}{events.length ? ` · ${events.length} events` : ''}</small>
    </div>

    <div className="rundeckEvidenceBody">
      {loading && !data && <div className="rundeckEvidenceState">Loading events…</div>}
      {error && !data && <div className="rundeckEvidenceState is-error">{error}</div>}

      {data && <>
        <div className="rundeckEvidenceEvents" aria-label="Operational events">
          {events.map((event, index) => <div className="rundeckEvidenceEvent" key={`${event.at}-${event.kind}-${index}`} title={event.detail || undefined}>
            <time>{formatWib(event.at, true)} WIB</time>
            <span className={`rundeckEvidenceDot is-${String(event.source || '').toLowerCase().replaceAll(' ', '-')}`} />
            <div>
              <strong>{event.title}</strong>
              <small>{event.source}{event.state ? ` · ${event.state}` : ''}</small>
            </div>
          </div>)}
          {!events.length && <div className="rundeckEvidenceState">No retained event in this window.</div>}
        </div>

        <details className="rundeckEvidenceTechnical">
          <summary>Correlation details</summary>
          <div className="rundeckEvidenceSources" aria-label="Source alignment">
            {alignment.sources?.map((source) => <span key={source.name}>
              <b>{source.name}</b>
              <strong>{formatWib(source.observed_at, true)} WIB</strong>
              <em className={source.within_window ? 'is-aligned' : 'is-limited'}>{source.delta_minutes}m</em>
            </span>)}
            <span><b>Availability History</b><strong>{coverage.availability_snapshots || 0} snapshots</strong><em>{coverage.availability_history_started_at ? `since ${formatWib(coverage.availability_history_started_at, true)}` : 'no retained history'}</em></span>
            <span><b>Alignment Window</b><strong>{hasThreshold ? `${threshold} min` : 'configured'}</strong><em>timing only</em></span>
          </div>
          {interpretation.length > 0 && <div className="rundeckEvidenceInterpretation">
            <ul>{interpretation.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
          </div>}
          <p className="rundeckEvidenceNote">{data.note}</p>
        </details>
      </>}
    </div>
  </section>
}

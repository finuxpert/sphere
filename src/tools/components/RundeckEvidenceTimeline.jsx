import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { formatWib } from './sapUiFormat.js'
import './RundeckEvidenceTimeline.css'

const API = `${import.meta.env.BASE_URL}api`

function sourceLabel(value = '') {
  if (value === 'Workload') return 'Job / Program'
  if (value === 'Host') return 'APP Server'
  if (value === 'Issue Start') return 'Issue Start'
  if (value === 'Selected Time') return 'Selected Time'
  return value || 'Unknown'
}

function alignmentClass(value = '') {
  const key = String(value || '').toLowerCase().replaceAll(' ', '-')
  return `is-${key || 'unknown'}`
}

function appLabel(host = '') {
  const value = String(host || '')
  const match = value.match(/H([1-9])PAPPDC/i) || value.match(/APP([1-9])/i)
  return match ? `APP${match[1]}` : value || 'APP'
}

function evidenceEventTitle(event = {}) {
  const raw = String(event?.title || '').trim()
  const source = String(event?.source || '').toUpperCase()
  if (source === 'SAP SIGNAL' && /critical\s+work\s+process/i.test(raw)) {
    return 'Critical Work Process first observed'
  }
  return raw || 'Operational event'
}

function eventRelation(eventAt = '', issueAt = '', thresholdMinutes = 15, source = '') {
  if (String(source || '').toUpperCase() === 'ISSUE START') return 'ISSUE START'
  const eventTs = Date.parse(eventAt || '')
  const issueTs = Date.parse(issueAt || '')
  if (!Number.isFinite(eventTs) || !Number.isFinite(issueTs)) return ''
  const deltaMinutes = Math.round((eventTs - issueTs) / 60000)
  if (Math.abs(deltaMinutes) <= Math.max(1, Number(thresholdMinutes || 15))) return 'SAME WINDOW'
  return deltaMinutes < 0 ? 'BEFORE ISSUE' : 'AFTER ISSUE'
}

export default function RundeckEvidenceTimeline({ refreshToken = '', job = null, incidentActive = false, compact = false, onOpen = null }) {
  const [data, setData] = React.useState(null)
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  const jobKey = job?.key || ''
  const host = job?.host || ''
  const consumerType = job?.consumerType || ''
  const anchorAt = job?.at || ''
  const correlationScope = anchorAt ? 'Selected observation context' : 'Selected workload context'

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
    if (anchorAt) params.set('at', anchorAt)
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
  }, [anchorAt, consumerType, host, incidentActive, jobKey, refreshToken])

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
  const issueSource = (alignment.sources || []).find((source) => String(source?.name || '').toUpperCase() === 'ISSUE START')
  const issueEvent = events.find((event) => String(event?.source || '').toUpperCase() === 'ISSUE START')
  const issueAt = issueSource?.observed_at || issueEvent?.at || ''
  const timingLabel = state === 'ALIGNED' ? 'Same time window' : state
  const timingSummary = `${timingLabel}${hasSkew ? ` · ${Math.round(Number(skew))}m difference` : ''} · Cause not confirmed`
  const workloadGapMinutes = Number(alignment.workload_gap_minutes)
  const hasWorkloadGap = Number.isFinite(workloadGapMinutes)
  const alignmentHint = state === 'ALIGNED'
    ? `Source timestamps are within the ${hasThreshold ? `${threshold} minute` : 'configured'} alignment window. Timing alignment supports correlation only; it does not establish causation.`
    : state === 'NO OVERLAP'
      ? 'The selected workload episode ended before the current issue window beyond the configured correlation tolerance.'
      : state === 'LIMITED'
        ? `Source timestamps exceed the ${hasThreshold ? `${threshold} minute` : 'configured'} alignment window. Cross-source conclusions are limited.`
      : state === 'INSUFFICIENT DATA'
        ? 'Fewer than two timestamped evidence sources are available.'
        : 'Cross-source timing status.'

  if (compact) {
    const timingState = state === 'ALIGNED' ? 'Same time window' : state
    const timingDetail = state === 'NO OVERLAP' && hasWorkloadGap
      ? `No overlap · ${Math.round(workloadGapMinutes)}m gap`
      : hasSkew
        ? `${Math.round(Number(skew))}m difference`
        : timingState
    return <button type="button" className="rundeckEvidenceCard rundeckCorrelatedCard" onClick={onOpen} aria-label="Open Correlated Events">
      <span className="rundeckEvidenceCardTitle"><SphereIcon name="history" /> Correlated Events</span>
      <strong>{events.length ? `${events.length} events · ${timingDetail}` : 'No correlated events'}</strong>
      <em aria-hidden="true">›</em>
    </button>
  }

  return <section className="rundeckEvidenceTimeline" aria-label="Correlated events">
    <div className="rundeckEvidenceSummary">
      <span className="rundeckEvidenceTitle"><SphereIcon name="history" /> Correlated Events</span>
      <span className="rundeckEvidenceScope">{correlationScope}</span>
      <span className={`rundeckEvidenceAlignment ${alignmentClass(state)}`} title={alignmentHint}>{state === 'ALIGNED' ? 'SAME TIME WINDOW' : state}</span>
      <small>{events.length ? `${events.length} event${events.length === 1 ? '' : 's'}` : 'No events'}</small>
    </div>

    <div className={`rundeckEvidenceTimingStrip ${alignmentClass(state)}`}>
      <strong>Timing</strong>
      <span>{timingSummary}</span>
      {issueAt && <small>Issue reference {formatWib(issueAt, true)} WIB</small>}
    </div>

    <div className="rundeckEvidenceBody">
      {loading && !data && <div className="rundeckEvidenceState">Loading events…</div>}
      {error && !data && <div className="rundeckEvidenceState is-error">{error}</div>}

      {data && <>
        <div className="rundeckEvidenceEvents" aria-label="Operational events">
          {events.map((event, index) => {
            const relation = eventRelation(event.at, issueAt, hasThreshold ? threshold : 15, event.source)
            const isHost = String(event.source || '').toUpperCase() === 'HOST'
            const displayTitle = isHost && host ? `${appLabel(host)} server observation` : evidenceEventTitle(event)
            return <div className={`rundeckEvidenceEvent ${String(event.source || '').toUpperCase() === 'SAP SIGNAL' ? 'is-primary-signal' : ''}`} key={`${event.at}-${event.kind}-${index}`} title={event.detail || undefined}>
              <time>{formatWib(event.at, true)} WIB</time>
              <span className={`rundeckEvidenceDot is-${String(event.source || '').toLowerCase().replaceAll(' ', '-')}`} />
              <div>
                <strong>{displayTitle}</strong>
                <small>{isHost && host ? `${appLabel(host)} · ` : ''}{sourceLabel(event.source)}{event.state && <span className={`rundeckEvidenceStateChip is-${String(event.state).toLowerCase().replaceAll(' ','-')}`}>{event.state}</span>}</small>
              </div>
              {relation && <em className={`rundeckEvidenceRelation ${relation === 'ISSUE START' ? 'is-issue' : relation === 'SAME WINDOW' ? 'is-same' : ''}`}>{relation}</em>}
            </div>
          })}
          {!events.length && <div className="rundeckEvidenceState">No event found in this time window.</div>}
        </div>

        <details className="rundeckEvidenceTechnical">
          <summary>Timing Details</summary>
          <div className="rundeckEvidenceSources" aria-label="Source alignment">
            {alignment.sources?.map((source) => <span key={source.name}>
              <b>{sourceLabel(source.name)}</b>
              <strong>{formatWib(source.observed_at, true)} WIB</strong>
              <em className={source.within_window ? 'is-aligned' : 'is-limited'}>{source.delta_minutes}m</em>
            </span>)}
            <span><b>Availability History</b><strong>{coverage.availability_snapshots || 0} records</strong><em>{coverage.availability_history_started_at ? `since ${formatWib(coverage.availability_history_started_at, true)}` : 'no saved history'}</em></span>
            <span><b>Correlation Window</b><strong>{hasThreshold ? `${threshold} min` : 'configured'}</strong><em>maximum timestamp difference used for correlation</em></span>
          </div>
          {interpretation.length > 0 && <div className="rundeckEvidenceInterpretation">
            <ul>{interpretation.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
          </div>}
          <p className="rundeckEvidenceNote">Timing alignment is supporting evidence only. Correlation does not prove causation. Verify job status in SAP and infrastructure sources.</p>
        </details>
      </>}
    </div>
  </section>
}

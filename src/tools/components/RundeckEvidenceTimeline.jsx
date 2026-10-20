import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { formatWib } from './sapUiFormat.js'
import './RundeckEvidenceTimeline.css'
import { issueWorkloadTimePair, formatDurationMinutes } from './rundeckEvidenceTiming.js'

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
  if (String(source || '').toUpperCase() === 'ISSUE START' || String(source || '').toUpperCase() === 'SAP SIGNAL') return ''
  const eventTs = Date.parse(eventAt || '')
  const issueTs = Date.parse(issueAt || '')
  if (!Number.isFinite(eventTs) || !Number.isFinite(issueTs)) return ''
  const deltaMinutes = Math.round((eventTs - issueTs) / 60000)
  if (Math.abs(deltaMinutes) <= Number(thresholdMinutes)) return 'WITHIN WINDOW'
  return deltaMinutes < 0 ? 'BEFORE ISSUE' : 'AFTER ISSUE'
}

export default function RundeckEvidenceTimeline({ refreshToken = '', job = null, incidentActive = false, compact = false, onOpen = null, paired = false, scopeLabel = '' }) {
  const [data, setData] = React.useState(null)
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  const jobKey = job?.key || ''
  const host = job?.host || ''
  const consumerType = job?.consumerType || ''
  const anchorAt = job?.at || ''
  
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
    setData(null)
    setError('')
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
  // Compare the API-selected workload sample with the issue timestamp;
  // the API's cross-source max skew may instead describe Selected Time/Availability.
  const pair = issueWorkloadTimePair(data || {})
  const state = loading && !data ? 'LOADING' : error && !data ? 'UNAVAILABLE' : pair.state
  const issueAt = pair.issueAt || ''
  const hasThreshold = pair.thresholdMinutes !== null
  const threshold = pair.thresholdMinutes
  const relativeTiming = pair.direction === 'AFTER ISSUE' ? 'after issue observation'
    : pair.direction === 'BEFORE ISSUE' ? 'before issue observation' : 'from issue observation'
  const timingSummary = pair.deltaMinutes === null
    ? 'Job/program ↔ issue: timestamps not verified'
    : `Workload sample · ${formatDurationMinutes(pair.deltaMinutes)} ${relativeTiming}`
  const alignmentHint = `Issue: ${issueAt ? `${formatWib(issueAt,true)} WIB` : '—'} · Workload: ${pair.workloadAt ? `${formatWib(pair.workloadAt,true)} WIB` : '—'} · Window: ${hasThreshold ? `${threshold}m` : '—'}`
  const workloadGapMinutes = Number(alignment.workload_gap_minutes)
  const hasWorkloadGap = alignment.workload_gap_minutes != null && Number.isFinite(workloadGapMinutes)
  const outsideCount = events.filter(event => hasThreshold && Number.isFinite(Date.parse(issueAt || '')) && eventRelation(event.at, issueAt, threshold, event.source) !== 'WITHIN WINDOW' &&
    !['ISSUE START','SAP SIGNAL'].includes(String(event.source || '').toUpperCase())).length
  const firstWorkload = pair.firstSeen || pair.workloadAt || ''
  const issueTime = Date.parse(issueAt || '')
  const workloadTime = Date.parse(firstWorkload)
  const summaryNote = !Number.isFinite(issueTime) || !Number.isFinite(workloadTime) || workloadTime > issueTime
    ? 'Cause not established. The issue was observed before this workload, or the first retained workload time is not verified.'
    : 'Cause not established. Workload was observed before the issue, but timing alone does not prove causation.'
  const issueDelay = Number.isFinite(workloadTime) && Number.isFinite(issueTime)
    ? formatDurationMinutes(Math.round(Math.abs(workloadTime - issueTime) / 60000))
    : 'unverified'

  if (compact) {
    const timingDetail = state === 'NO OVERLAP' && hasWorkloadGap
      ? `No overlap · ${formatDurationMinutes(workloadGapMinutes)} apart`
      : pair.deltaMinutes !== null ? `${formatDurationMinutes(pair.deltaMinutes)} ${relativeTiming}` : 'Timing unverified'
    return <button type="button" className="rundeckEvidenceCard rundeckCorrelatedCard" onClick={onOpen} aria-label="Open Related Events" title={[scopeLabel, alignmentHint].filter(Boolean).join(' · ')}>
      <span className="rundeckEvidenceCardTitle"><SphereIcon name="history" /> Related Events{scopeLabel ? ' · ' + scopeLabel : ''}</span>
      <strong>{events.length ? `${events.length} events · ${timingDetail}` : 'No related events'}</strong>
      <em aria-hidden="true">›</em>
    </button>
  }

  return <section className="rundeckEvidenceTimeline" aria-label="Related events">
    <div className="rundeckEvidenceSummary">
      <span className="rundeckEvidenceTitle"><SphereIcon name="history" /> Related Events</span>
      {!paired && <span className="rundeckEvidenceScope">Selected job</span>}
      <span className={`rundeckEvidenceAlignment ${alignmentClass(state)}`} title={alignmentHint}>{state === 'OUTSIDE WINDOW' ? 'OUTSIDE CORRELATION WINDOW' : state}</span>
      <small title="Timeline event count is separate from source-pair correlation status">{events.length ? `${events.length} timeline events · ${hasThreshold ? outsideCount + ' outside ±' + threshold + 'm' : 'correlation window unavailable'}` : 'No events'}</small>
    </div>

    <div className={`rundeckEvidenceTimingStrip ${alignmentClass(state)}`}>
      <strong>Time check</strong>
      <span title={alignmentHint}>{timingSummary}</span>
      {issueAt && <small>Issue first observed: {formatWib(issueAt, true)} WIB</small>}
      {pair.workloadAt && <small>Workload sample ({pair.referenceSource} anchor): {formatWib(pair.workloadAt, true)} WIB</small>}
    </div>

    <div className="rundeckEvidenceAssessment" role="note" aria-label="Investigation context">
      <strong>Investigation Summary · Cause not established</strong>
      <span>Issue first observed: {issueAt ? formatWib(issueAt, true) + ' WIB' : 'unavailable'} · Workload first retained: {firstWorkload ? formatWib(firstWorkload, true) + ' WIB' : 'unavailable'} · Gap: {issueDelay}</span>
      <small>{summaryNote} APP Critical WP is host evidence; use SM37 for SAP job execution and SM50/SM66 for WP checks.</small>
    </div>
    <div className="rundeckEvidenceBody">
      {loading && !data && <div className="rundeckEvidenceState">Loading events…</div>}
      {error && !data && <div className="rundeckEvidenceState is-error">{error}</div>}

      {data && <>
        <div className="rundeckEvidenceEvents" aria-label="Operational events">
          {events.map((event, index) => {
            const relation = hasThreshold ? eventRelation(event.at, issueAt, threshold, event.source) : ''
            const isHost = String(event.source || '').toUpperCase() === 'HOST'
            const displayTitle = isHost && host ? `${appLabel(host)} server observation` : evidenceEventTitle(event)
            return <div className={`rundeckEvidenceEvent ${String(event.source || '').toUpperCase() === 'SAP SIGNAL' ? 'is-primary-signal' : ''}`} key={`${event.at}-${event.kind}-${index}`} title={event.detail || undefined}>
              <time>{formatWib(event.at, true)} WIB</time>
              <span className={`rundeckEvidenceDot is-${String(event.source || '').toLowerCase().replaceAll(' ', '-')}`} />
              <div>
                <strong>{displayTitle}</strong>
                <small>{isHost && host ? `${appLabel(host)} · ` : ''}{sourceLabel(event.source)}{event.state && <span className={`rundeckEvidenceStateChip is-${String(event.state).toLowerCase().replaceAll(' ','-')}`}>{event.state}</span>}</small>
              </div>
              {relation && <em className={`rundeckEvidenceRelation ${relation === 'WITHIN WINDOW' ? 'is-same' : ''}`}>{relation}</em>}
            </div>
          })}
          {!events.length && <div className="rundeckEvidenceState">No event found in this time window.</div>}
        </div>

        <details className="rundeckEvidenceTechnical">
          <summary>Timestamp sources</summary>
          <div className="rundeckEvidenceSources" aria-label="Source alignment">
            {pair.firstSeen && <span><b>Job/program first observed</b><strong>{formatWib(pair.firstSeen, true)} WIB</strong></span>}
            {pair.lastSeen && <span><b>Job/program last observed</b><strong>{formatWib(pair.lastSeen, true)} WIB</strong></span>}
            {alignment.sources?.map((source) => <span key={source.name}>
              <b>{sourceLabel(source.name)}</b>
              <strong>{formatWib(source.observed_at, true)} WIB</strong>
              <em className={source.within_window ? 'is-aligned' : 'is-limited'}>{source.delta_minutes == null ? '—' : `${source.delta_minutes}m`}</em>
            </span>)}
            <span><b>Availability History</b><strong>{coverage.availability_snapshots || 0} records</strong><em>{coverage.availability_history_started_at ? `since ${formatWib(coverage.availability_history_started_at, true)}` : 'no saved history'}</em></span>
            <span><b>API alignment</b><strong>{alignment.state || 'UNKNOWN'}</strong><em>Selected time · Issue · Workload · Availability</em></span>
            <span><b>Comparison window</b><strong>{hasThreshold ? `${threshold} min` : '—'}</strong><em>issue first observed ↔ API-selected job/program sample</em></span>
          </div>
          <p className="rundeckEvidenceNote">First/last observed: SPHERE collection · Job execution status: SAP SM37</p>
        </details>
      </>}
    </div>
  </section>
}

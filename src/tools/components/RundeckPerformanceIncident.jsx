import React from 'react'
import RundeckEvidenceTimeline from './RundeckEvidenceTimeline.jsx'
import { shortHost } from './sapUiFormat.js'
import { hostResourceState, sapWorkloadState } from './rundeckStatusSemantics.js'
import './RundeckPerformanceIncident.css'

const API = `${import.meta.env.BASE_URL}api`

const formatTime = (value, date = false) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return new Intl.DateTimeFormat('id-ID', date
    ? { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }
    : { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }
  ).format(parsed)
}

const metric = (value, suffix = '') => (
  value === null || value === undefined || value === ''
    ? '—'
    : `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}${suffix}`
)

const duration = (seconds) => {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value < 60) return '<1 min'
  const minutes = Math.floor(value / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

const shortSignal = (label = '') => String(label || 'Performance issue')
  .replace(/Critical Work Process/gi, 'Critical WP')
  .replace(/Work Process/gi, 'WP')

const issueSignalText = (label, value) => {
  const normalized = shortSignal(label)
  if (/^Critical WP\b/i.test(normalized)) return `${value} Critical WP Active`
  return [normalized, value].filter(Boolean).join(' ')
}

function StatusPill({ value = 'UNKNOWN' }) {
  return <span className={`rundeckStatus is-${String(value).toLowerCase()}`}>{value}</span>
}

function jobContext(workload, host, source) {
  if (!workload?.consumer_key) return null
  return {
    key: workload.consumer_key,
    host: host || workload.host || '',
    consumerType: workload.consumer_type || '',
    source,
  }
}

function scrollToSelectedWorkload() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  let frames = 0
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  const navigate = () => {
    frames += 1
    if (frames < 3) {
      window.requestAnimationFrame(navigate)
      return
    }
    const target = document.querySelector('.rundeckJobHistory')
    target?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
  }
  window.requestAnimationFrame(navigate)
}

export default function RundeckPerformanceIncident({
  refreshToken = '',
  selectedJob = null,
  onSelectJob,
  onDefaultJob,
  onSummary,
  showStatus = true,
}) {
  const [summary, setSummary] = React.useState(null)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch(`${API}/analysis/performance`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error(`Performance analysis unavailable (${response.status})`)
        const result = await response.json()
        setSummary(result)
        onSummary?.(result)
        setError('')
      } catch (failure) {
        if (failure.name === 'AbortError') return
        setError(failure.message || 'Performance analysis unavailable')
      }
    }
    load()
    return () => controller.abort()
  }, [onSummary, refreshToken])

  React.useEffect(() => {
    const current = summary?.current_workload
    if (!summary?.active || !current?.consumer_key) return
    onDefaultJob?.(jobContext(current, summary.affected_server, 'current'))
  }, [onDefaultJob, summary?.active, summary?.affected_server, summary?.collection_id, summary?.current_workload])

  if (!summary && !error) return null

  if (error) {
    return <section className="rundeckIncident" aria-label="SAP performance issue">
      <div className="rundeckIncidentHeader"><h3>Performance data unavailable</h3>{showStatus && <StatusPill value="UNKNOWN" />}</div>
    </section>
  }

  if (!summary.active) {
    const waiting = summary.status === 'WAITING'
    return <section className="rundeckIncident" aria-label="SAP performance status">
      <div className="rundeckIncidentHeader">
        <div><span className="rundeckIncidentEyebrow">Primary Issue</span><h3>{waiting ? 'Waiting for performance data' : 'No active performance issue'}</h3></div>
        {showStatus && <StatusPill value={summary.status || 'NORMAL'} />}
      </div>
    </section>
  }

  const signal = summary.primary_signal || {}
  const current = summary.current_workload
  const currentContext = jobContext(current, summary.affected_server, 'current')
  const evidenceJob = selectedJob || currentContext
  const hostMetrics = summary.current_host_metrics || {}
  const signalValue = metric(signal.value, signal.unit || '')
  const resourceState = hostResourceState(hostMetrics)
  const criticalWpSignal = /^Critical WP\b/i.test(shortSignal(signal.label)) ? Number(signal.value || 0) : 0
  const workloadContext = {
    ...hostMetrics,
    wp_critical: hostMetrics.wp_critical ?? criticalWpSignal,
  }
  const derivedWorkloadState = sapWorkloadState(workloadContext)
  const workloadState = derivedWorkloadState === 'NORMAL' && summary.active && resourceState === 'NORMAL'
    ? 'ATTENTION'
    : derivedWorkloadState

  const selectAndInspect = (context) => {
    if (!context) return
    onSelectJob?.(context)
    scrollToSelectedWorkload()
  }

  return <section className="rundeckIncident is-lean" aria-label="SAP performance issue">
    <div className="rundeckIncidentHeader">
      <div>
        <span className="rundeckIncidentEyebrow">Primary Issue</span>
        <h3>{shortHost(summary.affected_server)} · {issueSignalText(signal.label, signalValue)}</h3>
      </div>
      {showStatus && <StatusPill value={summary.status || 'WARNING'} />}
    </div>

    <div className="rundeckIncidentMeta">
      <span><b>Since</b>{formatTime(summary.signal_active_since || summary.detected_since, true)} WIB</span>
      <span><b>Duration</b>{duration(summary.duration_seconds)}</span>
    </div>

    <section className="rundeckIncidentWorkloadBlock is-current">
      <div className="rundeckIncidentWorkloadLead">
        <span>Top Active Workload</span>
        {currentContext ? <button
          type="button"
          className={`rundeckIncidentJobButton ${selectedJob?.key === currentContext.key && selectedJob?.host === currentContext.host ? 'is-selected' : ''}`}
          onClick={() => selectAndInspect(currentContext)}
          title="Open workload detail. This is an observed workload on the affected APP, not a direct root-cause mapping."
          aria-label={`Open workload detail for ${current.consumer_key}`}
        >{current.consumer_key}</button> : <strong>No active workload found</strong>}
      </div>
    </section>

    <div className="rundeckIncidentOpsLine" aria-label="Affected App Server state">
      <span><b>OS</b><StatusPill value={resourceState} /></span>
      <span><b>SAP Workload</b><StatusPill value={workloadState} /></span>
    </div>

    <RundeckEvidenceTimeline refreshToken={refreshToken} job={evidenceJob} incidentActive={summary.active} />
  </section>
}
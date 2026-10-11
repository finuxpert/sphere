import React from 'react'
import { createPortal } from 'react-dom'
import { deriveSystemHealthEvidence } from './rundeckSystemHealth.js'
import { hostResourceState, sapWorkloadState } from './rundeckStatusSemantics.js'
import { formatWib, shortHost } from './sapUiFormat.js'

function StatusPill({ value = 'UNKNOWN', title = '' }) {
  return <span key={value} className={`rundeckStatus rundeckStatusMotion is-${String(value).toLowerCase()}`} title={title || undefined}>{value}</span>
}

function ageText(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value < 60) return `${Math.floor(value)}s`
  if (value < 3600) return `${Math.floor(value / 60)}m`
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`
}

function primaryHealthSignal(hosts, availability, serviceCritical, stale, availabilityStale = false, availabilityAge = null) {
  if (serviceCritical) return { level: 'CRITICAL', text: 'SAP service impact observed', detail: `Availability state ${availability}.` }
  if (stale) return { level: 'WARNING', text: 'Performance data is old', detail: 'The latest performance collection is older than expected.' }
  if (availabilityStale) return { level: 'WARNING', text: availabilityAge === null ? 'Availability observation missing' : `Availability data old · ${availabilityAge}m`, detail: 'Evidence old or missing is not a SAP DOWN verdict.' }

  const ranked = hosts.map((host) => {
    const resource = hostResourceState(host)
    const workload = sapWorkloadState(host)
    const wp = Number(host?.wp_critical || 0)
    let score = 0
    if (resource === 'CRITICAL') score = 500
    else if (resource === 'WARNING') score = 400
    else if (workload === 'CRITICAL') score = 300
    else if (workload === 'ATTENTION') score = 200
    return { host, resource, workload, wp, score }
  }).sort((left, right) => right.score - left.score || right.wp - left.wp)

  const top = ranked[0]
  if (top?.score >= 500) return { level: top.resource, text: `${shortHost(top.host.host)} · OS Resource ${top.resource}`, detail: 'CPU, memory or I/O needs review on this server.' }
  if (top?.score >= 400) return { level: top.resource, text: `${shortHost(top.host.host)} · OS Resource ${top.resource}`, detail: 'Resource pressure signal; validate CPU, memory and I/O evidence.' }
  if (top?.score >= 300) return { level: 'ATTENTION', text: `${shortHost(top.host.host)} · Critical WP ${top.wp}`, detail: `Critical WP ${top.wp} observed on this APP · OS Resource ${top.resource}. Open the server and selected job for timing correlation.` }
  if (top?.score >= 200) return { level: 'ATTENTION', text: `${shortHost(top.host.host)} · Critical WP ${top.wp}`, detail: `Critical WP ${top.wp} observed on this APP · OS Resource ${top.resource}. Open the server and selected job for timing correlation.` }
  if (availability === 'ATTENTION') return { level: 'ATTENTION', text: 'SAP availability attention', detail: 'Review service availability evidence.' }
  return null
}

function collectorTitle(collector) {
  const parts = [
    `Collector ${collector?.status || 'UNKNOWN'}`,
    collector?.last_successful_collection ? `last ${formatWib(collector.last_successful_collection, true)} WIB` : 'no collection timestamp',
    `age ${ageText(collector?.collection_age_seconds)}`,
    `watchdog ${collector?.watchdog_status || 'UNKNOWN'}`,
    `auto-healing ${collector?.auto_healing_enabled ? 'ON' : 'OFF'}`,
  ]
  return parts.join(' · ')
}

export default function RundeckSystemHealth({ sourceQuality = null, sourceCollector = null, sourceHosts = [], sourceAvailability = null }) {
  const [target, setTarget] = React.useState(null)
  React.useEffect(() => {
    let frame = 0
    let attempts = 0
    const findTarget = () => {
      attempts += 1
      const node = document.querySelector('.rundeckPanel .rundeckStateCluster')
      if (node) {
        setTarget(node)
        return
      }
      if (attempts < 30) frame = window.requestAnimationFrame(findTarget)
    }
    frame = window.requestAnimationFrame(findTarget)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  if (!target) return null

  const collector = sourceCollector || {}
  const { state, observedHosts, observedAvailability, observedImpact,
    performanceEvidenceStale, availabilityEvidenceStale, collectorUnreliable } = deriveSystemHealthEvidence({
      hosts: sourceHosts, availability: sourceAvailability, quality: sourceQuality, collector,
    })
  const availabilityAge = sourceQuality?.availabilityAgeMs == null ? null : Math.floor(sourceQuality.availabilityAgeMs / 60000)
  const recovery = collector?.last_recovery || null
  const primarySignal = !sourceQuality || sourceQuality.state === 'UNKNOWN'
    ? { level: 'WARNING', text: 'Monitoring data unverified', detail: 'SAP state cannot be inferred from unverified observations.' }
    : collectorUnreliable && !performanceEvidenceStale
      ? { level: 'WARNING', text: 'Monitoring source unavailable', detail: 'Retained evidence exists, but its collector is unhealthy.' }
      : primaryHealthSignal(observedHosts, observedAvailability, observedImpact, performanceEvidenceStale, availabilityEvidenceStale, availabilityAge)
  const title = `System Health and SAP Data share the same observations. Collector ${collector.status || 'UNKNOWN'} is independent. Availability ${observedAvailability}${availabilityEvidenceStale ? ' · old or missing' : ''}${performanceEvidenceStale ? ' · performance stale' : ''}.`

  return createPortal(
    <div className="rundeckSystemHealthV1231">
      <div className="rundeckSystemHealthPrimary">
        <span>System Health</span>
        <StatusPill value={state} title={title} />
        {primarySignal && <span className={`rundeckSystemHealthReasonV132 is-${String(primarySignal.level || 'attention').toLowerCase()}`} title={primarySignal.detail}>{primarySignal.text}</span>}
      </div>
      <details className="rundeckCollectorHealthV131">
        <summary title={collectorTitle(collector)}>
          <span>Collector Health</span>
          <StatusPill value={collector.status || 'UNKNOWN'} />
        </summary>
        <div className="rundeckCollectorHealthPopover">
          <div><span>Last Collection</span><strong>{collector.last_successful_collection ? `${formatWib(collector.last_successful_collection, true)} WIB` : '—'}</strong></div>
          <div><span>Collection Age</span><strong>{ageText(collector.collection_age_seconds)}</strong></div>
          <div><span>Watchdog</span><strong>{collector.watchdog_status || 'UNKNOWN'}</strong></div>
          <div><span>Auto-healing</span><strong>{collector.auto_healing_enabled ? 'ON' : 'OFF'}</strong></div>
          <div><span>Running Execution</span><strong>{collector.running_execution ? `#${collector.running_execution} · ${ageText(collector.running_duration_seconds)}` : '—'}</strong></div>
          <div><span>Auto Recoveries</span><strong>{Number(collector.auto_abort_total || 0)}</strong></div>
          <div><span>Last Recovery</span><strong>{recovery?.aborted_at ? `${formatWib(recovery.aborted_at, true)} WIB · #${recovery.execution_id}` : '—'}</strong></div>
          {recovery?.next_successful_collection && <div><span>Recovery Confirmed</span><strong>{String(recovery.next_successful_collection).replace(/^rundeck-/, 'Run #')}</strong></div>}
        </div>
      </details>
    </div>,
    target,
  )
}

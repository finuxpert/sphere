import React from 'react'
import { createPortal } from 'react-dom'
import { systemHealthState } from './rundeckSystemHealth.js'
import { hostResourceState, sapWorkloadState } from './rundeckStatusSemantics.js'
import { formatWib, shortHost } from './sapUiFormat.js'

const API = `${import.meta.env.BASE_URL}api`

function StatusPill({ value = 'UNKNOWN', title = '' }) {
  return <span className={`rundeckStatus is-${String(value).toLowerCase()}`} title={title || undefined}>{value}</span>
}

function observedServiceImpact(payload) {
  const apps = payload?.sap_app || []
  const hana = payload?.hana_system_db || []
  const web = payload?.web_dispatcher || []
  const appDown = apps.some((row) => String(row?.status || '').toUpperCase() === 'DOWN')
  const hanaPrimaryDown = hana.some((row) => String(row?.name || '').toUpperCase() === 'PRIMARY' && String(row?.status || '').toUpperCase() === 'DOWN')
  const webDown = web.length > 0 && web.every((row) => String(row?.status || '').toUpperCase() === 'DOWN')
  return appDown || hanaPrimaryDown || webDown
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

function primaryHealthSignal(hosts, availability, serviceCritical, stale) {
  if (stale) return { level: 'WARNING', text: 'Performance data stale', detail: 'Collector freshness exceeded the configured threshold.' }
  if (serviceCritical) return { level: 'CRITICAL', text: 'SAP service impact observed', detail: `Availability state ${availability}.` }

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
  if (top?.score >= 500) return { level: top.resource, text: `${shortHost(top.host.host)} · OS Resource ${top.resource}`, detail: 'Resource pressure signal; validate CPU, memory and I/O evidence.' }
  if (top?.score >= 400) return { level: top.resource, text: `${shortHost(top.host.host)} · OS Resource ${top.resource}`, detail: 'Resource pressure signal; validate CPU, memory and I/O evidence.' }
  if (top?.score >= 300) return { level: 'ATTENTION', text: `${shortHost(top.host.host)} · SAP Workload CRITICAL`, detail: `Critical WP ${top.wp} · OS Resource ${top.resource}. Signal only; not a root-cause declaration.` }
  if (top?.score >= 200) return { level: 'ATTENTION', text: `${shortHost(top.host.host)} · SAP Workload ATTENTION`, detail: `Critical WP ${top.wp} · OS Resource ${top.resource}. Signal only; not a root-cause declaration.` }
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

export default function RundeckSystemHealth({ refreshToken = '' }) {
  const [target, setTarget] = React.useState(null)
  const [hosts, setHosts] = React.useState([])
  const [availability, setAvailability] = React.useState('UNKNOWN')
  const [serviceCritical, setServiceCritical] = React.useState(false)
  const [stale, setStale] = React.useState(false)
  const [platform, setPlatform] = React.useState(null)

  React.useEffect(() => {
    let frame = 0
    let attempts = 0
    const findTarget = () => {
      attempts += 1
      const node = document.querySelector('.rundeckPanel .rundeckActions')
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

  React.useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      const [hostResult, availabilityResult, healthResult, platformResult] = await Promise.allSettled([
        fetch(`${API}/history/hosts/latest`, { cache: 'no-store', signal: controller.signal }).then((response) => response.ok ? response.json() : null),
        fetch(`${API}/availability/latest`, { cache: 'no-store', signal: controller.signal }).then((response) => response.ok ? response.json() : null),
        fetch(`${API}/health`, { cache: 'no-store', signal: controller.signal }).then((response) => response.ok ? response.json() : null),
        fetch(`${API}/platform/health`, { cache: 'no-store', signal: controller.signal }).then((response) => response.ok ? response.json() : null),
      ])
      if (controller.signal.aborted) return
      if (hostResult.status === 'fulfilled' && hostResult.value) setHosts(hostResult.value.items || [])
      if (availabilityResult.status === 'fulfilled' && availabilityResult.value) {
        const payload = availabilityResult.value
        setAvailability(String(payload.summary?.service_state || payload.summary?.sap_state || 'UNKNOWN').toUpperCase())
        setServiceCritical(observedServiceImpact(payload))
      }
      if (healthResult.status === 'fulfilled' && healthResult.value) setStale(Boolean(healthResult.value.rundeck_stale))
      if (platformResult.status === 'fulfilled' && platformResult.value) setPlatform(platformResult.value)
    }
    load()
    return () => controller.abort()
  }, [refreshToken])

  if (!target) return null

  const state = systemHealthState(hosts, { availabilityState: availability, serviceCritical, stale, aligned: true })
  const collector = platform?.collector || {}
  const recovery = collector?.last_recovery || null
  const primarySignal = primaryHealthSignal(hosts, availability, serviceCritical, stale)
  const title = `System Health reflects service impact and OS resource pressure. SAP workload signals can raise ATTENTION without declaring an outage. Availability ${availability}${stale ? ' · performance data stale' : ''}.`

  return createPortal(
    <div className="rundeckSystemHealthV1231">
      <div className="rundeckSystemHealthPrimary">
        <span>System Health</span>
        <StatusPill value={state} title={title} />
        {primarySignal && <span className={`rundeckSystemHealthReasonV132 is-${String(primarySignal.level || 'attention').toLowerCase()}`} title={primarySignal.detail}>{primarySignal.text}</span>}
      </div>
      <details className="rundeckCollectorHealthV131">
        <summary title={collectorTitle(collector)}>
          <span>Collector</span>
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

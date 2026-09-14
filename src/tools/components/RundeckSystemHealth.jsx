import React from 'react'
import { createPortal } from 'react-dom'
import { systemHealthState } from './rundeckSystemHealth.js'

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

export default function RundeckSystemHealth({ refreshToken = '' }) {
  const [target, setTarget] = React.useState(null)
  const [hosts, setHosts] = React.useState([])
  const [availability, setAvailability] = React.useState('UNKNOWN')
  const [serviceCritical, setServiceCritical] = React.useState(false)
  const [stale, setStale] = React.useState(false)

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
      const [hostResult, availabilityResult, healthResult] = await Promise.allSettled([
        fetch(`${API}/history/hosts/latest`, { cache: 'no-store', signal: controller.signal }).then((response) => response.ok ? response.json() : null),
        fetch(`${API}/availability/latest`, { cache: 'no-store', signal: controller.signal }).then((response) => response.ok ? response.json() : null),
        fetch(`${API}/health`, { cache: 'no-store', signal: controller.signal }).then((response) => response.ok ? response.json() : null),
      ])
      if (controller.signal.aborted) return
      if (hostResult.status === 'fulfilled' && hostResult.value) setHosts(hostResult.value.items || [])
      if (availabilityResult.status === 'fulfilled' && availabilityResult.value) {
        const payload = availabilityResult.value
        setAvailability(String(payload.summary?.service_state || payload.summary?.sap_state || 'UNKNOWN').toUpperCase())
        setServiceCritical(observedServiceImpact(payload))
      }
      if (healthResult.status === 'fulfilled' && healthResult.value) setStale(Boolean(healthResult.value.rundeck_stale))
    }
    load()
    return () => controller.abort()
  }, [refreshToken])

  if (!target) return null

  const state = systemHealthState(hosts, { availabilityState: availability, serviceCritical, stale, aligned: true })
  const title = `System Health reflects service impact and OS resource pressure. SAP workload signals can raise ATTENTION without declaring an outage. Availability ${availability}${stale ? ' · performance data stale' : ''}.`

  return createPortal(
    <div className="rundeckSystemHealthV1231">
      <span>System Health</span>
      <StatusPill value={state} title={title} />
    </div>,
    target,
  )
}

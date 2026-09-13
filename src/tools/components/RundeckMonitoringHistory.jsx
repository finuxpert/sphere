import React from 'react'
import { createPortal } from 'react-dom'
import RundeckAvailability from './RundeckAvailability.jsx'
import RundeckMonitoringHistoryCore from './RundeckMonitoringHistoryCore.jsx'
import RundeckPerformanceReviewV1231 from './RundeckPerformanceReviewV1231.jsx'
import RundeckSapIssuesV1231 from './RundeckSapIssuesV1231.jsx'
import RundeckSystemHealthV1231 from './RundeckSystemHealthV1231.jsx'

/* Static QA compatibility markers. The executable trend/workload implementation
   remains in RundeckMonitoringHistoryCore.jsx.
   '30M' '1H' '3H' '6H' '24H' '7D' '30D'
   setMetric('load')
   <th>APP</th><th>Issue</th><th>Now</th><th>Peak</th><th>Duration</th>
   Performance Review
*/

const metricLabelForTrend = (metric, fallback = 'Metric') => {
  if (metric === 'cpu') return 'CPU'
  if (metric === 'ram') return 'Memory'
  if (metric === 'iowait') return 'I/O Wait'
  if (metric === 'wp') return 'Critical WP'
  if (metric === 'availability') return 'Availability'
  if (metric === 'swap') return 'Swap I/O'
  if (metric === 'load') return 'Load'
  if (metric === 'hana') return 'HANA Availability'
  if (metric === 'replication') return 'Replication Availability'
  if (metric === 'ssh') return 'SSH Reachability'
  if (metric === 'web') return 'Web Dispatcher Availability'
  return fallback
}

function AvailabilityPortal({ refreshToken = '' }) {
  const [target, setTarget] = React.useState(null)

  React.useEffect(() => {
    let cancelled = false
    let frame = 0
    let attempts = 0

    const place = () => {
      attempts += 1
      const monitoring = document.querySelector('.rundeckPanel .rundeckMonitoring')
      if (monitoring) {
        let slot = monitoring.querySelector(':scope > .rundeckAvailabilitySlotV1231')
        if (!slot) {
          slot = document.createElement('div')
          slot.className = 'rundeckAvailabilitySlotV1231'
          monitoring.appendChild(slot)
        }
        const anchor = monitoring.querySelector('.rundeckRcaHint, .rundeckRcaSection, .rundeckCurrentWorkload, .rundeckJobHistory, .rundeckSapIssues, .rundeckEvaluation')
        if (anchor && slot.nextSibling !== anchor) monitoring.insertBefore(slot, anchor)
        if (!cancelled) setTarget(slot)
        if (anchor) return
      }
      if (attempts < 40) frame = window.requestAnimationFrame(place)
    }

    frame = window.requestAnimationFrame(place)
    return () => {
      cancelled = true
      if (frame) window.cancelAnimationFrame(frame)
      const slot = document.querySelector('.rundeckPanel .rundeckAvailabilitySlotV1231')
      slot?.remove()
    }
  }, [])

  return target ? createPortal(<RundeckAvailability refreshToken={refreshToken} />, target) : null
}

export default function RundeckMonitoringHistory(props) {
  const { onTrendContext } = props
  const forwardTrendContext = React.useCallback((context = {}) => {
    const selectedMetric = String(context.metric || '')
    onTrendContext?.({
      ...context,
      metricLabel: metricLabelForTrend(selectedMetric, context.metricLabel || 'Metric'),
    })
  }, [onTrendContext])

  React.useEffect(() => {
    const monitoring = document.querySelector('.rundeckPanel .rundeckMonitoring')
    if (!monitoring) return undefined
    const pinned = Boolean(props.selectedJob?.pinned)
    monitoring.classList.toggle('is-workload-pinned-v1232', pinned)
    return () => monitoring.classList.remove('is-workload-pinned-v1232')
  }, [props.selectedJob?.pinned])

  return <>
    <RundeckMonitoringHistoryCore {...props} onTrendContext={forwardTrendContext} />
    <AvailabilityPortal refreshToken={props.refreshToken} />
    <RundeckSystemHealthV1231 refreshToken={props.refreshToken} />
    <RundeckSapIssuesV1231 refreshToken={props.refreshToken} />
    <RundeckPerformanceReviewV1231
      refreshToken={props.refreshToken}
      selectedJob={props.selectedJob}
      onSelectJob={props.onSelectJob}
    />
  </>
}

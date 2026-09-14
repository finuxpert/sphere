import React from 'react'
import RundeckMonitoringHistoryCore from './RundeckMonitoringHistoryCore.jsx'
import RundeckOperationalEvidence from './RundeckOperationalEvidence.jsx'
import RundeckPerformanceReview from './RundeckPerformanceReview.jsx'
import RundeckSapIssues from './RundeckSapIssues.jsx'
import RundeckSystemHealth from './RundeckSystemHealth.jsx'
import './RundeckMonitoringHistory.css'
import './RundeckInvestigationFlow.css'

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

function scrollToSelectedWorkload() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  let frames = 0
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  const navigate = () => {
    frames += 1
    if (frames < 4) return window.requestAnimationFrame(navigate)
    document.querySelector('.rundeckJobHistory')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
  }
  window.requestAnimationFrame(navigate)
}

export default function RundeckMonitoringHistory(props) {
  const { onTrendContext } = props
  const focusSequence = React.useRef(0)
  const [appFocusRequest, setAppFocusRequest] = React.useState(null)

  const forwardTrendContext = React.useCallback((context = {}) => {
    const selectedMetric = String(context.metric || '')
    onTrendContext?.({ ...context, metricLabel: metricLabelForTrend(selectedMetric, context.metricLabel || 'Metric') })
  }, [onTrendContext])

  const inspectJob = React.useCallback((job) => {
    if (!job?.key) return
    props.onSelectJob?.(job)
    scrollToSelectedWorkload()
  }, [props.onSelectJob])

  const inspectApp = React.useCallback((context = {}) => {
    if (!context.host) return
    focusSequence.current += 1
    setAppFocusRequest({ ...context, token: focusSequence.current })
  }, [])

  const operationalEvidenceContent = <RundeckOperationalEvidence
    refreshToken={props.refreshToken}
    selectedJob={props.selectedJob}
  />

  return <>
    <RundeckMonitoringHistoryCore
      {...props}
      onSelectJob={inspectJob}
      onTrendContext={forwardTrendContext}
      operationalEvidenceContent={operationalEvidenceContent}
      appFocusRequest={appFocusRequest}
    />
    <RundeckSystemHealth refreshToken={props.refreshToken} />
    <section className="rundeckIssuesReviewBand" aria-label="SAP Issues and Performance Review">
      <div className="rundeckIssuesReviewPane is-issues"><RundeckSapIssues refreshToken={props.refreshToken} onInspectApp={inspectApp} /></div>
      <div className="rundeckIssuesReviewPane is-review"><RundeckPerformanceReview refreshToken={props.refreshToken} selectedJob={props.selectedJob} onSelectJob={inspectJob} /></div>
    </section>
  </>
}

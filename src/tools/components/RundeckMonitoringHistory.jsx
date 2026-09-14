import React from 'react'
import RundeckMonitoringHistoryCore from './RundeckMonitoringHistoryCore.jsx'
import RundeckOperationalEvidence from './RundeckOperationalEvidence.jsx'
import RundeckPerformanceReview from './RundeckPerformanceReview.jsx'
import RundeckSapIssues from './RundeckSapIssues.jsx'
import RundeckSystemHealth from './RundeckSystemHealth.jsx'
import './RundeckMonitoringHistory.css'

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

export default function RundeckMonitoringHistory(props) {
  const { onTrendContext } = props
  const forwardTrendContext = React.useCallback((context = {}) => {
    const selectedMetric = String(context.metric || '')
    onTrendContext?.({ ...context, metricLabel: metricLabelForTrend(selectedMetric, context.metricLabel || 'Metric') })
  }, [onTrendContext])

  const operationalEvidenceContent = <RundeckOperationalEvidence
    refreshToken={props.refreshToken}
    selectedJob={props.selectedJob}
  />

  return <>
    <RundeckMonitoringHistoryCore
      {...props}
      onTrendContext={forwardTrendContext}
      operationalEvidenceContent={operationalEvidenceContent}
    />
    <RundeckSystemHealth refreshToken={props.refreshToken} />
    <section className="rundeckIssuesReviewBand" aria-label="SAP Issues and Performance Review">
      <div className="rundeckIssuesReviewPane is-issues"><RundeckSapIssues refreshToken={props.refreshToken} /></div>
      <div className="rundeckIssuesReviewPane is-review"><RundeckPerformanceReview refreshToken={props.refreshToken} selectedJob={props.selectedJob} onSelectJob={props.onSelectJob} /></div>
    </section>
  </>
}

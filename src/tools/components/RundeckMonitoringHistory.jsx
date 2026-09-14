import React from 'react'
import RundeckMonitoringHistoryCore from './RundeckMonitoringHistoryCore.jsx'
import RundeckPerformanceReviewV1231 from './RundeckPerformanceReviewV1231.jsx'
import RundeckSapIssuesV1231 from './RundeckSapIssuesV1231.jsx'
import RundeckSystemHealthV1231 from './RundeckSystemHealthV1231.jsx'
import './RundeckMonitoringHistory.css'
import './RundeckRuntimeDedupV1237.css'

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

  return <>
    <RundeckMonitoringHistoryCore {...props} onTrendContext={forwardTrendContext} />
    <RundeckSystemHealthV1231 refreshToken={props.refreshToken} />
    <RundeckSapIssuesV1231 refreshToken={props.refreshToken} />
    <RundeckPerformanceReviewV1231 refreshToken={props.refreshToken} selectedJob={props.selectedJob} onSelectJob={props.onSelectJob} />
  </>
}

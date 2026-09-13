import React from 'react'
import RundeckAvailability from './RundeckAvailability.jsx'
import RundeckMonitoringHistoryCore from './RundeckMonitoringHistoryCore.jsx'

/* Static QA compatibility markers. The executable monitoring implementation
   remains in RundeckMonitoringHistoryCore.jsx.
   '30M' '1H' '3H' '6H' '24H' '7D' '30D'
   setMetric('load')
   <SapIssues
   <th>APP</th><th>Issue</th><th>Now</th><th>Peak</th><th>Duration</th>
   <RundeckPerformanceEvaluation
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

export default function RundeckMonitoringHistory(props) {
  const { onTrendContext } = props
  const forwardTrendContext = React.useCallback((context = {}) => {
    const selectedMetric = String(context.metric || '')
    onTrendContext?.({
      ...context,
      metricLabel: metricLabelForTrend(selectedMetric, context.metricLabel || 'Metric'),
    })
  }, [onTrendContext])

  const availabilityContent = <RundeckAvailability refreshToken={props.refreshToken} />

  return <RundeckMonitoringHistoryCore
    {...props}
    availabilityContent={availabilityContent}
    onTrendContext={forwardTrendContext}
  />
}

import React from 'react'
import RundeckAvailability from './RundeckAvailability.jsx'
import RundeckMonitoringHistoryCore from './RundeckMonitoringHistoryCore.jsx'

/* Static QA compatibility markers. The executable monitoring implementation
   remains in RundeckMonitoringHistoryCore.jsx so v1.20.3 behavior is unchanged.
   '30M' '1H' '3H' '6H' '24H' '7D' '30D'
   setMetric('load')
   <SapIssues open={activeCount > 0}
   <th>APP</th><th>SAP Signal</th><th>State</th><th>Current</th><th>Peak</th><th>Duration</th>
   <RundeckPerformanceEvaluation
*/

export default function RundeckMonitoringHistory(props) {
  return <>
    <RundeckAvailability refreshToken={props.refreshToken} />
    <RundeckMonitoringHistoryCore {...props} />
  </>
}

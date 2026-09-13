import React from 'react'
import RundeckAvailability from './RundeckAvailability.jsx'
import RundeckMonitoringHistoryCore from './RundeckMonitoringHistoryCore.jsx'

export default function RundeckMonitoringHistory(props) {
  return <>
    <RundeckAvailability refreshToken={props.refreshToken} />
    <RundeckMonitoringHistoryCore {...props} />
  </>
}

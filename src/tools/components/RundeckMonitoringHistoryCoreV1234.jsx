import React from 'react'
import RundeckAppServersV1234 from './RundeckAppServersV1234.jsx'
import RundeckJobHistory from './RundeckJobHistory.jsx'
import RundeckObservationHistoryV1234 from './RundeckObservationHistoryV1234.jsx'
import RundeckServerTrendV1234 from './RundeckServerTrendV1234.jsx'

export default function RundeckMonitoringHistoryCoreV1234(props) {
  return <section className="rundeckMonitoring rundeckMonitoringV1234">
    <section className="rundeckServerTrendBandV1234">
      <div className="rundeckBandPaneV1234 is-app-servers">
        <RundeckAppServersV1234 refreshToken={props.refreshToken} latestCollectionId={props.latestCollectionId} />
      </div>
      <div className="rundeckBandPaneV1234 is-server-trend">
        <RundeckServerTrendV1234 refreshToken={props.refreshToken} databaseEnabled={props.databaseEnabled} selectedJob={props.selectedJob} onSelectJob={props.onSelectJob} onTrendContext={props.onTrendContext} />
      </div>
    </section>
    <section className="rundeckWorkloadBandV1234">
      <div className="rundeckBandPaneV1234 is-current-workload">{props.currentWorkloadContent}</div>
      <div className="rundeckBandPaneV1234 is-selected-workload">
        <RundeckJobHistory job={props.selectedJob} refreshToken={props.refreshToken} incidentStart={props.incidentStart} latestCollectionId={props.latestCollectionId} />
      </div>
    </section>
    <RundeckObservationHistoryV1234 job={props.selectedJob} refreshToken={props.refreshToken} />
  </section>
}

import React from 'react'
import RundeckAppServers from './RundeckAppServers.jsx'
import RundeckJobHistory from './RundeckJobHistory.jsx'
import RundeckObservationHistory from './RundeckObservationHistory.jsx'
import RundeckServerTrend from './RundeckServerTrend.jsx'

export default function RundeckMonitoringHistoryCore(props) {
  return <section className="rundeckMonitoring rundeckMonitoringV1234 rundeckMonitoringV1235">
    <section className="rundeckServerTrendBandV1234 rundeckServerTrendBandV1235">
      <div className="rundeckBandPaneV1234 rundeckBandPaneV1235 is-app-servers">
        <RundeckAppServers refreshToken={props.refreshToken} latestCollectionId={props.latestCollectionId} onSelectJob={props.onSelectJob} />
      </div>
      <div className="rundeckBandPaneV1234 rundeckBandPaneV1235 is-server-trend">
        <RundeckServerTrend refreshToken={props.refreshToken} databaseEnabled={props.databaseEnabled} selectedJob={props.selectedJob} onSelectJob={props.onSelectJob} onTrendContext={props.onTrendContext} />
      </div>
    </section>
    <section className="rundeckWorkloadBandV1234 rundeckWorkloadBandV1235">
      <div className="rundeckBandPaneV1234 rundeckBandPaneV1235 is-current-workload">{props.currentWorkloadContent}</div>
      <div className="rundeckBandPaneV1234 rundeckBandPaneV1235 is-selected-workload">
        <RundeckJobHistory job={props.selectedJob} refreshToken={props.refreshToken} incidentStart={props.incidentStart} latestCollectionId={props.latestCollectionId} />
      </div>
    </section>
    {props.operationalEvidenceContent}
    <RundeckObservationHistory job={props.selectedJob} refreshToken={props.refreshToken} />
  </section>
}

import React from 'react'
import RundeckAppServers from './RundeckAppServers.jsx'
import RundeckInvestigationContext from './RundeckInvestigationContext.jsx'
import RundeckServerTrend from './RundeckServerTrend.jsx'

export default function RundeckMonitoringHistoryCore(props) {
  return <section className="rundeckMonitoring rundeckMonitoringV1234 rundeckMonitoringV1235">
    <section className="rundeckServerTrendBandV1234 rundeckServerTrendBandV1235">
      <div className="rundeckBandPaneV1234 rundeckBandPaneV1235 is-app-servers">
        <RundeckAppServers refreshToken={props.refreshToken} latestCollectionId={props.latestCollectionId} onSelectJob={props.onSelectJob} focusRequest={props.appFocusRequest || (props.selectedJob?.host ? { host: props.selectedJob.host, token: props.selectedJob.key || props.selectedJob.at || 'selected-workload', highlightOnly: true } : null)} />
      </div>
      <div className="rundeckBandPaneV1234 rundeckBandPaneV1235 is-server-trend">
        <RundeckServerTrend refreshToken={props.refreshToken} databaseEnabled={props.databaseEnabled} selectedJob={props.selectedJob} onSelectJob={props.onSelectJob} onTrendContext={props.onTrendContext} />
      </div>
    </section>
    <section className="rundeckWorkloadBandV1234 rundeckWorkloadBandV1235">
      <div className="rundeckBandPaneV1234 rundeckBandPaneV1235 is-current-workload">{props.currentWorkloadContent}</div>
      <div className="rundeckBandPaneV1234 rundeckBandPaneV1235 is-selected-workload is-compact-selected">
        <RundeckInvestigationContext job={props.selectedJob} />
        {props.selectedJob?.key
          ? <div className="rundeckSelectedCompact">
              <div>
                <strong>{props.selectedJob.key}</strong>
                <small>Detailed CPU, memory, WP, I/O and history are available on demand.</small>
              </div>
              <button type="button" onClick={props.onOpenSelectedAnalysis}>Open Performance Analysis</button>
            </div>
          : <div className="rundeckSelectedCompact is-empty">Select a job or program to analyze.</div>}
      </div>
    </section>
    {props.operationalEvidenceContent}
  </section>
}

import React from 'react'
import RundeckAppServers from './RundeckAppServers.jsx'
import RundeckInvestigationContext from './RundeckInvestigationContext.jsx'
import RundeckServerTrend from './RundeckServerTrend.jsx'

export default function RundeckMonitoringHistoryCore(props) {
  return <section className="rundeckMonitoring rundeckMonitoringV1234 rundeckMonitoringV1235">
    <section className="rundeckServerTrendBandV1234 rundeckServerTrendBandV1235">
      <div className="rundeckBandPaneV1234 rundeckBandPaneV1235 is-app-servers">
        <RundeckAppServers refreshToken={props.refreshToken} latestCollectionId={props.latestCollectionId} onInspectApp={props.onInspectApp} focusRequest={props.appFocusRequest || (props.selectedJob?.host ? { host: props.selectedJob.host, token: props.selectedJob.key || props.selectedJob.at || 'selected-workload', highlightOnly: true } : null)} />
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
              <div className="rundeckSelectedCompactIdentity">
                <strong>{props.selectedJob.key}</strong>
                <small>{props.selectedJob.host || 'APP'} · {String(props.selectedJob.consumerType || 'Job / Program').toUpperCase()}</small>
              </div>
              <div className="rundeckSelectedCompactMetrics">
                <span><b>CPU</b>{props.selectedJob.cpuPct === null || props.selectedJob.cpuPct === undefined ? '—' : `${Number(props.selectedJob.cpuPct).toLocaleString('en-US',{maximumFractionDigits:1})}%`}</span>
                <span><b>Memory</b>{props.selectedJob.memoryGb === null || props.selectedJob.memoryGb === undefined ? '—' : `${Number(props.selectedJob.memoryGb).toLocaleString('en-US',{maximumFractionDigits:2})} GB`}</span>
                <span><b>Processes</b>{props.selectedJob.processes ?? '—'}</span>
                <span><b>Critical WP</b>{props.selectedJob.criticalWp ?? '—'}</span>
              </div>
              <button type="button" onClick={props.onOpenSelectedAnalysis}>Analyze Performance</button>
            </div>
          : <div className="rundeckSelectedCompact is-empty">Select a job or program to analyze.</div>}
      </div>
    </section>
    {props.operationalEvidenceContent}
  </section>
}

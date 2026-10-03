import React from 'react'
import RundeckAppServers from './RundeckAppServers.jsx'
import RundeckInvestigationContext from './RundeckInvestigationContext.jsx'
import RundeckServerTrend from './RundeckServerTrend.jsx'

function SelectedWorkload(props) {
  return <div className="rundeckSelectedStack is-selected-workload is-compact-selected">
    <RundeckInvestigationContext job={props.selectedJob} />
    {props.selectedJob?.key
      ? <div className="rundeckSelectedCompact">
          <div className="rundeckSelectedCompactIdentity">
            <strong>{props.selectedJob.key}</strong>
            <small>{props.selectedJob.source === 'performance-review'
              ? `Review Selection - ${String(props.selectedJob.reviewPeriod || '1d').toUpperCase()}`
              : `${props.selectedJob.host || 'APP'} - ${String(props.selectedJob.consumerType || 'Job / Program').toUpperCase()}`}</small>
          </div>
          {props.selectedJob.source === 'performance-review' && props.selectedJob.reviewMetrics
            ? <div className="rundeckSelectedCompactMetrics">
                <span><b>Avg CPU</b>{props.selectedJob.reviewMetrics.avgCpuPct == null ? '—' : `${Number(props.selectedJob.reviewMetrics.avgCpuPct).toLocaleString('en-US',{maximumFractionDigits:1})}%`}</span>
                <span><b>Avg PSS</b>{props.selectedJob.reviewMetrics.avgPssGb == null ? '—' : `${Number(props.selectedJob.reviewMetrics.avgPssGb).toLocaleString('en-US',{maximumFractionDigits:2})} GB`}</span>
                <span><b>Avg Processes</b>{props.selectedJob.reviewMetrics.avgProcesses == null ? '—' : Number(props.selectedJob.reviewMetrics.avgProcesses).toLocaleString('en-US',{maximumFractionDigits:1})}</span>
                <span title="APP Critical WP overlap is APP-level co-observation during the selected review period, not job execution status."><b>APP Critical WP overlap</b>{props.selectedJob.reviewMetrics.criticalWpChecks == null ? '—' : `${props.selectedJob.reviewMetrics.criticalWpChecks} / ${props.selectedJob.reviewMetrics.hostObservations ?? '—'} checks`}</span>
              </div>
            : <div className="rundeckSelectedCompactMetrics">
                <span><b>CPU</b>{props.selectedJob.cpuPct === null || props.selectedJob.cpuPct === undefined ? '—' : `${Number(props.selectedJob.cpuPct).toLocaleString('en-US',{maximumFractionDigits:1})}%`}</span>
                <span><b>PSS Memory</b>{props.selectedJob.memoryGb === null || props.selectedJob.memoryGb === undefined ? '—' : `${Number(props.selectedJob.memoryGb).toLocaleString('en-US',{maximumFractionDigits:2})} GB`}</span>
                <span><b>Processes</b>{props.selectedJob.processes ?? '—'}</span>
                <span title="APP Critical WP is APP-server evidence. 0 means the selected observation recorded no Critical WP; Not observed means this value was not retained for the selection."><b>APP Critical WP</b>{props.selectedJob.criticalWp === null || props.selectedJob.criticalWp === undefined ? 'Not observed' : props.selectedJob.criticalWp}</span>
              </div>}
          <button type="button" onClick={props.onOpenSelectedAnalysis}>Analyze Performance</button>
        </div>
      : <div className="rundeckSelectedCompact is-empty">Select a job or program to analyze.</div>}
    <div className="rundeckSelectedOperationalEvidence">
      {props.operationalEvidenceContent}
    </div>
  </div>
}

export default function RundeckMonitoringHistoryCore(props) {
  return <section className="rundeckMonitoring rundeckMonitoringV1234 rundeckMonitoringV1235">
    <section className="rundeckServerTrendBandV1234 rundeckServerTrendBandV1235">
      <div className="rundeckBandPaneV1234 rundeckBandPaneV1235 is-app-servers">
        <RundeckAppServers refreshToken={props.refreshToken} latestCollectionId={props.latestCollectionId} onInspectApp={props.onInspectApp} focusRequest={props.appFocusRequest || (props.selectedJob?.host ? { host: props.selectedJob.host, token: props.selectedJob.key || props.selectedJob.at || 'selected-workload', highlightOnly: true } : null)} />
        <SelectedWorkload
          selectedJob={props.selectedJob}
          operationalEvidenceContent={props.operationalEvidenceContent}
          onOpenSelectedAnalysis={props.onOpenSelectedAnalysis}
        />
      </div>
      <div className="rundeckBandPaneV1234 rundeckBandPaneV1235 is-server-trend">
        <RundeckServerTrend refreshToken={props.refreshToken} databaseEnabled={props.databaseEnabled} selectedJob={props.selectedJob} onSelectJob={props.onSelectJob} onTrendContext={props.onTrendContext} />
      </div>
    </section>
    <section className="rundeckWorkloadBandV1234 rundeckWorkloadBandV1235">
      <div className="rundeckBandPaneV1234 rundeckBandPaneV1235 is-current-workload">{props.currentWorkloadContent}</div>
      <div className="rundeckBandPaneV1234 rundeckBandPaneV1235 is-review-workload">{props.performanceReviewContent}</div>
    </section>
  </section>
}

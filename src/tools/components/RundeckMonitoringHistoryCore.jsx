import RundeckAppServers from './RundeckAppServers.jsx'
import RundeckServerTrend from './RundeckServerTrend.jsx'
import RundeckJobsProgramsWorkspace from './RundeckJobsProgramsWorkspace.jsx'

export default function RundeckMonitoringHistoryCore(props) {
  return <section className="rundeckMonitoring rundeckMonitoringV1234 rundeckMonitoringV1235 rundeckCockpitV13456">
    <section className="rundeckTopBandV13454">
      <div className="rundeckBandPaneV1234 rundeckBandPaneV1235 is-app-servers">
        <RundeckAppServers
          refreshToken={props.refreshToken}
          latestCollectionId={props.latestCollectionId}
          onInspectApp={props.onInspectApp}
          focusRequest={props.appFocusRequest || (props.selectedJob?.host ? { host: props.selectedJob.host, token: props.selectedJob.key || props.selectedJob.at || 'selected-workload', highlightOnly: true } : null)}
        />
      </div>
      <div className="rundeckBandPaneV1234 rundeckBandPaneV1235 is-infrastructure-overview">
        {props.infrastructureContent}
      </div>
    </section>

    <section className="rundeckTrendBandV13454">
      <RundeckServerTrend
        refreshToken={props.refreshToken}
        databaseEnabled={props.databaseEnabled}
        selectedJob={props.selectedJob}
        onSelectJob={props.onSelectJob}
        onTrendContext={props.onTrendContext}
        onOpenInfrastructure={props.onOpenTrendInfrastructure}
        onOpenEvidence={props.onOpenTrendEvidence}
      />
    </section>

    {props.operationalEvidenceContent && <section className="rundeckAnalysisRailV13456" aria-label="Analysis shortcuts">
      {props.operationalEvidenceContent}
    </section>}

    <RundeckJobsProgramsWorkspace
      currentContent={props.currentWorkloadContent}
      reviewContent={props.performanceReviewContent}
    />
  </section>
}

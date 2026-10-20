import RundeckUnifiedAppInfrastructure from './RundeckUnifiedAppInfrastructure.jsx'
import RundeckServerTrend from './RundeckServerTrend.jsx'
import RundeckWorkloadHealth from './RundeckWorkloadHealth.jsx'

export default function RundeckMonitoringHistoryCore(props) {
  return <section className="rundeckMonitoring rundeckMonitoringV1234 rundeckMonitoringV1235 rundeckCockpitV13456 rundeckCockpitV13490 rundeckCockpitV13491">
    <section className="rundeckTopBandV13454 is-unified-app-infra">
      <RundeckUnifiedAppInfrastructure
        hosts={props.sourceHosts || []}
        sourceQuality={props.sourceQuality}
        refreshToken={props.refreshToken}
        selectedJob={props.selectedJob}
        focusRequest={props.focusedAppHost ? { host: props.focusedAppHost, token: 'shared-app-' + props.focusedAppHost, highlightOnly: true } : (props.selectedJob?.host ? { host: props.selectedJob.host, token: props.selectedJob.key || props.selectedJob.at || 'selected-workload', highlightOnly: true } : props.appFocusRequest || null)}
        onInspectApp={props.onInspectApp}
        onSelectApp={props.onFocusAppHost}
        onOpenMetric={props.onOpenInfrastructureMetric}
        operationalChecks={props.operationalEvidenceContent}
      />
    </section>




    <section className="rundeckTrendBandV13454">
      <RundeckServerTrend
        refreshToken={props.refreshToken}
        databaseEnabled={props.databaseEnabled}
        selectedJob={props.selectedJob}
        focusedHost={props.focusedAppHost}
        onFocusHost={props.onFocusAppHost}
        sourceHosts={props.sourceHosts || []}
        onSelectJob={props.onSelectJob}
        onTrendContext={props.onTrendContext}
        onOpenInfrastructure={props.onOpenTrendInfrastructure}
        onOpenEvidence={props.onOpenTrendEvidence}
      />
    </section>

    <section className="rundeckJobsProgramsOverview" aria-label="Job & Program Evaluation">
      <div className="rundeckJobsProgramsHealthSide">
        <RundeckWorkloadHealth
          refreshToken={props.refreshToken}
          performanceVerified={props.sourceQuality?.performanceValid === true && !props.sourceQuality?.collectorBad}
          onSelectWorkload={props.onOpenEvaluatedWorkload}
          onReview={(category = 'REVIEW') => props.onOpenJobsPrograms?.('review', category)}
        />
      </div>
    </section>
  </section>
}

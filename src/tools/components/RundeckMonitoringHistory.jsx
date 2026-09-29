import React from 'react'
import RundeckInfrastructure from './RundeckInfrastructure.jsx'
import RundeckLiveOverview from './RundeckLiveOverview.jsx'
import RundeckMonitoringHistoryCore from './RundeckMonitoringHistoryCore.jsx'
import RundeckOperationalEvidence from './RundeckOperationalEvidence.jsx'
import RundeckObservationHistory from './RundeckObservationHistory.jsx'
import RundeckJobHistory from './RundeckJobHistory.jsx'
import RundeckWorkspaceDrawer from './RundeckWorkspaceDrawer.jsx'
import RundeckReviewQuickAnalysis from './RundeckReviewQuickAnalysis.jsx'
import RundeckPerformanceReview from './RundeckPerformanceReview.jsx'
import RundeckSapIssues from './RundeckSapIssues.jsx'
import RundeckSm37LivePortal from './RundeckSm37LivePortal.jsx'
import RundeckSystemHealth from './RundeckSystemHealth.jsx'
import RundeckWorkloadExplorer from './RundeckWorkloadExplorer.jsx'
import SphereIcon from './SphereIcon.jsx'
import './RundeckMonitoringHistory.css'
import './RundeckInvestigationFlow.css'

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
  const { onTrendContext, onSelectJob, refreshToken, selectedJob } = props
  const focusSequence = React.useRef(0)
  const [appFocusRequest, setAppFocusRequest] = React.useState(null)
  const [monitoringMode, setMonitoringMode] = React.useState('live')
  const [activeOverlay, setActiveOverlay] = React.useState(null)

  const forwardTrendContext = React.useCallback((context = {}) => {
    const selectedMetric = String(context.metric || '')
    onTrendContext?.({ ...context, metricLabel: metricLabelForTrend(selectedMetric, context.metricLabel || 'Metric') })
  }, [onTrendContext])

  const inspectJob = React.useCallback((job) => {
    if (!job?.key) return
    onSelectJob?.(job)
    setActiveOverlay({ type: 'job' })
  }, [onSelectJob])

  const openJobInLive = React.useCallback((job) => {
    if (!job?.key) return
    setMonitoringMode('live')
    onSelectJob?.(job)
    setActiveOverlay({ type: 'job' })
  }, [onSelectJob])

  const inspectApp = React.useCallback((context = {}) => {
    if (!context.host) return
    focusSequence.current += 1
    setAppFocusRequest({ ...context, token: focusSequence.current })
  }, [])

  const operationalEvidenceContent = <RundeckOperationalEvidence
    refreshToken={refreshToken}
    selectedJob={selectedJob}
    issuesContent={<RundeckSapIssues refreshToken={refreshToken} onInspectApp={inspectApp} />}
  />


  return <>
    <div className="rundeckMonitoringModeBar" aria-label="LOG Analysis mode">
      <div className="rundeckMonitoringModeTabs" role="tablist" aria-label="Monitoring mode">
        <button type="button" role="tab" aria-selected={monitoringMode === 'live'} className={monitoringMode === 'live' ? 'is-active' : ''} onClick={() => setMonitoringMode('live')}>Live Monitoring</button>
        <button type="button" role="tab" aria-selected={monitoringMode === 'explorer'} className={monitoringMode === 'explorer' ? 'is-active' : ''} onClick={() => setMonitoringMode('explorer')}>History</button>
      </div>
    </div>

    {monitoringMode === 'explorer'
      ? <RundeckWorkloadExplorer refreshToken={refreshToken} onOpenLiveJob={openJobInLive} />
      : <>
          <RundeckLiveOverview refreshToken={refreshToken} />
          <RundeckMonitoringHistoryCore
            {...props}
            onSelectJob={inspectJob}
            onTrendContext={forwardTrendContext}
            operationalEvidenceContent={operationalEvidenceContent}
            appFocusRequest={appFocusRequest}
            onOpenSelectedAnalysis={() => selectedJob?.key && setActiveOverlay({ type: 'job' })}
          />
          <RundeckSm37LivePortal selectedJob={selectedJob} refreshToken={refreshToken} />
          <RundeckSystemHealth refreshToken={refreshToken} />
          <section className="rundeckPerformanceReviewBand" aria-label="Jobs and programs to review">
            <RundeckPerformanceReview
              refreshToken={refreshToken}
              selectedJob={selectedJob}
              onSelectJob={inspectJob}
              incidentStart={props.incidentStart || ''}
              onOpenQuickAnalysis={(row, reviewContext) => setActiveOverlay({ type: 'review', row, reviewContext })}
              externalQuickKey={activeOverlay?.type === 'review' ? `${activeOverlay.row?.consumer_type}:${activeOverlay.row?.consumer_key}` : ''}
            />
          </section>
          <section className="rundeckCompactDetailRow" aria-label="Additional analysis">
            <button type="button" onClick={() => selectedJob?.key && setActiveOverlay({ type: 'history' })} disabled={!selectedJob?.key}>
              <SphereIcon name="history" />
              <span><b>Performance History</b><small>90-day saved performance history</small></span>
              <em>›</em>
            </button>
            <button type="button" onClick={() => setActiveOverlay({ type: 'infrastructure' })}>
              <SphereIcon name="server" />
              <span><b>Infrastructure Analysis</b><small>Filesystem · Network · Storage I/O</small></span>
              <em>›</em>
            </button>
          </section>

          {activeOverlay?.type === 'job' && selectedJob?.key && <RundeckWorkspaceDrawer
            title={selectedJob.key}
            subtitle="Job / Program Performance Analysis"
            onClose={() => setActiveOverlay(null)}
          >
            <RundeckJobHistory job={selectedJob} refreshToken={refreshToken} incidentStart={props.incidentStart} latestCollectionId={props.latestCollectionId} />
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'history' && selectedJob?.key && <RundeckWorkspaceDrawer
            title="Performance History"
            subtitle={selectedJob.key}
            onClose={() => setActiveOverlay(null)}
          >
            <RundeckObservationHistory job={selectedJob} refreshToken={refreshToken} onSelectJob={inspectJob} embedded />
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'infrastructure' && <RundeckWorkspaceDrawer
            title="Infrastructure Analysis"
            subtitle="Filesystem · Network · Storage I/O"
            onClose={() => setActiveOverlay(null)}
          >
            <RundeckInfrastructure incidentStart={props.incidentStart || ''} />
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'review' && activeOverlay.row && <RundeckReviewQuickAnalysis
            row={activeOverlay.row}
            reviewContext={activeOverlay.reviewContext}
            refreshToken={refreshToken}
            incidentStart={props.incidentStart || ''}
            onClose={() => setActiveOverlay(null)}
            onOpenFull={(job) => {
              onSelectJob?.(job)
              setActiveOverlay({ type: 'job' })
            }}
          />}
        </>}
  </>
}

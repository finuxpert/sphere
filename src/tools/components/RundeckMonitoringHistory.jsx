import React from 'react'
import RundeckInfrastructure from './RundeckInfrastructure.jsx'
import RundeckLiveOverview from './RundeckLiveOverview.jsx'
import RundeckMonitoringHistoryCore from './RundeckMonitoringHistoryCore.jsx'
import RundeckOperationalEvidence from './RundeckOperationalEvidence.jsx'
import RundeckAvailability from './RundeckAvailability.jsx'
import RundeckEvidenceTimeline from './RundeckEvidenceTimeline.jsx'
import RundeckObservationHistory from './RundeckObservationHistory.jsx'
import RundeckJobHistory from './RundeckJobHistory.jsx'
import RundeckWorkspaceDrawer from './RundeckWorkspaceDrawer.jsx'
import RundeckReviewQuickAnalysis from './RundeckReviewQuickAnalysis.jsx'
import RundeckAppServerAnalysis from './RundeckAppServerAnalysis.jsx'
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
  const { onTrendContext, onSelectJob, refreshToken, selectedJob, systemDataContent = null, systemDataSummary = '' } = props
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
    setActiveOverlay({ type: 'job', returnTo: { type: 'menu' } })
  }, [onSelectJob])

  const openJobInLive = React.useCallback((job) => {
    if (!job?.key) return
    setMonitoringMode('live')
    onSelectJob?.(job)
    setActiveOverlay({ type: 'job', returnTo: { type: 'menu' } })
  }, [onSelectJob])

  const inspectApp = React.useCallback((context = {}) => {
    if (!context.host) return
    focusSequence.current += 1
    setAppFocusRequest({ ...context, token: focusSequence.current, highlightOnly: true })
    setActiveOverlay({ type: 'app', app: context })
  }, [])

  const operationalEvidenceContent = <RundeckOperationalEvidence
    refreshToken={refreshToken}
    selectedJob={selectedJob}
    onOpenEvidence={(job) => setActiveOverlay({ type: 'evidence', job, returnTo: { type: 'menu' } })}
    onOpenAvailability={() => setActiveOverlay({ type: 'availability', returnTo: { type: 'menu' } })}
    onOpenIssues={() => setActiveOverlay({ type: 'issues', returnTo: { type: 'menu' } })}
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
            onOpenSelectedAnalysis={() => selectedJob?.key && setActiveOverlay({ type: 'job', returnTo: { type: 'menu' } })}
            onInspectApp={inspectApp}
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
            <button type="button" onClick={() => selectedJob?.key && setActiveOverlay({ type: 'history', returnTo: { type: 'menu' } })} disabled={!selectedJob?.key}>
              <SphereIcon name="history" />
              <span><b>Performance History</b><small>90-day saved performance history</small></span>
              <em>›</em>
            </button>
            <button type="button" onClick={() => setActiveOverlay({ type: 'infrastructure', returnTo: { type: 'menu' } })}>
              <SphereIcon name="server" />
              <span><b>Infrastructure Analysis</b><small>Filesystem · Network · Storage I/O</small></span>
              <em>›</em>
            </button>
            {systemDataContent && <button type="button" onClick={() => setActiveOverlay({ type: 'system-data', returnTo: { type: 'menu' } })}>
              <SphereIcon name="database" />
              <span><b>System Data</b><small>{systemDataSummary || 'Collections · SPHERE Services'}</small></span>
              <em>›</em>
            </button>}
          </section>

          {activeOverlay?.type === 'menu' && <RundeckWorkspaceDrawer
            title="Analysis Menu"
            subtitle={selectedJob?.key ? selectedJob.key : 'Performance Analysis'}
            onClose={() => setActiveOverlay(null)}
          >
            <section className="rundeckDrawerAnalysisMenu" aria-label="Analysis options">
              <button type="button" onClick={() => selectedJob?.key && setActiveOverlay({ type: 'job', returnTo: { type: 'menu' } })} disabled={!selectedJob?.key}>
                <SphereIcon name="trend" />
                <span><b>Job / Program Performance</b><small>{selectedJob?.key || 'Select a job or program first'}</small></span>
                <em>›</em>
              </button>
              <button type="button" onClick={() => selectedJob?.key && setActiveOverlay({ type: 'history', returnTo: { type: 'menu' } })} disabled={!selectedJob?.key}>
                <SphereIcon name="history" />
                <span><b>Performance History</b><small>90-day saved performance history</small></span>
                <em>›</em>
              </button>
              <button type="button" onClick={() => setActiveOverlay({ type: 'infrastructure', returnTo: { type: 'menu' } })}>
                <SphereIcon name="server" />
                <span><b>Infrastructure Analysis</b><small>Filesystem · Network · Storage I/O</small></span>
                <em>›</em>
              </button>
              <button type="button" onClick={() => setActiveOverlay({ type: 'evidence', job: selectedJob, returnTo: { type: 'menu' } })}>
                <SphereIcon name="history" />
                <span><b>Correlated Events</b><small>Operational evidence and timing correlation</small></span>
                <em>›</em>
              </button>
              <button type="button" onClick={() => setActiveOverlay({ type: 'availability', returnTo: { type: 'menu' } })}>
                <SphereIcon name="server" />
                <span><b>SAP Availability</b><small>SAP App · HANA · Web · Technical Checks</small></span>
                <em>›</em>
              </button>
              <button type="button" onClick={() => setActiveOverlay({ type: 'issues', returnTo: { type: 'menu' } })}>
                <SphereIcon name="alert" />
                <span><b>SAP Issues</b><small>Active SAP operational issues</small></span>
                <em>›</em>
              </button>
              {systemDataContent && <button type="button" onClick={() => setActiveOverlay({ type: 'system-data', returnTo: { type: 'menu' } })}>
                <SphereIcon name="database" />
                <span><b>System Data</b><small>{systemDataSummary || 'Collections · SPHERE Services'}</small></span>
                <em>›</em>
              </button>}
            </section>
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'job' && selectedJob?.key && <RundeckWorkspaceDrawer
            title={selectedJob.key}
            subtitle="Job / Program Performance Analysis"
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => setActiveOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'app'
              ? `Back to ${activeOverlay.returnTo.app?.host ? activeOverlay.returnTo.app.host.split('.').shift() : 'APP Server'}`
              : activeOverlay.returnTo?.type === 'review'
                ? 'Back to Review'
                : activeOverlay.returnTo?.type === 'history'
                  ? 'Back to Performance History'
                  : activeOverlay.returnTo?.type === 'menu'
                    ? 'Back to Analysis Menu'
                    : 'Back'}
          >
            <RundeckJobHistory job={selectedJob} refreshToken={refreshToken} incidentStart={props.incidentStart} latestCollectionId={props.latestCollectionId} presentation="drawer" />
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'history' && selectedJob?.key && <RundeckWorkspaceDrawer
            title="Performance History"
            subtitle={selectedJob.key}
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => setActiveOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'menu' ? 'Back to Analysis Menu' : 'Back'}
          >
            <RundeckObservationHistory
              job={selectedJob}
              refreshToken={refreshToken}
              onSelectJob={(job) => {
                if (!job?.key) return
                onSelectJob?.(job)
                setActiveOverlay({ type: 'job', returnTo: activeOverlay })
              }}
              embedded
            />
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'system-data' && systemDataContent && <RundeckWorkspaceDrawer
            title="System Data"
            subtitle={systemDataSummary || 'Collection History · SPHERE Services'}
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => setActiveOverlay(activeOverlay.returnTo) : null}
            backLabel="Back to Analysis Menu"
          >
            {systemDataContent}
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'evidence' && <RundeckWorkspaceDrawer
            title="Correlated Events"
            subtitle="Operational evidence and timing correlation"
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => setActiveOverlay(activeOverlay.returnTo) : null}
            backLabel="Back to Analysis Menu"
          >
            <RundeckEvidenceTimeline
              refreshToken={refreshToken}
              job={activeOverlay.job || selectedJob}
              incidentActive
            />
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'availability' && <RundeckWorkspaceDrawer
            title="SAP Availability"
            subtitle="SAP App · HANA · Web · Technical Checks"
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => setActiveOverlay(activeOverlay.returnTo) : null}
            backLabel="Back to Analysis Menu"
          >
            <RundeckAvailability refreshToken={refreshToken} />
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'issues' && <RundeckWorkspaceDrawer
            title="SAP Issues"
            subtitle="Active SAP issues"
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => setActiveOverlay(activeOverlay.returnTo) : null}
            backLabel="Back to Analysis Menu"
          >
            <RundeckSapIssues
              refreshToken={refreshToken}
              onInspectApp={(context) => {
                if (!context?.host) return
                focusSequence.current += 1
                setAppFocusRequest({ ...context, token: focusSequence.current, highlightOnly: true })
                setActiveOverlay({ type: 'app', app: context, returnTo: { type: 'issues', returnTo: { type: 'menu' } } })
              }}
            />
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'app' && activeOverlay.app && <RundeckWorkspaceDrawer
            title={activeOverlay.app.host ? activeOverlay.app.host.split('.').shift() : 'APP Server'}
            subtitle="SAP App Server Analysis"
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => setActiveOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'issues' ? 'Back to SAP Issues' : 'Back'}
          >
            <RundeckAppServerAnalysis
              app={activeOverlay.app}
              latestCollectionId={props.latestCollectionId}
              refreshToken={refreshToken}
              onSelectJob={(job) => {
                onSelectJob?.(job)
                setActiveOverlay({ type: 'job', returnTo: { type: 'app', app: activeOverlay.app, returnTo: activeOverlay.returnTo || null } })
              }}
            />
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'infrastructure' && <RundeckWorkspaceDrawer
            title="Infrastructure Analysis"
            subtitle="Filesystem · Network · Storage I/O"
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => setActiveOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'menu' ? 'Back to Analysis Menu' : 'Back'}
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
              setActiveOverlay({
                type: 'job',
                returnTo: { type: 'review', row: activeOverlay.row, reviewContext: activeOverlay.reviewContext },
              })
            }}
          />}
        </>}
  </>
}

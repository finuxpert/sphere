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
import SphereIcon from './SphereIcon.jsx'
import { formatWib, shortHost } from './sapUiFormat.js'
import './RundeckMonitoringHistory.css'
import './RundeckInvestigationFlow.css'

const metricLabelForTrend = (metric, fallback = 'Metric') => {
  if (metric === 'cpu') return 'CPU'
  if (metric === 'ram') return 'RAM'
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
  const [activeOverlay, setActiveOverlay] = React.useState(null)

  const returnFromOverlay = React.useCallback((target) => {
    setActiveOverlay(!target || target.type === 'selected' ? null : target)
  }, [])

  const forwardTrendContext = React.useCallback((context = {}) => {
    const selectedMetric = String(context.metric || '')
    onTrendContext?.({ ...context, metricLabel: metricLabelForTrend(selectedMetric, context.metricLabel || 'Metric') })
  }, [onTrendContext])

  const inspectJob = React.useCallback((job) => {
    if (!job?.key) return
    onSelectJob?.(job)
    setActiveOverlay({ type: 'job' })
  }, [onSelectJob])

  const inspectApp = React.useCallback((context = {}) => {
    if (!context.host) return
    focusSequence.current += 1
    setAppFocusRequest({ ...context, token: focusSequence.current, highlightOnly: true })
    setActiveOverlay({ type: 'app', app: context })
  }, [])

  const selectedContextTime = selectedJob?.at
    ? `${formatWib(selectedJob.at, true)} WIB`
    : selectedJob?.reviewPeriod
      ? String(selectedJob.reviewPeriod).toUpperCase()
      : props.latestCollectionAt
        ? `${formatWib(props.latestCollectionAt, true)} WIB`
        : ''
  const operationalEvidenceContent = <>
    {selectedJob?.key && <div className="rundeckAnalysisContextStrip" title="Current workload used by the analysis shortcuts">
      <strong>{selectedJob.key}</strong>
      {selectedJob.host && <span>{shortHost(selectedJob.host)}</span>}
      {selectedContextTime && <span>{selectedContextTime}</span>}
    </div>}
    <RundeckOperationalEvidence
      refreshToken={refreshToken}
      selectedJob={selectedJob}
      onOpenEvidence={(job) => setActiveOverlay({ type: 'evidence', job, returnTo: { type: 'selected' } })}
      onOpenAvailability={() => setActiveOverlay({ type: 'availability', returnTo: { type: 'selected' } })}
      onOpenIssues={() => setActiveOverlay({ type: 'issues', returnTo: { type: 'selected' } })}
    />
    <section className="rundeckSelectedSecondaryAnalysis" aria-label="Additional analysis">
      <button type="button" onClick={() => selectedJob?.key && setActiveOverlay({ type: 'history', returnTo: { type: 'selected' } })} disabled={!selectedJob?.key}>
        <SphereIcon name="history" />
        <span><b>Observation History</b><small>{selectedJob?.host ? `${selectedJob?.reviewMetrics?.observations ?? 'Saved'} observations · ${shortHost(selectedJob.host)}` : 'Select a workload first'}</small></span>
        <em>›</em>
      </button>
      <RundeckInfrastructure
        refreshToken={refreshToken}
        compact
        onOpen={() => setActiveOverlay({ type: 'infrastructure', returnTo: { type: 'selected' } })}
      />
      {systemDataContent && <button type="button" onClick={() => setActiveOverlay({ type: 'system-data', returnTo: { type: 'selected' } })}>
        <SphereIcon name="database" />
        <span><b>System Data</b><small>{systemDataSummary ? systemDataSummary.replace(/(\d+ runs).*?(\d+ failed).*/, '$1 · $2') : 'Collections · Services'}</small></span>
        <em>›</em>
      </button>}
    </section>
  </>


  const currentWorkloadContent = React.isValidElement(props.currentWorkloadContent)
    ? React.cloneElement(props.currentWorkloadContent, { onSelectJob: inspectJob })
    : props.currentWorkloadContent

  const performanceReviewContent = <RundeckPerformanceReview
    refreshToken={refreshToken}
    selectedJob={selectedJob}
    onSelectJob={inspectJob}
    incidentStart={props.incidentStart || ''}
    onOpenQuickAnalysis={(row, reviewContext) => {
      const reviewJob = {
        key: row.consumer_key,
        host: row?.hosts?.length === 1 ? row.hosts[0] : '',
        consumerType: row.consumer_type,
        source: 'performance-review',
        days: reviewContext?.days || 1,
        reviewPeriod: reviewContext?.period || '1d',
        reviewMetrics: {
          avgCpuPct: row.avg_cpu_pct ?? null,
          peakCpuPct: row.peak_cpu_pct ?? null,
          avgPssGb: row.avg_pss_gb ?? null,
          avgProcesses: row.avg_process_count ?? null,
          observations: row.observations ?? row.occurrences ?? null,
          criticalWpChecks: row.critical_wp_host_checks ?? row.critical_wp_checks ?? null,
          hostObservations: row.host_observations ?? null,
        },
      }
      onSelectJob?.(reviewJob)
      setActiveOverlay({ type: 'job', reviewRow: row, reviewContext })
    }}
    externalQuickKey={activeOverlay?.type === 'review' ? `${activeOverlay.row?.consumer_type}:${activeOverlay.row?.consumer_key}` : ''}
  />

  return <>
    <RundeckMonitoringHistoryCore
            {...props}
            currentWorkloadContent={currentWorkloadContent}
            onSelectJob={inspectJob}
            onTrendContext={forwardTrendContext}
            infrastructureContent={<RundeckLiveOverview refreshToken={refreshToken} embedded onOpenMetric={(context) => setActiveOverlay({ type: 'infrastructure', infraContext: context, returnTo: { type: 'selected' } })} />}
            operationalEvidenceContent={operationalEvidenceContent}
            performanceReviewContent={performanceReviewContent}
            appFocusRequest={appFocusRequest}
            onOpenSelectedAnalysis={() => selectedJob?.key && setActiveOverlay({ type: 'job' })}
            onOpenTrendInfrastructure={(context) => setActiveOverlay({ type: 'infrastructure', trendContext: context, returnTo: { type: 'selected' } })}
            onOpenTrendEvidence={(job) => setActiveOverlay({ type: 'evidence', job, returnTo: { type: 'selected' } })}
            onInspectApp={inspectApp}
          />
          <RundeckSm37LivePortal selectedJob={selectedJob} refreshToken={refreshToken} />
          <RundeckSystemHealth refreshToken={refreshToken} />

          {activeOverlay?.type === 'menu' && <RundeckWorkspaceDrawer
            title="Analysis Menu"
            size="menu"
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
                <span><b>Observation History</b><small>Saved runs and observation records</small></span>
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
            size="performance"
            actions={activeOverlay.reviewRow ? <button type="button" onClick={() => setActiveOverlay({
              type: 'review',
              row: activeOverlay.reviewRow,
              reviewContext: activeOverlay.reviewContext,
              returnToJob: true,
            })}>Review Result</button> : null}
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => returnFromOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'app'
              ? `Back to ${activeOverlay.returnTo.app?.host ? activeOverlay.returnTo.app.host.split('.').shift() : 'APP Server'}`
              : activeOverlay.returnTo?.type === 'review'
                ? 'Back to Review'
                : activeOverlay.returnTo?.type === 'history'
                  ? 'Back to Observation History'
                  : activeOverlay.returnTo?.type === 'menu'
                    ? 'Back to Analysis Menu'
                    : 'Back'}
          >
            <RundeckJobHistory job={selectedJob} refreshToken={refreshToken} incidentStart={props.incidentStart} latestCollectionId={props.latestCollectionId} presentation="drawer" />
            <div className="rundeckPerformanceDrawerEvidence" aria-label="Related operational analysis">
              <RundeckOperationalEvidence
                refreshToken={refreshToken}
                selectedJob={selectedJob}
                onOpenEvidence={(job) => setActiveOverlay({
                  type: 'evidence',
                  job,
                  returnTo: { type: 'job', returnTo: activeOverlay.returnTo || null },
                })}
                onOpenAvailability={() => setActiveOverlay({
                  type: 'availability',
                  returnTo: { type: 'job', returnTo: activeOverlay.returnTo || null },
                })}
                onOpenIssues={() => setActiveOverlay({
                  type: 'issues',
                  returnTo: { type: 'job', returnTo: activeOverlay.returnTo || null },
                })}
              />
            </div>
            <section className="rundeckPerformanceDrawerActions" aria-label="More analysis">
              <button type="button" onClick={() => setActiveOverlay({ type: 'history', returnTo: { type: 'job', returnTo: activeOverlay.returnTo || null } })}><SphereIcon name="history" /><span><b>Observation History</b><small>Saved observations</small></span></button>
              <button type="button" onClick={() => setActiveOverlay({ type: 'infrastructure', returnTo: { type: 'job', returnTo: activeOverlay.returnTo || null } })}><SphereIcon name="server" /><span><b>Infrastructure Analysis</b><small>Filesystem · Network · Storage</small></span></button>
              {systemDataContent && <button type="button" onClick={() => setActiveOverlay({ type: 'system-data', returnTo: { type: 'job', returnTo: activeOverlay.returnTo || null } })}><SphereIcon name="database" /><span><b>System Data</b><small>{systemDataSummary || 'Collections · Services'}</small></span></button>}
            </section>
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'history' && selectedJob?.key && <RundeckWorkspaceDrawer
            title="Observation History"
            size="observation-history"
            subtitle={selectedJob.key}
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => returnFromOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'selected' ? 'Back to SAP Performance' : activeOverlay.returnTo?.type === 'menu' ? 'Back to Analysis Menu' : 'Back'}
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
            size="system-data"
            subtitle={systemDataSummary || 'Collection History · SPHERE Services'}
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => returnFromOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'selected' ? 'Back to SAP Performance' : 'Back to Analysis Menu'}
          >
            {systemDataContent}
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'evidence' && <RundeckWorkspaceDrawer
            title="Correlated Events"
            size="evidence"
            subtitle="Operational evidence and timing correlation"
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => returnFromOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'job' ? 'Back to Performance Analysis' : activeOverlay.returnTo?.type === 'selected' ? 'Back to SAP Performance' : 'Back to Analysis Menu'}
          >
            <RundeckEvidenceTimeline
              refreshToken={refreshToken}
              job={activeOverlay.job || selectedJob}
              incidentActive
            />
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'availability' && <RundeckWorkspaceDrawer
            title="SAP Availability"
            size="availability"
            subtitle="SAP App · HANA · Web · Technical Checks"
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => returnFromOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'job' ? 'Back to Performance Analysis' : activeOverlay.returnTo?.type === 'selected' ? 'Back to SAP Performance' : 'Back to Analysis Menu'}
          >
            <RundeckAvailability refreshToken={refreshToken} />
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'issues' && <RundeckWorkspaceDrawer
            title="SAP Issues"
            size="issues"
            subtitle="Active SAP issues"
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => returnFromOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'job' ? 'Back to Performance Analysis' : activeOverlay.returnTo?.type === 'selected' ? 'Back to SAP Performance' : 'Back to Analysis Menu'}
          >
            <RundeckSapIssues
              refreshToken={refreshToken}
              onInspectApp={(context) => {
                if (!context?.host) return
                focusSequence.current += 1
                setAppFocusRequest({ ...context, token: focusSequence.current, highlightOnly: true })
                setActiveOverlay({ type: 'app', app: context, returnTo: { type: 'issues', returnTo: activeOverlay.returnTo || null } })
              }}
            />
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'app' && activeOverlay.app && <RundeckWorkspaceDrawer
            title={activeOverlay.app.host ? activeOverlay.app.host.split('.').shift() : 'APP Server'}
            subtitle="SAP App Server Analysis"
            size="app-detail"
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => returnFromOverlay(activeOverlay.returnTo) : null}
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
            size="wide"
            subtitle="Filesystem · Network · Storage I/O"
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => returnFromOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'selected' ? 'Back to SAP Performance' : activeOverlay.returnTo?.type === 'menu' ? 'Back to Analysis Menu' : 'Back'}
          >
            <RundeckInfrastructure incidentStart={props.incidentStart || ''} initialContext={activeOverlay.infraContext || activeOverlay.trendContext || null} />
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'review' && activeOverlay.row && <RundeckReviewQuickAnalysis
            row={activeOverlay.row}
            reviewContext={activeOverlay.reviewContext}
            refreshToken={refreshToken}
            incidentStart={props.incidentStart || ''}
            onClose={() => {
              if (activeOverlay.returnToJob) {
                const reviewJob = {
                  key: activeOverlay.row.consumer_key,
                  host: activeOverlay.row?.hosts?.length === 1 ? activeOverlay.row.hosts[0] : '',
                  consumerType: activeOverlay.row.consumer_type,
                  source: 'performance-review',
                  days: activeOverlay.reviewContext?.days || 1,
                  reviewPeriod: activeOverlay.reviewContext?.period || '1d',
                  reviewMetrics: {
                    avgCpuPct: activeOverlay.row.avg_cpu_pct ?? null,
                    peakCpuPct: activeOverlay.row.peak_cpu_pct ?? null,
                    avgPssGb: activeOverlay.row.avg_pss_gb ?? null,
                    avgProcesses: activeOverlay.row.avg_process_count ?? null,
                    observations: activeOverlay.row.observations ?? activeOverlay.row.occurrences ?? null,
                    criticalWpChecks: activeOverlay.row.critical_wp_host_checks ?? activeOverlay.row.critical_wp_checks ?? null,
                    hostObservations: activeOverlay.row.host_observations ?? null,
                  },
                }
                onSelectJob?.(reviewJob)
                setActiveOverlay({ type: 'job', reviewRow: activeOverlay.row, reviewContext: activeOverlay.reviewContext })
                return
              }
              setActiveOverlay(null)
            }}
            onOpenFull={(job) => {
              onSelectJob?.(job)
              setActiveOverlay({ type: 'job', reviewRow: activeOverlay.row, reviewContext: activeOverlay.reviewContext })
            }}
          />}
  </>
}

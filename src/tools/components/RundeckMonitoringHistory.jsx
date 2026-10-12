import React from 'react'
import RundeckMonitoringHistoryCore from './RundeckMonitoringHistoryCore.jsx'
import RundeckOperationalEvidence from './RundeckOperationalEvidence.jsx'
import RundeckAvailability from './RundeckAvailability.jsx'
import RundeckEvidenceTimeline from './RundeckEvidenceTimeline.jsx'
import RundeckObservationHistory from './RundeckObservationHistory.jsx'
import RundeckJobHistory from './RundeckJobHistory.jsx'
import RundeckWorkspaceDrawer from './RundeckWorkspaceDrawer.jsx'
import SphereAnalysisWorkspace from './SphereAnalysisWorkspace.jsx'
import RundeckReviewQuickAnalysis from './RundeckReviewQuickAnalysis.jsx'
import RundeckPerformanceReview from './RundeckPerformanceReview.jsx'
import RundeckSapIssues from './RundeckSapIssues.jsx'
import RundeckSm37LivePortal from './RundeckSm37LivePortal.jsx'
import RundeckSystemHealth from './RundeckSystemHealth.jsx'
import SphereIcon from './SphereIcon.jsx'
import { formatWib, shortHost } from './sapUiFormat.js'
import './RundeckMonitoringHistory.css'
import './RundeckInvestigationFlow.css'
import './RundeckOperatorMotion.css'
import './RundeckCockpitPolish.css'
import './RundeckCloudflareMotion.css'
import './RundeckCloudflareLight.css'
import './RundeckUnifiedModalPolish.css'
import './RundeckFlatWorkspace.css'
import './RundeckMockupParity.css'

const RundeckInfrastructure = React.lazy(() => import('./RundeckInfrastructure.jsx'))
const RundeckUnifiedAppAnalysis = React.lazy(() => import('./RundeckUnifiedAppAnalysis.jsx'))

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
  const [manualAppFocus, setManualAppFocus] = React.useState({ contextHost: '', host: null })
  const selectedHostKey = selectedJob?.host || ''
  const trendFocusedHost = manualAppFocus.contextHost === selectedHostKey && manualAppFocus.host !== null
    ? manualAppFocus.host : selectedHostKey
  const chooseAppFocus = React.useCallback((host) => {
    setManualAppFocus({ contextHost: selectedHostKey, host })
  }, [selectedHostKey])

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
    setManualAppFocus({ contextHost: '', host: null })
    setActiveOverlay({ type: 'job' })
  }, [onSelectJob])

  const inspectApp = React.useCallback((context = {}) => {
    if (!context.host) return
    focusSequence.current += 1
    chooseAppFocus(shortHost(context.host))
    setAppFocusRequest({ ...context, token: focusSequence.current, highlightOnly: true })
    setActiveOverlay({ type: 'app', app: context })
  }, [chooseAppFocus])

  const focusedOperationalHost = selectedJob?.host
    ? (props.sourceHosts?.find(row => shortHost(row.host) === shortHost(selectedJob.host)) || null)
    : (props.sourceHosts?.[0] || null)

  const selectedContextTime = selectedJob?.at
    ? `${formatWib(selectedJob.at, true)} WIB`
    : selectedJob?.reviewPeriod
      ? String(selectedJob.reviewPeriod).toUpperCase()
      : props.latestCollectionAt
        ? `${formatWib(props.latestCollectionAt, true)} WIB`
        : ''
  const relatedAnalysisNav = (current) => {
    const pairs = current === 'evidence' || current === 'history'
      ? [['evidence', 'Correlated Events'], ['history', 'Observation History']]
      : [['availability', 'SAP Availability'], ['issues', 'SAP Issues']]
    return <nav className="rundeckAnalysisRelatedNav" role="group" aria-label="Related analysis">
      {pairs.map(([type, label]) => <button key={type} type="button"
        aria-pressed={current === type}
        disabled={type === 'history' && !selectedJob?.key}
        onClick={() => setActiveOverlay({ ...activeOverlay, type })}>{label}</button>)}
    </nav>
  }

  const operationalEvidenceContent = <RundeckOperationalEvidence
    refreshToken={refreshToken}
    selectedJob={selectedJob}
    onOpenEvidence={(job) => setActiveOverlay({ type: 'evidence', job, returnTo: { type: 'selected' } })}
    onOpenAvailability={() => setActiveOverlay({ type: 'availability', returnTo: { type: 'selected' } })}
    onOpenIssues={() => setActiveOverlay({ type: 'issues', returnTo: { type: 'selected' } })}
    onOpenHistory={() => selectedJob?.key && setActiveOverlay({ type: 'history', returnTo: { type: 'selected' } })}
    onOpenInfrastructure={() => setActiveOverlay({ type: 'infrastructure', returnTo: { type: 'selected' } })}
    onOpenSystemData={systemDataContent ? () => setActiveOverlay({ type: 'system-data', returnTo: { type: 'selected' } }) : null}
    systemDataSummary={systemDataSummary.replace(/(\d+ runs).*?(\d+ failed).*/, '$1 · $2')}
    infrastructureLabel={focusedOperationalHost ? `Selected SAP ${shortHost(focusedOperationalHost.host)} · Infra source separate` : 'Select a host in Infrastructure'}
  />

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
      setActiveOverlay({ type: 'job', reviewRow: row, reviewContext, returnTo: { type: 'workloads' } })
    }}
    externalQuickKey={activeOverlay?.type === 'review' ? `${activeOverlay.row?.consumer_type}:${activeOverlay.row?.consumer_key}` : ''}
  />


  // Route only existing analysis components. A selected APP/job retains its
  // source identity; cross-workspace navigation never fabricates observations.
  const navigateWorkspace = (next) => {
    if (next === 'system-data' && !systemDataContent) return
    setActiveOverlay({
      type: next,
      returnTo: { type: 'selected' },
      ...(next === 'evidence' && selectedJob?.key ? { job: selectedJob } : {}),
    })
  }
  const workspaceProps = {
    current: activeOverlay?.type,
    onNavigate: navigateWorkspace,
    hasSelectedJob: Boolean(selectedJob?.key),
    hasSystemData: Boolean(systemDataContent),
  }

  return <>
    <RundeckMonitoringHistoryCore
            {...props}
            currentWorkloadContent={currentWorkloadContent}
            onSelectJob={inspectJob}
            focusedAppHost={trendFocusedHost}
            onFocusAppHost={chooseAppFocus}
            onTrendContext={forwardTrendContext}
            onOpenInfrastructureMetric={(context) => setActiveOverlay({ type: 'infrastructure', infraContext: context, returnTo: { type: 'selected' } })}
            operationalEvidenceContent={operationalEvidenceContent}
            performanceReviewContent={performanceReviewContent}
            appFocusRequest={appFocusRequest}
            onOpenSelectedAnalysis={() => selectedJob?.key && setActiveOverlay({ type: 'job' })}
            onOpenTrendInfrastructure={(context) => setActiveOverlay({ type: 'infrastructure', trendContext: context, returnTo: { type: 'selected' } })}
            onOpenTrendEvidence={(job) => setActiveOverlay({ type: 'evidence', job, returnTo: { type: 'selected' } })}
            onInspectApp={inspectApp}
          />
          <RundeckSm37LivePortal selectedJob={selectedJob} refreshToken={refreshToken} />
          <RundeckSystemHealth sourceQuality={props.sourceQuality} sourceCollector={props.sourceCollector} sourceHosts={props.sourceHosts} sourceAvailability={props.sourceAvailability} />

          {activeOverlay?.type === 'workloads' && <SphereAnalysisWorkspace
            {...workspaceProps}
            title="Jobs & Programs Review"
            subtitle="Review saved workload findings and search historical jobs / programs"
            size="performance"
            onClose={() => setActiveOverlay(null)}
            onBack={() => setActiveOverlay(null)}
            backLabel="Back to SAP Performance"
          >
            {React.cloneElement(performanceReviewContent, { sidecar: true })}
          </SphereAnalysisWorkspace>}

          {activeOverlay?.type === 'job' && selectedJob?.key && <SphereAnalysisWorkspace {...workspaceProps}
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
              : activeOverlay.returnTo?.type === 'workloads' || activeOverlay.returnTo?.type === 'review'
                ? 'Back to Review'
                : activeOverlay.returnTo?.type === 'history'
                  ? 'Back to Observation History'
                  : 'Back'}
          >
            <RundeckJobHistory job={selectedJob} refreshToken={refreshToken} incidentStart={props.incidentStart} latestCollectionId={props.latestCollectionId} presentation="drawer" />

            <nav className="rundeckJobRelatedAnalysis" role="group" aria-label="Related analysis">
              <strong>Related Analysis</strong>
              <div className="rundeckJobRelatedLinks">
                <button type="button" onClick={() => setActiveOverlay({ type: 'evidence', job: selectedJob, returnTo: { type: 'job', returnTo: activeOverlay.returnTo || null } })}><SphereIcon name="history" />Correlated Events</button>
                <button type="button" onClick={() => setActiveOverlay({ type: 'history', returnTo: { type: 'job', returnTo: activeOverlay.returnTo || null } })}><SphereIcon name="history" />Observation History</button>
                <button type="button" onClick={() => setActiveOverlay({ type: 'infrastructure', returnTo: { type: 'job', returnTo: activeOverlay.returnTo || null } })}><SphereIcon name="server" />Infrastructure</button>
                <button type="button" onClick={() => setActiveOverlay({ type: 'issues', returnTo: { type: 'job', returnTo: activeOverlay.returnTo || null } })}><SphereIcon name="activity" />SAP Issues</button>
                <button type="button" onClick={() => setActiveOverlay({ type: 'availability', returnTo: { type: 'job', returnTo: activeOverlay.returnTo || null } })}><SphereIcon name="server" />SAP Availability</button>
                {systemDataContent && <button type="button" onClick={() => setActiveOverlay({ type: 'system-data', returnTo: { type: 'job', returnTo: activeOverlay.returnTo || null } })}><SphereIcon name="database" />System Data</button>}
              </div>
            </nav>
          </SphereAnalysisWorkspace>}

          {activeOverlay?.type === 'history' && selectedJob?.key && <SphereAnalysisWorkspace {...workspaceProps}
            title="Observation History"
            size="observation-history"
            navigation={relatedAnalysisNav('history')}
            subtitle={selectedJob.key}
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => returnFromOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'job' ? 'Back to Performance Analysis' : activeOverlay.returnTo?.type === 'selected' ? 'Back to SAP Performance' : 'Back'}
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
          </SphereAnalysisWorkspace>}

          {activeOverlay?.type === 'system-data' && systemDataContent && <SphereAnalysisWorkspace {...workspaceProps}
            title="System Data"
            size="system-data"
            subtitle={systemDataSummary || 'Collection History · SPHERE Services'}
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => returnFromOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'job' ? 'Back to Performance Analysis' : activeOverlay.returnTo?.type === 'selected' ? 'Back to SAP Performance' : 'Back'}
          >
            {React.isValidElement(systemDataContent)
              ? React.cloneElement(systemDataContent, {
                  onOpenPdf: systemDataContent.props.onOpenPdf
                    ? () => { setActiveOverlay(null); systemDataContent.props.onOpenPdf() }
                    : null,
                })
              : systemDataContent}
          </SphereAnalysisWorkspace>}

          {activeOverlay?.type === 'evidence' && <SphereAnalysisWorkspace {...workspaceProps}
            title="Correlated Events"
            size="evidence"
            navigation={relatedAnalysisNav('evidence')}
            subtitle={selectedJob?.key ? `${selectedJob.key} · ${selectedJob.host ? shortHost(selectedJob.host) + ' · ' : ''}${selectedContextTime}` : 'Operational evidence and timing correlation'}
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => returnFromOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'job' ? 'Back to Performance Analysis' : activeOverlay.returnTo?.type === 'selected' ? 'Back to SAP Performance' : 'Back'}
          >
            <RundeckEvidenceTimeline
              refreshToken={refreshToken}
              job={activeOverlay.job || selectedJob}
              incidentActive
            />
          </SphereAnalysisWorkspace>}

          {activeOverlay?.type === 'availability' && <SphereAnalysisWorkspace {...workspaceProps}
            title="SAP Availability"
            size="availability"
            navigation={relatedAnalysisNav('availability')}
            subtitle="SAP App · HANA · Web · Technical Checks"
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => returnFromOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'job' ? 'Back to Performance Analysis' : activeOverlay.returnTo?.type === 'selected' ? 'Back to SAP Performance' : 'Back'}
          >
            <RundeckAvailability refreshToken={refreshToken} />
          </SphereAnalysisWorkspace>}

          {activeOverlay?.type === 'issues' && <SphereAnalysisWorkspace {...workspaceProps}
            title="SAP Issues"
            size="issues"
            navigation={relatedAnalysisNav('issues')}
            subtitle="Active SAP issues"
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => returnFromOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'job' ? 'Back to Performance Analysis' : activeOverlay.returnTo?.type === 'selected' ? 'Back to SAP Performance' : 'Back'}
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
          </SphereAnalysisWorkspace>}

          {activeOverlay?.type === 'app' && activeOverlay.app && <RundeckWorkspaceDrawer
            title={activeOverlay.app.host ? shortHost(activeOverlay.app.host) + ' Analysis' : 'APP Analysis'}
            subtitle={`${activeOverlay.app.host || 'UNKNOWN host'} · SAP ${props.sourceQuality?.performanceValid && !props.sourceQuality?.collectorBad ? (props.latestCollectionAt ? formatWib(props.latestCollectionAt, true) + ' WIB' : 'sample time UNKNOWN') : 'UNVERIFIED'} · Infrastructure checked separately`}
            size="unified-app"
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => returnFromOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'issues' ? 'Back to SAP Issues' : 'Back'}
          >
            <React.Suspense fallback={<div className="rundeckAnalysisLoading" role="status">Loading APP analysis…</div>}>
            <RundeckUnifiedAppAnalysis
              app={activeOverlay.app}
              latestCollectionId={props.latestCollectionId}
              performanceVerified={props.sourceQuality?.performanceValid === true && !props.sourceQuality?.collectorBad}
              performanceCollectedAt={props.latestCollectionAt || ''}
              incidentStart={props.incidentStart || ''}
              refreshToken={refreshToken}
              onSelectJob={(job) => {
                onSelectJob?.(job)
                setActiveOverlay({ type: 'job', returnTo: { type: 'app', app: activeOverlay.app, returnTo: activeOverlay.returnTo || null } })
              }}
            />
            </React.Suspense>
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'infrastructure' && <SphereAnalysisWorkspace {...workspaceProps}
            title="Infrastructure Analysis"
            size="wide"
            subtitle="Filesystem · Network · Storage I/O"
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => returnFromOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'job' ? 'Back to Performance Analysis' : activeOverlay.returnTo?.type === 'selected' ? 'Back to SAP Performance' : 'Back'}
          >
            <React.Suspense fallback={<div className="rundeckAnalysisLoading" role="status">Loading Infrastructure Analysis…</div>}>
              <RundeckInfrastructure incidentStart={props.incidentStart || ''} initialContext={activeOverlay.infraContext || activeOverlay.trendContext || null} />
            </React.Suspense>
          </SphereAnalysisWorkspace>}

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

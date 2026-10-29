import React from 'react'
import RundeckMonitoringHistoryCore from './RundeckMonitoringHistoryCore.jsx'
import RundeckJobsProgramsWorkspace from './RundeckJobsProgramsWorkspace.jsx'
import RundeckPerformanceNavigation from './RundeckPerformanceNavigation.jsx'
import { performanceViewFromHash } from './RundeckPerformanceNavigationState.js'
import RundeckAvailability from './RundeckAvailability.jsx'
import RundeckWorkspaceDrawer from './RundeckWorkspaceDrawer.jsx'
import RundeckPerformanceReview from './RundeckPerformanceReview.jsx'
import RundeckSapIssues from './RundeckSapIssues.jsx'
import RundeckSm37LivePortal from './RundeckSm37LivePortal.jsx'
import RundeckSystemHealth from './RundeckSystemHealth.jsx'
import SphereIcon from './SphereIcon.jsx'
import { formatWib, shortHost } from './sapUiFormat.js'
import { currentAppSample } from './rundeckUnifiedHost.js'
import './RundeckMonitoringHistory.css'
import './RundeckInvestigationFlow.css'
import './RundeckOperatorMotion.css'
import './RundeckCockpitPolish.css'
import './RundeckCloudflareMotion.css'
import './RundeckCloudflareLight.css'
import './RundeckUnifiedModalPolish.css'
import './RundeckFlatWorkspace.css'
import './RundeckMockupParity.css'
import './RundeckPopupConsistencyV135.css'
import './RundeckOperatorDesignSystemV135.css'
import './RundeckOperatorFlatV1354.css'
import './RundeckCockpitHexV13512.css'
import './RundeckSphereMotion.css'
import './RundeckSapChecksLayout.css'
import './RundeckAppThreePanel.css'
import './RundeckWorkloadAppLanes.css'
import './RundeckInvestigationFinishingV135.css'
import './RundeckMonthlyReview.css'
import './RundeckPerformanceShell.css'
import './RundeckOperationalPagesV135.css'
import './RundeckVisualRedesignV136.css'
import './RundeckEnterpriseMonitoringV137.css'
import './RundeckEnterpriseFinishV138.css'
import './RundeckViewportFitV139.css'
import './RundeckLandscapeOperations.css'
import './RundeckOperationsCompactV140.css'

const RundeckEvidenceTimeline = React.lazy(() => import('./RundeckEvidenceTimeline.jsx'))
const RundeckObservationHistory = React.lazy(() => import('./RundeckObservationHistory.jsx'))
const RundeckJobHistory = React.lazy(() => import('./RundeckJobHistory.jsx'))
const RundeckReviewQuickAnalysis = React.lazy(() => import('./RundeckReviewQuickAnalysis.jsx'))
const RundeckInfrastructure = React.lazy(() => import('./RundeckInfrastructure.jsx'))
const RundeckUnifiedAppAnalysis = React.lazy(() => import('./RundeckUnifiedAppAnalysis.jsx'))
const RundeckMonthlyReview = React.lazy(() => import('./RundeckMonthlyReview.jsx'))

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
  const [activeView, setActiveView] = React.useState(performanceViewFromHash)
  React.useEffect(() => {
    const sync = () => { setActiveView(performanceViewFromHash()); setActiveOverlay(null) }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  const [availabilitySummaryRoot, setAvailabilitySummaryRoot] = React.useState(null)
  const [readinessSummaryRoot, setReadinessSummaryRoot] = React.useState(null)
  const [incidentHistoryRoot, setIncidentHistoryRoot] = React.useState(null)
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
    setActiveOverlay(previous => ({ type: 'job', returnTo: previous?.type === 'jobs-programs' ? previous : null }))
  }, [onSelectJob])

  const inspectApp = React.useCallback((context = {}) => {
    if (!context.host) return
    focusSequence.current += 1
    chooseAppFocus(shortHost(context.host))
    setAppFocusRequest({ ...context, token: focusSequence.current, highlightOnly: true })
    setActiveOverlay({ type: 'app', app: context })
  }, [chooseAppFocus])

  const selectedContextTime = selectedJob?.at
    ? `${formatWib(selectedJob.at, true)} WIB`
    : selectedJob?.reviewPeriod
      ? String(selectedJob.reviewPeriod).toUpperCase()
      : props.latestCollectionAt
        ? `${formatWib(props.latestCollectionAt, true)} WIB`
        : ''
  const currentWorkloadContent = React.isValidElement(props.currentWorkloadContent)
    ? React.cloneElement(props.currentWorkloadContent, { onSelectJob: inspectJob })
    : props.currentWorkloadContent

  const openEvaluatedWorkload = React.useCallback((row, reviewContext) => {
    if (!row?.consumer_key || !['JOB', 'PROGRAM'].includes(String(row.consumer_type || '').toUpperCase())) return
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
    setActiveOverlay(previous => ({ type: 'job', reviewRow: row, reviewContext, returnTo: previous?.type === 'jobs-programs' ? previous : null }))
  }, [onSelectJob])

  const performanceReviewContent = <RundeckPerformanceReview
    refreshToken={refreshToken}
    selectedJob={selectedJob}
    onSelectJob={inspectJob}
    incidentStart=""
    onOpenQuickAnalysis={openEvaluatedWorkload}
    externalQuickKey={activeOverlay?.type === 'review' ? `${activeOverlay.row?.consumer_type}:${activeOverlay.row?.consumer_key}` : ''}
  />

  const pageNames = {
    jobs: ['Jobs & Programs', 'Current workload, saved evaluations and search'],
    events: ['Related Events', 'Event correlation and collection evidence'],
    'sap-checks': ['SAP Checks', 'Availability, SAP indicators and issue history'],
    infrastructure: ['Infrastructure', 'Filesystem, Network and Storage telemetry'],
    'system-data': ['System Data', 'Collection history and platform status'],
    'monthly-review': ['Monthly Review', 'Saved performance evaluations and PDF reporting'],
  }
  const currentPage = pageNames[activeView]
  const inlinePage = activeView === 'jobs'
    ? <RundeckJobsProgramsWorkspace initialMode="live" initialHealth="REVIEW" showHealth={false} standalone
        refreshToken={refreshToken} performanceVerified={props.sourceQuality?.performanceValid === true && !props.sourceQuality?.collectorBad}
        currentContent={currentWorkloadContent} reviewContent={performanceReviewContent}
        onOpenEvaluatedWorkload={openEvaluatedWorkload} />
    : activeView === 'events'
      ? <div className="rundeckOperatorPairedWorkspace is-events">
          <section className="rundeckOperatorPairedPane" aria-label="Related events timeline">
            <React.Suspense fallback={<div className="rundeckAnalysisLoading">Loading events…</div>}>
              <RundeckEvidenceTimeline paired refreshToken={refreshToken} job={selectedJob} incidentActive />
            </React.Suspense>
          </section>
          <section className="rundeckOperatorPairedPane" aria-label="Rundeck collection history">
            <h3 title="Saved SPHERE collections, not SAP SM37 job executions">Collection History</h3>
            {selectedJob?.key
              ? <React.Suspense fallback={<div className="rundeckAnalysisLoading">Loading saved runs…</div>}>
                  <RundeckObservationHistory paired job={selectedJob} refreshToken={refreshToken} embedded onSelectJob={inspectJob} />
                </React.Suspense>
              : <p className="rundeckOperatorPairedEmpty">Select a job or program to inspect saved observations.</p>}
          </section>
        </div>
      : activeView === 'sap-checks'
        ? <div className="rundeckSapChecksLayout">
            <div className="rundeckSapChecksSummaryRail" aria-label="Availability and SAP readiness summary">
              <div className="rundeckSapChecksSummaryAvailability" ref={setAvailabilitySummaryRoot} />
              <div className="rundeckSapChecksSummaryReadiness" ref={setReadinessSummaryRoot} />
            </div>
            <div className="rundeckOperatorPairedWorkspace is-sap-checks rundeckSapChecksDetailGrid">
              <section className="rundeckOperatorPairedPane" aria-label="SAP technical checks">
                <h3 title="Independent saved service availability checks">Technical Checks</h3>
                <RundeckAvailability refreshToken={refreshToken} paired summaryRoot={availabilitySummaryRoot} />
              </section>
              <section className="rundeckOperatorPairedPane" aria-label="Current SAP issues">
                <h3 title="Latest verified APP signals; unavailable sources remain UNKNOWN">SAP Indicators</h3>
                <RundeckSapIssues paired readinessRoot={readinessSummaryRoot} historyRoot={incidentHistoryRoot}
                  refreshToken={refreshToken} onInspectApp={inspectApp} />
              </section>
            </div>
            <div className="rundeckSapChecksHistoryDock" ref={setIncidentHistoryRoot} aria-label="SAP incident history" />
          </div>
        : activeView === 'infrastructure'
          ? <React.Suspense fallback={<div className="rundeckAnalysisLoading">Loading infrastructure…</div>}>
              <RundeckInfrastructure incidentStart="" refreshToken={refreshToken} />
            </React.Suspense>
          : activeView === 'system-data'
            ? systemDataContent || <p role="status">System data unavailable.</p>
            : activeView === 'monthly-review'
              ? <React.Suspense fallback={<div className="rundeckAnalysisLoading">Loading monthly review…</div>}>
                  <RundeckMonthlyReview refreshToken={refreshToken} sourceHosts={props.sourceHosts || []} />
                </React.Suspense>
              : null

  return <>
    <div className="spherePerformanceShell">
      <RundeckPerformanceNavigation activeView={activeView} onNavigate={(view) => { setActiveView(view); setActiveOverlay(null) }} />
      <div className="spherePerformanceMain">
        {activeView === 'performance' ? <RundeckMonitoringHistoryCore
            {...props}
            currentWorkloadContent={currentWorkloadContent}
            onSelectJob={inspectJob}
            focusedAppHost={trendFocusedHost}
            onFocusAppHost={chooseAppFocus}
            onTrendContext={forwardTrendContext}
            onOpenInfrastructureMetric={(context) => setActiveOverlay({ type: 'infrastructure', infraContext: context, returnTo: { type: 'selected' } })}
            performanceReviewContent={performanceReviewContent}
            onOpenJobsPrograms={(mode = 'live', category = 'REVIEW') => setActiveOverlay({ type: 'jobs-programs', mode, category })}
            onOpenAppJobs={(hostKey) => setActiveOverlay({ type: 'jobs-programs', mode: 'live', category: 'REVIEW', hostKey })}
            onOpenEvaluatedWorkload={openEvaluatedWorkload}
            appFocusRequest={appFocusRequest}
            onOpenSelectedAnalysis={() => selectedJob?.key && setActiveOverlay({ type: 'job' })}
            onOpenTrendInfrastructure={(context) => setActiveOverlay({ type: 'infrastructure', trendContext: context, returnTo: { type: 'selected' } })}
            onOpenTrendEvidence={(job) => setActiveOverlay({ type: 'evidence', job, returnTo: { type: 'selected' } })}
            onInspectApp={inspectApp}
          /> : <section className={`spherePerformancePage is-${activeView}`} aria-label={currentPage?.[0] || 'SAP Operations'}>
          {!['jobs', 'events', 'monthly-review'].includes(activeView) && <header className="spherePerformancePageHeader"><h2 title={currentPage?.[1] || 'Source-backed observations'}>{currentPage?.[0] || 'SAP Operations'}</h2></header>}
          {inlinePage}
        </section>}
      </div>
    </div>
    <RundeckSm37LivePortal selectedJob={selectedJob} refreshToken={refreshToken} />
          <RundeckSystemHealth sourceQuality={props.sourceQuality} sourceCollector={props.sourceCollector} sourceHosts={props.sourceHosts} sourceAvailability={props.sourceAvailability} />

          {activeOverlay?.type === 'monthly-review' && <RundeckWorkspaceDrawer
            title="Monthly Review"
            subtitle="SAP Performance & Job Impact · SPHERE saved history"
            size="monthly-review"
            mountInAppShell
            onClose={() => setActiveOverlay(null)}
          >
            <React.Suspense fallback={<div className="rundeckAnalysisLoading" role="status">Loading Monthly Review…</div>}>
              <RundeckMonthlyReview refreshToken={refreshToken} sourceHosts={props.sourceHosts || []} />
            </React.Suspense>
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'jobs-programs' && <RundeckWorkspaceDrawer
            title="Jobs & Programs"
            subtitle="Current collection · Saved evaluation Review · Search"
            size="jobs-programs"
            mountInAppShell
            onClose={() => setActiveOverlay(null)}
          >
            <div className="rundeckCockpitV13491 rundeckJobsProgramsModalScope">
              <RundeckJobsProgramsWorkspace
                initialMode={activeOverlay.mode || 'live'}
                onModeChange={(mode) => setActiveOverlay(previous => previous?.type === 'jobs-programs' ? { ...previous, mode } : previous)}
                initialHealth={activeOverlay.category || 'REVIEW'}
                initialAppHost={activeOverlay.hostKey || ''}
                showHealth={false}
                refreshToken={refreshToken}
                performanceVerified={props.sourceQuality?.performanceValid === true && !props.sourceQuality?.collectorBad}
                currentContent={currentWorkloadContent}
                reviewContent={performanceReviewContent}
                onOpenEvaluatedWorkload={openEvaluatedWorkload}
              />
            </div>
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'job' && selectedJob?.key && <RundeckWorkspaceDrawer
            title={selectedJob.key}
            subtitle="Job / Program Performance Analysis"
            size="performance"
            footer={<nav className="rundeckJobRelatedAnalysis" role="group" aria-label="Related analysis">
              <strong>More checks</strong>
              <div className="rundeckJobRelatedLinks">
                <button type="button" onClick={() => setActiveOverlay({ type: 'evidence', job: selectedJob, returnTo: { type: 'job', returnTo: activeOverlay.returnTo || null } })}><SphereIcon name="history" />Related Events</button>
                <button type="button" onClick={() => setActiveOverlay({ type: 'infrastructure', returnTo: { type: 'job', returnTo: activeOverlay.returnTo || null } })}><SphereIcon name="server" />Infrastructure</button>
                <button type="button" onClick={() => setActiveOverlay({ type: 'issues', returnTo: { type: 'job', returnTo: activeOverlay.returnTo || null } })}><SphereIcon name="activity" />SAP Checks</button>
                {systemDataContent && <button type="button" onClick={() => setActiveOverlay({ type: 'system-data', returnTo: { type: 'job', returnTo: activeOverlay.returnTo || null } })}><SphereIcon name="database" />System Data</button>}
              </div>
            </nav>}
            actions={activeOverlay.reviewRow ? <button type="button" onClick={() => setActiveOverlay({
              type: 'review',
              row: activeOverlay.reviewRow,
              reviewContext: activeOverlay.reviewContext,
              returnToJob: true,
            })}>Review Result</button> : null}
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => returnFromOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'jobs-programs' ? 'Back to Jobs & Programs' : activeOverlay.returnTo?.type === 'app'
              ? `Back to ${activeOverlay.returnTo.app?.host ? activeOverlay.returnTo.app.host.split('.').shift() : 'APP Server'}`
              : activeOverlay.returnTo?.type === 'review'
                ? 'Back to Review'
                : activeOverlay.returnTo?.type === 'history'
                  ? 'Back to Run History'
                  : 'Back'}
          >
            <React.Suspense fallback={<div className="rundeckAnalysisLoading" role="status">Loading job performance…</div>}><RundeckJobHistory job={selectedJob} refreshToken={refreshToken} incidentStart={props.incidentStart} latestCollectionId={props.latestCollectionId} presentation="drawer" /></React.Suspense>


          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'system-data' && systemDataContent && <RundeckWorkspaceDrawer
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
          </RundeckWorkspaceDrawer>}

          {['evidence', 'history'].includes(activeOverlay?.type) && <RundeckWorkspaceDrawer
            title="Related Events & Rundeck Collection History"
            size="evidence"
            subtitle={(activeOverlay.job || selectedJob)?.key
              ? `${(activeOverlay.job || selectedJob).key} · ${(activeOverlay.job || selectedJob).host ? shortHost((activeOverlay.job || selectedJob).host) + ' · ' : ''}${selectedContextTime}`
              : activeOverlay.scope ? `${activeOverlay.scope} · saved observations` : 'System events and saved observations'}
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo && activeOverlay.returnTo.type !== 'selected'
              ? () => returnFromOverlay(activeOverlay.returnTo) : null}
          >
            <div className="rundeckOperatorPairedWorkspace is-events">
              <section className="rundeckOperatorPairedPane" aria-label="Related events timeline">
                <h3>Related Events</h3>
                <React.Suspense fallback={<div className="rundeckAnalysisLoading" role="status">Loading events…</div>}>
                  <RundeckEvidenceTimeline
                    paired
                    refreshToken={refreshToken}
                    job={activeOverlay.job || selectedJob}
                    scopeLabel={activeOverlay.scope || ''}
                    incidentActive
                  />
                </React.Suspense>
              </section>
              <section className="rundeckOperatorPairedPane" aria-label="Rundeck collection history">
                <h3 title="Saved SPHERE collections, not SAP SM37 job executions">Collection History</h3>
                {(activeOverlay.job || selectedJob)?.key
                  ? <React.Suspense fallback={<div className="rundeckAnalysisLoading" role="status">Loading saved runs…</div>}>
                    <RundeckObservationHistory
                      paired
                      job={activeOverlay.job || selectedJob}
                      refreshToken={refreshToken}
                      embedded
                      onSelectJob={(job) => {
                        if (!job?.key) return
                        onSelectJob?.(job)
                        setActiveOverlay({ type: 'job', returnTo: activeOverlay })
                      }}
                    />
                  </React.Suspense>
                  : <p className="rundeckOperatorPairedEmpty">Select a job or program to view saved collection observations.</p>}
              </section>
            </div>
          </RundeckWorkspaceDrawer>}

          {['availability', 'issues'].includes(activeOverlay?.type) && <RundeckWorkspaceDrawer
            title="SAP Checks"
            size="issues"
            subtitle="Service availability and current SAP issues"
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo && activeOverlay.returnTo.type !== 'selected'
              ? () => returnFromOverlay(activeOverlay.returnTo) : null}
          >
            <div className="rundeckSapChecksLayout">
              <div className="rundeckSapChecksSummaryRail" aria-label="Availability and SAP SM37 readiness summary">
                <div className="rundeckSapChecksSummaryAvailability" ref={setAvailabilitySummaryRoot} />
                <div className="rundeckSapChecksSummaryReadiness" ref={setReadinessSummaryRoot} />
              </div>
              <div className="rundeckOperatorPairedWorkspace is-sap-checks rundeckSapChecksDetailGrid">
                <section className="rundeckOperatorPairedPane" aria-label="SAP technical checks">
                  <h3 title="Independent saved service availability checks">Technical Checks</h3>
                  <RundeckAvailability refreshToken={refreshToken} paired summaryRoot={availabilitySummaryRoot} />
                </section>
                <section className="rundeckOperatorPairedPane" aria-label="Current SAP issues">
                  <h3 title="Latest verified APP signals; unavailable sources remain UNKNOWN">SAP Indicators</h3>
                  <RundeckSapIssues
                    paired
                    readinessRoot={readinessSummaryRoot}
                    historyRoot={incidentHistoryRoot}
                    refreshToken={refreshToken}
                    onInspectApp={(context) => {
                      if (!context?.host) return
                      focusSequence.current += 1
                      setAppFocusRequest({ ...context, token: focusSequence.current, highlightOnly: true })
                      setActiveOverlay({ type: 'app', app: context, returnTo: { type: 'issues', returnTo: activeOverlay.returnTo || null } })
                    }}
                  />
                </section>
              </div>
              <div className="rundeckSapChecksHistoryDock" ref={setIncidentHistoryRoot} aria-label="SAP incident history" />
            </div>
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'app' && activeOverlay.app && <RundeckWorkspaceDrawer
            key={String(activeOverlay.app.host).trim().toUpperCase()}
            title={activeOverlay.app.host ? shortHost(activeOverlay.app.host) + ' Analysis' : 'APP Analysis'}
            subtitle={`${activeOverlay.app.host || 'UNKNOWN host'} · SAP ${props.sourceQuality?.performanceValid && !props.sourceQuality?.collectorBad && currentAppSample(activeOverlay.app, true) ? (activeOverlay.app.collected_at ? formatWib(activeOverlay.app.collected_at, true) + ' WIB' : 'sample time UNKNOWN') : 'UNVERIFIED'} · Infra data checked separately`}
            size="unified-app"
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => returnFromOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'issues' ? 'Back to SAP Issues' : 'Back'}
          >
            <React.Suspense fallback={<div className="rundeckAnalysisLoading" role="status">Loading APP analysis…</div>}>
            <RundeckUnifiedAppAnalysis
              app={activeOverlay.app}
              latestCollectionId={props.latestCollectionId}
              performanceVerified={props.sourceQuality?.performanceValid === true && !props.sourceQuality?.collectorBad && currentAppSample(activeOverlay.app, true)}
              performanceCollectedAt={props.latestCollectionAt || ''}
              incidentStart=""
              refreshToken={refreshToken}
              onSelectJob={(job) => {
                onSelectJob?.(job)
                setActiveOverlay({ type: 'job', returnTo: { type: 'app', app: activeOverlay.app, returnTo: activeOverlay.returnTo || null } })
              }}
            />
            </React.Suspense>
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'infrastructure' && <RundeckWorkspaceDrawer
            title="Infrastructure Analysis"
            size="wide"
            subtitle="Filesystem · Network · Storage I/O"
            onClose={() => setActiveOverlay(null)}
            onBack={activeOverlay.returnTo ? () => returnFromOverlay(activeOverlay.returnTo) : null}
            backLabel={activeOverlay.returnTo?.type === 'job' ? 'Back to Performance Analysis' : activeOverlay.returnTo?.type === 'selected' ? 'Back to SAP Performance' : 'Back'}
          >
            <React.Suspense fallback={<div className="rundeckAnalysisLoading" role="status">Loading Infrastructure Analysis…</div>}>
              <RundeckInfrastructure
                incidentStart=""
                initialContext={activeOverlay.infraContext || activeOverlay.trendContext ||
                  (activeOverlay.sapHost ? { sapHost: activeOverlay.sapHost, metric: 'filesystem' } : null)}
                lockedHost={Boolean(activeOverlay.sapHost)}
                hideHostCards={Boolean(activeOverlay.sapHost)}
                refreshToken={refreshToken}
              />
            </React.Suspense>
          </RundeckWorkspaceDrawer>}

          {activeOverlay?.type === 'review' && activeOverlay.row && <React.Suspense fallback={<div className="rundeckAnalysisLoading" role="status">Loading quick analysis…</div>}><RundeckReviewQuickAnalysis
            row={activeOverlay.row}
            reviewContext={activeOverlay.reviewContext}
            refreshToken={refreshToken}
            incidentStart=""
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
          /></React.Suspense>}
  </>
}

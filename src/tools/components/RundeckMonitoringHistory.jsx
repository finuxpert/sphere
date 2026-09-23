import React from 'react'
import RundeckJobMonitor from './RundeckJobMonitor.jsx'
import RundeckInfrastructure from './RundeckInfrastructure.jsx'
import RundeckMonitoringHistoryCore from './RundeckMonitoringHistoryCore.jsx'
import RundeckOperationalEvidence from './RundeckOperationalEvidence.jsx'
import RundeckPerformanceReview from './RundeckPerformanceReview.jsx'
import RundeckSapIssues from './RundeckSapIssues.jsx'
import RundeckSm37LivePortal from './RundeckSm37LivePortal.jsx'
import RundeckSystemHealth from './RundeckSystemHealth.jsx'
import RundeckWorkloadExplorer from './RundeckWorkloadExplorer.jsx'
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

function scrollToSelectedWorkload() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  let frames = 0
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  const navigate = () => {
    frames += 1
    if (frames < 4) return window.requestAnimationFrame(navigate)
    document.querySelector('.rundeckJobHistory')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
  }
  window.requestAnimationFrame(navigate)
}

export default function RundeckMonitoringHistory(props) {
  const { onTrendContext, onSelectJob, refreshToken, selectedJob } = props
  const focusSequence = React.useRef(0)
  const [appFocusRequest, setAppFocusRequest] = React.useState(null)
  const [monitoringMode, setMonitoringMode] = React.useState('live')

  const forwardTrendContext = React.useCallback((context = {}) => {
    const selectedMetric = String(context.metric || '')
    onTrendContext?.({ ...context, metricLabel: metricLabelForTrend(selectedMetric, context.metricLabel || 'Metric') })
  }, [onTrendContext])

  const inspectJob = React.useCallback((job) => {
    if (!job?.key) return
    onSelectJob?.(job)
    scrollToSelectedWorkload()
  }, [onSelectJob])

  const openJobInLive = React.useCallback((job) => {
    if (!job?.key) return
    setMonitoringMode('live')
    onSelectJob?.(job)
    scrollToSelectedWorkload()
  }, [onSelectJob])

  const inspectApp = React.useCallback((context = {}) => {
    if (!context.host) return
    focusSequence.current += 1
    setAppFocusRequest({ ...context, token: focusSequence.current })
  }, [])

  const operationalEvidenceContent = <RundeckOperationalEvidence
    refreshToken={refreshToken}
    selectedJob={selectedJob}
  />

  const modeHint = monitoringMode === 'live'
    ? 'Live SAP performance monitoring'
    : monitoringMode === 'explorer'
      ? 'Job and Program performance · 24H–30D'
      : monitoringMode === 'jobs'
        ? 'SM37 execution health · correlation · review queue'
        : 'Filesystem · Network · Storage I/O supporting evidence'

  return <>
    <div className="rundeckMonitoringModeBar" aria-label="LOG Analysis mode">
      <div className="rundeckMonitoringModeTabs" role="tablist" aria-label="Monitoring mode">
        <button type="button" role="tab" aria-selected={monitoringMode === 'live'} className={monitoringMode === 'live' ? 'is-active' : ''} onClick={() => setMonitoringMode('live')}>Live Monitoring</button>
        <button type="button" role="tab" aria-selected={monitoringMode === 'explorer'} className={monitoringMode === 'explorer' ? 'is-active' : ''} onClick={() => setMonitoringMode('explorer')}>Job &amp; Program History</button>
        <button type="button" role="tab" aria-selected={monitoringMode === 'jobs'} className={monitoringMode === 'jobs' ? 'is-active' : ''} onClick={() => setMonitoringMode('jobs')}>SAP Job Monitor</button>
        <button type="button" role="tab" aria-selected={monitoringMode === 'infra'} className={monitoringMode === 'infra' ? 'is-active' : ''} onClick={() => setMonitoringMode('infra')}>Infrastructure</button>
      </div>
      <small>{modeHint}</small>
    </div>

    {monitoringMode === 'explorer'
      ? <RundeckWorkloadExplorer refreshToken={refreshToken} onOpenLiveJob={openJobInLive} />
      : monitoringMode === 'jobs'
        ? <RundeckJobMonitor refreshToken={refreshToken} onOpenLiveJob={openJobInLive} />
        : monitoringMode === 'infra'
          ? <RundeckInfrastructure />
          : <>
          <RundeckMonitoringHistoryCore
            {...props}
            onSelectJob={inspectJob}
            onTrendContext={forwardTrendContext}
            operationalEvidenceContent={operationalEvidenceContent}
            appFocusRequest={appFocusRequest}
          />
          <RundeckSm37LivePortal selectedJob={selectedJob} refreshToken={refreshToken} />
          <RundeckSystemHealth refreshToken={refreshToken} />
          <section className="rundeckIssuesReviewBand" aria-label="SAP Issues and Performance Review">
            <div className="rundeckIssuesReviewPane is-issues"><RundeckSapIssues refreshToken={refreshToken} onInspectApp={inspectApp} /></div>
            <div className="rundeckIssuesReviewPane is-review"><RundeckPerformanceReview refreshToken={refreshToken} selectedJob={selectedJob} onSelectJob={inspectJob} /></div>
          </section>
        </>}
  </>
}

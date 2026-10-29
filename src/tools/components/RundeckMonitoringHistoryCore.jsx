import React from 'react'
import RundeckUnifiedAppInfrastructure from './RundeckUnifiedAppInfrastructure.jsx'
import RundeckServerTrend from './RundeckServerTrend.jsx'
import RundeckWorkloadHealth from './RundeckWorkloadHealth.jsx'

export default function RundeckMonitoringHistoryCore(props) {
  const overviewRef = React.useRef(null)

  // Fit the read-only overview into the real available browser viewport.
  // The fit is opt-in for spacious desktop windows; smaller screens and expanded
  // evaluation details retain natural page scrolling instead of clipping data.
  const measureViewport = React.useCallback(() => {
    const overview = overviewRef.current
    if (!overview) return
    const available = Math.floor(window.innerHeight - overview.getBoundingClientRect().top - 10)
    const detailsExpanded = Boolean(overview.querySelector('.rundeckAppEvalDots'))
    // Fit only when all visible source-backed overview sections have room.
    const fit = false // The new compact summary uses natural flow; never stretch empty tracks.
    // A sixth UNKNOWN/UNVERIFIED membership lane must never be squeezed into
    // the five-row desktop allocation. Use natural page flow instead.
    const additionalLane = overview.querySelectorAll('.rundeckAppEvalLane').length > 5
    if (fit && !additionalLane) {
      overview.style.setProperty('--sphere-overview-room', available + 'px')
      overview.dataset.viewportFit = 'true'
    } else {
      overview.style.removeProperty('--sphere-overview-room')
      delete overview.dataset.viewportFit
    }
  }, [])

  React.useLayoutEffect(() => { measureViewport() })
  React.useEffect(() => {
    let frame = 0
    const schedule = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(measureViewport)
    }
    window.addEventListener('resize', schedule, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    const panel = overviewRef.current?.closest('.rundeckPanel')
    for (const element of [panel?.querySelector('.rundeckLandscapeHeader'),
      panel?.querySelector('.rundeckDataQualityNotice')]) {
      if (element) observer?.observe(element)
    }
    // Expanded evaluation hexagons must exit the constrained single-screen
    // grid *before paint*. Observe only evaluation child additions/removals,
    // not live chart attributes, to avoid expensive monitoring redraws.
    const evaluations = overviewRef.current?.querySelector('.rundeckJobsProgramsOverview')
    const expansionObserver = typeof MutationObserver === 'undefined' ? null :
      new MutationObserver(() => {
        window.cancelAnimationFrame(frame)
        measureViewport()
      })
    if (evaluations) expansionObserver?.observe(evaluations, { childList: true, subtree: true })
    return () => {
      window.removeEventListener('resize', schedule)
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      expansionObserver?.disconnect()
    }
  }, [measureViewport])

  return <section ref={overviewRef} className="rundeckMonitoring rundeckMonitoringV1234 rundeckMonitoringV1235 rundeckCockpitV13456 rundeckCockpitV13490 rundeckCockpitV13491">
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
        fleetMode
      />
    </section>

    <section className="rundeckTrendBandV13454">
      <RundeckServerTrend
        ambientBraid={false}
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
          onOpenApp={props.onOpenAppJobs}
          viewMode="by-app"
          compactSummary
          onReview={(category = 'REVIEW') => props.onOpenJobsPrograms?.('review', category)}
        />
      </div>
    </section>
  </section>
}

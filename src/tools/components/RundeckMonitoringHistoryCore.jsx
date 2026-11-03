import React from 'react'
import RundeckUnifiedAppInfrastructure from './RundeckUnifiedAppInfrastructure.jsx'
import RundeckServerTrend from './RundeckServerTrend.jsx'
import RundeckWorkloadHealth from './RundeckWorkloadHealth.jsx'
import RundeckStorageSummary from './RundeckStorageSummary.jsx'
import RundeckSapWorkloadMiniCharts from './RundeckSapWorkloadMiniCharts.jsx'

export default function RundeckMonitoringHistoryCore(props) {
  const overviewRef = React.useRef(null)
  // Both collector-backed SAP activity charts share a recent range, separate from Performance Trends.
  const [workloadRange, setWorkloadRange] = React.useState('24h')

  // Fit the read-only overview into the real available browser viewport.
  // The fit is opt-in for spacious desktop windows; smaller screens and expanded
  // evaluation details retain natural page scrolling instead of clipping data.
  const measureViewport = React.useCallback(() => {
    const overview = overviewRef.current
    if (!overview) return
    // Compact summary uses a separate layout contract. Never activate the
    // legacy 5-lane fit, which allocates a tall empty evaluation grid.
    // The CSS only compresses *preview* rows; all records remain in View Details.
    if (overview.querySelector('.sphereWorkloadSummary')) {
      const available = Math.floor(window.innerHeight - overview.getBoundingClientRect().top - 36)
      const compactFit = window.innerWidth >= 1400 && window.innerHeight >= 760 && available >= 540
      if (compactFit) {
        overview.style.setProperty('--sphere-overview-room', available + 'px')
        overview.dataset.viewportFit = 'compact'
      } else {
        overview.style.removeProperty('--sphere-overview-room')
        delete overview.dataset.viewportFit
      }
      return
    }
    const available = Math.floor(window.innerHeight - overview.getBoundingClientRect().top - 36)
    // Fit only when all visible source-backed overview sections have room.
    const detailsExpanded = Boolean(overview.querySelector('.rundeckAppEvalDots'))
    // Three-panel Monitoring can fit a shorter viewport than legacy five-lane screens.
    const requiredRoom = overview.classList.contains('is-six-chart-layout') ? 660 : overview.classList.contains('is-three-panel') ? 600 : 700
    const fit = !detailsExpanded && window.innerWidth >= 1280 && window.innerHeight >= 760 && available >= requiredRoom
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

  // One-screen operator Monitoring uses a stable, non-animated layout.
  const motionEnabled = false

  return <section ref={overviewRef}
    className="rundeckMonitoring rundeckMonitoringV1234 rundeckMonitoringV1235 rundeckCockpitV13456 rundeckCockpitV13490 rundeckCockpitV13491 is-three-panel is-six-chart-layout"
    data-motion={motionEnabled ? 'on' : 'off'}>
    <div className="sphereMonitoringThreeUp sphereOverviewBottomRow row g-2" aria-label="SAP monitoring overview">
      <div className="sphereMonitoringLeftStack" aria-label="APP and storage overview">
      <section className="sphereMonitoringApp rundeckTopBandV13454 is-unified-app-infra col-12 col-xl-4" aria-label="SAP APP Landscape">
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
      <RundeckStorageSummary compactOnly refreshToken={props.refreshToken} onOpenDetails={props.onOpenHealthDetails} />
      </div>
      <section className="rundeckJobsProgramsOverview col-12" aria-label="Job & Program Evaluation">
        <div className="rundeckJobsProgramsHealthSide">
          <RundeckWorkloadHealth
            refreshToken={props.refreshToken}
            performanceVerified={props.sourceQuality?.performanceValid === true && !props.sourceQuality?.collectorBad}
            onSelectWorkload={props.onOpenEvaluatedWorkload}
            viewMode="status"
            motionEnabled={motionEnabled}
            showResourceTop5
            onReview={(category = 'REVIEW') => props.onOpenJobsPrograms?.('review', category)}
          />
        </div>
      </section>
      <div className="sphereMonitoringRightStack" aria-label="Observed SAP workloads and WP types across APP1–APP5">
        <RundeckSapWorkloadMiniCharts range={workloadRange} onRange={setWorkloadRange}
          refreshToken={props.refreshToken}/>
      </div>
    </div>
    <section className="rundeckTrendBandV13454 sphereMonitoringTrendBottom">
      <RundeckServerTrend
        ambientBraid={false}
        compactMonitoring
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
  </section>
}

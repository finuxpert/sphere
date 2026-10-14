import RundeckAppServerAnalysis from './RundeckAppServerAnalysis.jsx'
import RundeckInfrastructure from './RundeckInfrastructure.jsx'
import { shortHost, formatWib } from './sapUiFormat.js'
import './RundeckUnifiedAppAnalysis.css'

/** Two independent sources in one operator workspace: never merge their timestamps. */
export default function RundeckUnifiedAppAnalysis({
  app, latestCollectionId = '', refreshToken = '', onSelectJob,
  incidentStart = '', performanceVerified = false, performanceCollectedAt = '',
}) {
  if (!app?.host) return null
  const label = shortHost(app.host)
  // Only an explicit, source-matched Infrastructure host may unlock telemetry.
  // Never silently fall back to the SAP hostname when Infrastructure is missing.
  const host = app.infraHostVerified === true ? String(app.infraHost || '').trim() : ''
  const allowedHost = Boolean(host) && shortHost(host) === label
  return <section className="rundeckUnifiedAnalysis" aria-label={`${label} SAP and Infrastructure analysis`}>
    <div className="rundeckUnifiedAnalysisProvenance">
      <span><strong>SAP Performance</strong> · {performanceVerified ? 'VERIFIED' : 'UNVERIFIED'} · {performanceVerified && performanceCollectedAt ? `${formatWib(performanceCollectedAt,true)} WIB` : 'sample time UNKNOWN'}</span>
      <span><strong>Infrastructure</strong> · {allowedHost ? `${host} · independent collection and freshness` : 'UNVERIFIED · no confirmed host mapping'}</span>
    </div>
    <div className="rundeckUnifiedAnalysisGrid">
      <section aria-label="SAP performance evidence" className="rundeckUnifiedAnalysisPane">
        <h4>SAP Performance</h4>
        <RundeckAppServerAnalysis
          app={app}
          latestCollectionId={performanceVerified ? latestCollectionId : ''}
          refreshToken={refreshToken}
          onSelectJob={onSelectJob}
        />
      </section>
      <section aria-label="Infrastructure evidence" className="rundeckUnifiedAnalysisPane">
        <h4>Infrastructure</h4>
        {allowedHost
          ? <RundeckInfrastructure
              key={host}
              initialContext={{ host, metric: 'filesystem' }}
              lockedHost
              hideHostCards
              incidentStart={incidentStart}
              refreshToken={refreshToken}
            />
          : <p className="rundeckUnifiedAnalysisUnknown" role="status">No verified Infrastructure host mapping for {label}. Filesystem, Network and Storage I/O are unavailable, not NORMAL.</p>}
      </section>
    </div>
  </section>
}

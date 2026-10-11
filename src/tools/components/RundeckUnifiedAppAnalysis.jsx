import RundeckAppServerAnalysis from './RundeckAppServerAnalysis.jsx'
import RundeckInfrastructure from './RundeckInfrastructure.jsx'
import { shortHost } from './sapUiFormat.js'
import './RundeckUnifiedAppAnalysis.css'

/** Two independent sources in one operator workspace: never merge their timestamps. */
export default function RundeckUnifiedAppAnalysis({
  app, latestCollectionId = '', refreshToken = '', onSelectJob,
  incidentStart = '', performanceVerified = false,
}) {
  if (!app?.host) return null
  const host = app.infraHost || app.host
  const label = shortHost(app.host)
  const infraKey = String(host).trim().toUpperCase()
  const appKey = String(app.host).trim().toUpperCase()
  const allowedHost = infraKey === appKey || (Boolean(app.infraHost) && /^AOPH[1-9]\d*PAPPDC$/i.test(infraKey))
  return <section className="rundeckUnifiedAnalysis" aria-label={`${label} SAP and Infrastructure analysis`}>
    <div className="rundeckUnifiedAnalysisProvenance">
      <strong>{label} · {app.host}</strong>
      <span>Performance: {performanceVerified ? 'verified current collection' : 'UNVERIFIED — inspect retained data only'}</span>
      <span>Infrastructure: independent host collection and freshness</span>
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
          : <p className="rundeckUnifiedAnalysisUnknown">Infrastructure hostname unverified; measurements are UNKNOWN, not NORMAL.</p>}
      </section>
    </div>
  </section>
}

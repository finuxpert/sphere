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
  const host = app.infraHost || app.host
  const label = shortHost(app.host)
  const infraKey = String(host).trim().toUpperCase()
  const appKey = String(app.host).trim().toUpperCase()
  const allowedHost = infraKey === appKey || (Boolean(app.infraHost) && shortHost(infraKey) === shortHost(appKey))
  return <section className="rundeckUnifiedAnalysis" aria-label={`${label} SAP and Infrastructure analysis`}>
    <div className="rundeckUnifiedAnalysisProvenance">
      <span><strong>SAP Performance</strong> · {performanceVerified ? 'VERIFIED' : 'UNVERIFIED'} · {performanceVerified && performanceCollectedAt ? `${formatWib(performanceCollectedAt,true)} WIB` : 'sample time UNKNOWN'}</span>
      <span><strong>Infrastructure</strong> · {allowedHost ? `${host} · freshness below` : 'UNKNOWN · APP identity mismatch'}</span>
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

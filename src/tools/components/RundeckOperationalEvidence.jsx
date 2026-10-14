import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { shortHost } from './sapUiFormat.js'
import RundeckEvidenceTimeline from './RundeckEvidenceTimeline.jsx'

const API = `${import.meta.env.BASE_URL}api`

function jobContext(workload, host, source) {
  if (!workload?.consumer_key) return null
  return {
    key: workload.consumer_key,
    host: host || workload.host || '',
    consumerType: workload.consumer_type || '',
    source,
  }
}

export default function RundeckOperationalEvidence({
  refreshToken = '', selectedJob = null, onOpenEvidence, onOpenIssues,
  onOpenInfrastructure, onOpenSystemData, systemDataSummary = '', infrastructureLabel = '', focusedHost = '',
}) {
  const [summary, setSummary] = React.useState(null)
  const [error, setError] = React.useState('')
  React.useEffect(() => {
    const controller = new AbortController()
    fetch(`${API}/analysis/performance`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('Evidence unavailable (' + response.status + ')'); return response.json() })
      .then(result => { setSummary(result); setError('') })
      .catch(failure => { if (failure.name !== 'AbortError') setError(failure.message || 'Evidence unavailable') })
    return () => controller.abort()
  }, [refreshToken])
  const current = summary?.current_workload
  const evidenceJob = selectedJob || (summary?.active ? jobContext(current, summary?.affected_server, 'current') : null)
  const incidentHost = summary?.active ? shortHost(summary.affected_server || '') : ''
  const evidenceScope = selectedJob?.key ? `Job ${shortHost(selectedJob.host) || 'host unverified'}`
    : incidentHost ? `Incident ${incidentHost}` : 'System'
  const selectionMismatch = Boolean(focusedHost && incidentHost && shortHost(focusedHost) !== incidentHost)
  const evidenceTitle = selectionMismatch && !selectedJob?.key
    ? `Current incident ${incidentHost}; selected ${shortHost(focusedHost)} is different`
    : `Related evidence scope: ${evidenceScope}`
  const evidence = summary?.active && !error
    ? <RundeckEvidenceTimeline refreshToken={refreshToken} job={evidenceJob} scopeLabel={evidenceScope}
        incidentActive compact onOpen={() => onOpenEvidence?.(evidenceJob)} />
    : <button type="button" className="rundeckEvidenceCard rundeckCorrelatedCard"
        onClick={() => onOpenEvidence?.(evidenceJob)} aria-label="Open Related Events and Run History" title={evidenceTitle}>
        <span className="rundeckEvidenceCardTitle"><SphereIcon name="history" /> Related Events · {evidenceScope}</span>
        <strong>{error ? 'Evidence unverified' : !summary ? 'Loading evidence' : 'No current event'}</strong>
      </button>
  // Four distinct destinations; related data shares a popup rather than duplicated links.
  return <nav className="rundeckAnalysisLaunchers" aria-label="Operational analysis">
    <div className="rundeckAnalysisLaunchersHead"><h3>Operational Analysis</h3></div>
    <div className="rundeckAnalysisActions" role="group" aria-label="Investigation shortcuts">
      {evidence}
      <button type="button" className="rundeckAnalysisSecondary" onClick={onOpenIssues} aria-label="Open SAP Checks">
        <span><SphereIcon name="activity" />SAP Checks</span>
        <small>System availability · SAP issues</small>
      </button>
      <button type="button" className="rundeckAnalysisInfrastructure" onClick={onOpenInfrastructure} aria-label="Open Infrastructure Analysis">
        <span><SphereIcon name="server" />Infrastructure</span><small>{infrastructureLabel || 'Host metrics'}</small>
      </button>
      {onOpenSystemData && <button type="button" className="rundeckSystemDataUtility"
        onClick={onOpenSystemData} aria-label="Open System Data">
        <span><SphereIcon name="database" />System Data</span><small title={systemDataSummary}>{systemDataSummary || 'Collection runs'}</small>
      </button>}
    </div>
  </nav>
}

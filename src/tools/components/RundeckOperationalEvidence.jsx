import React from 'react'
import RundeckAvailability from './RundeckAvailability.jsx'
import RundeckEvidenceTimeline from './RundeckEvidenceTimeline.jsx'
import RundeckSapIssues from './RundeckSapIssues.jsx'

const API = `${import.meta.env.BASE_URL}api`

function RundeckSapIssuesProxy({ refreshToken, onOpen }) {
  return <RundeckSapIssues refreshToken={refreshToken} compact onOpen={onOpen} />
}

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
  refreshToken = '', selectedJob = null, onOpenEvidence, onOpenAvailability, onOpenIssues,
  onOpenHistory, onOpenInfrastructure, onOpenSystemData, systemDataSummary = '', infrastructureLabel = '',
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
  const evidence = summary?.active && !error
    ? <RundeckEvidenceTimeline refreshToken={refreshToken} job={evidenceJob} incidentActive compact onOpen={() => onOpenEvidence?.(evidenceJob)} />
    : <button type="button" className="rundeckEvidenceCard rundeckCorrelatedCard"
        onClick={() => onOpenEvidence?.(evidenceJob)} aria-label="Open Correlated Events">
        <span className="rundeckEvidenceCardTitle">Correlated Events</span>
        <strong>{error ? 'Evidence unverified' : !summary ? 'Loading evidence' : 'No active correlation'}</strong>
      </button>
  // Six live evidence destinations, one flat navigation surface.
  // Each compact source continues to own its freshness/status text.
  return <nav className="rundeckAnalysisLaunchers" aria-label="Operational analysis">
    <div className="rundeckAnalysisLaunchersHead"><h3>Operational Analysis</h3><small>Investigate saved evidence</small></div>
    <div className="rundeckAnalysisActions" role="group" aria-label="Investigation shortcuts">
      {evidence}
      <button type="button" className="rundeckAnalysisSecondary" disabled={!selectedJob?.key}
        title={selectedJob?.key ? 'Open saved observations for selected Job / Program' : 'Select a Job / Program to see observation history'}
        aria-label="Open Observation History" onClick={onOpenHistory}>
        <span>Observation History</span>
        <small>{selectedJob?.key ? 'Selected Job' : 'Select Job'}</small>
      </button>
      <RundeckSapIssuesProxy refreshToken={refreshToken} onOpen={onOpenIssues} />
      <RundeckAvailability refreshToken={refreshToken} compact onOpen={onOpenAvailability} />
      <button type="button" className="rundeckAnalysisInfrastructure" onClick={onOpenInfrastructure} aria-label="Open Infrastructure Analysis">
        <span>Infrastructure</span><small>{infrastructureLabel || 'Independent host data'}</small>
      </button>
      {onOpenSystemData && <button type="button" className="rundeckSystemDataUtility"
        onClick={onOpenSystemData} aria-label="Open System Data">
        <span>System Data</span><small title={systemDataSummary}>{systemDataSummary || 'Collections and services'}</small>
      </button>}
    </div>
  </nav>
}

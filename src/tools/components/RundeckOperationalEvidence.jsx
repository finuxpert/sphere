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
  return <section className="rundeckAnalysisLaunchers" aria-label="Operational analysis">
    <header className="rundeckAnalysisLaunchersHead">
      <h3>Operational Analysis</h3>
      {onOpenSystemData && <button type="button" className="rundeckSystemDataUtility" onClick={onOpenSystemData}>
        System Data <span>{systemDataSummary || 'Collections · Services'}</span><span aria-hidden="true">›</span>
      </button>}
    </header>
    <div className="rundeckOperationalSummaryCards rundeckAnalysisGroups">
      <section className="rundeckAnalysisGroup" aria-label="Events and observation history">
        <h4>Events &amp; History</h4>
        <div className="rundeckAnalysisGroupActions">
          {evidence}
          <button type="button" className="rundeckAnalysisSecondary" disabled={!selectedJob?.key}
            onClick={onOpenHistory} aria-label="Open Observation History">
            <span>Observation History</span><small>{selectedJob?.host ? selectedJob.host.split('.')[0] : 'Select a Job / Program'}</small>
          </button>
        </div>
      </section>
      <section className="rundeckAnalysisGroup" aria-label="SAP service and issue checks">
        <h4>SAP Checks</h4>
        <div className="rundeckAnalysisGroupActions">
          <RundeckSapIssuesProxy refreshToken={refreshToken} onOpen={onOpenIssues} />
          <RundeckAvailability refreshToken={refreshToken} compact onOpen={onOpenAvailability} />
        </div>
      </section>
      <section className="rundeckAnalysisGroup" aria-label="Infrastructure investigation">
        <h4>Infrastructure</h4>
        <button type="button" className="rundeckAnalysisInfrastructure" onClick={onOpenInfrastructure} aria-label="Open Infrastructure Analysis">
          <span>Filesystem · Network · Storage I/O</span>
          <small>{infrastructureLabel || 'Independent host evidence'}</small>
          <span className="rundeckAnalysisChevron" aria-hidden="true">›</span>
        </button>
      </section>
    </div>
  </section>
}

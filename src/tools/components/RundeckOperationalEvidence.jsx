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

export default function RundeckOperationalEvidence({ refreshToken = '', selectedJob = null, onOpenEvidence = null, onOpenAvailability = null, onOpenIssues = null }) {
  const [summary, setSummary] = React.useState(null)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    const controller = new AbortController()
    fetch(`${API}/analysis/performance`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Performance analysis unavailable (${response.status})`)
        return response.json()
      })
      .then((result) => {
        setSummary(result)
        setError('')
      })
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message || 'Performance analysis unavailable')
      })
    return () => controller.abort()
  }, [refreshToken])

  const current = summary?.current_workload
  const currentContext = summary?.active ? jobContext(current, summary?.affected_server, 'current') : null
  const evidenceJob = selectedJob || currentContext

  if (!summary && !error) return null
  if (error || !summary?.active) {
    return <section className="rundeckOperationalSummaryCards is-two" aria-label="SAP Availability and active issues">
      <RundeckAvailability refreshToken={refreshToken} compact onOpen={onOpenAvailability} />
      <RundeckSapIssuesProxy refreshToken={refreshToken} onOpen={onOpenIssues} />
    </section>
  }

  return <section className="rundeckOperationalSummaryCards" aria-label="Operational evidence, SAP availability and active issues">
    <RundeckEvidenceTimeline refreshToken={refreshToken} job={evidenceJob} incidentActive={summary.active} compact onOpen={() => onOpenEvidence?.(evidenceJob)} />
    <RundeckAvailability refreshToken={refreshToken} compact onOpen={onOpenAvailability} />
    <RundeckSapIssuesProxy refreshToken={refreshToken} onOpen={onOpenIssues} />
  </section>
}

import React from 'react'
import RundeckAvailability from './RundeckAvailability.jsx'
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

export default function RundeckOperationalEvidence({ refreshToken = '', selectedJob = null, issuesContent = null }) {
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
    return <section className={"rundeckOperationalBandV1234 " + (issuesContent ? "is-availability-issues" : "is-availability-only")} aria-label="SAP Availability">
      <div className="rundeckBandPaneV1234 is-availability"><RundeckAvailability refreshToken={refreshToken} /></div>
      {issuesContent && <div className="rundeckBandPaneV1234 is-issues">{issuesContent}</div>}
    </section>
  }

  return <section className="rundeckOperationalBandV1234" aria-label="Operational evidence, SAP availability and active issues">
    <div className="rundeckBandPaneV1234 is-operational-events">
      <RundeckEvidenceTimeline refreshToken={refreshToken} job={evidenceJob} incidentActive={summary.active} />
    </div>
    <div className="rundeckBandPaneV1234 is-availability">
      <RundeckAvailability refreshToken={refreshToken} />
    </div>
    {issuesContent && <div className="rundeckBandPaneV1234 is-issues">{issuesContent}</div>}
  </section>
}

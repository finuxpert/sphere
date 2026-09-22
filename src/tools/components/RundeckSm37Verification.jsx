import React from 'react'
import { formatWib, shortHost } from './sapUiFormat.js'
import './RundeckSm37Verification.css'

const API = `${import.meta.env.BASE_URL}api`

function stateClass(value = '') {
  const key = String(value).toUpperCase()
  if (key === 'MATCHED') return 'is-normal'
  if (key === 'PARTIAL_MATCH') return 'is-attention'
  if (key === 'NOT_FOUND') return 'is-warning'
  return 'is-unknown'
}

export default function RundeckSm37Verification({ jobName, program, host, observedAt, refreshToken = '' }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (!jobName) {
      setData(null)
      setError('')
      return undefined
    }
    const controller = new AbortController()
    const params = new URLSearchParams({ job: jobName })
    if (program) params.set('program', program)
    if (host) params.set('host', host)
    if (observedAt) params.set('observed_at', observedAt)
    setLoading(true)
    setError('')
    fetch(`${API}/jobs/verify?${params.toString()}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail || `SM37 verification unavailable (${response.status})`)
        }
        return response.json()
      })
      .then(setData)
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message || 'SM37 verification unavailable.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [host, jobName, observedAt, program, refreshToken])

  const state = data?.verification || (loading ? 'CHECKING' : 'NOT_VERIFIED')
  const match = data?.match || null
  const source = data?.source || null

  return <section className="rundeckSm37Verification" aria-label="SM37 verification context">
    <div className="rundeckSm37VerificationHead">
      <strong>SM37 Verification</strong>
      <span className={stateClass(state)}>{state.replaceAll('_', ' ')}</span>
    </div>
    <div className="rundeckSm37VerificationGrid">
      <span><b>Job Name</b>{jobName || '—'}</span>
      <span><b>Program</b>{program || '—'}</span>
      <span><b>Observed</b>{observedAt ? `${formatWib(observedAt, true)} WIB` : '—'}</span>
      {match && <span><b>Execution</b>{match.job_count || '—'} · Step {match.step_no || 1}</span>}
      {match && <span><b>Status</b>{match.status || '—'}</span>}
      {match && <span><b>Server</b>{shortHost(match.server || '') || '—'}</span>}
      {match?.started_at && <span><b>Started</b>{formatWib(match.started_at, true)} WIB</span>}
      {match?.ended_at && <span><b>Ended</b>{formatWib(match.ended_at, true)} WIB</span>}
    </div>
    {error
      ? <p className="is-error">{error}</p>
      : state === 'MATCHED'
        ? <p>Matched against an imported authoritative SM37 execution using {data?.evidence?.join(', ') || 'execution identity and time'}. This confirms execution context, not root cause.</p>
        : state === 'PARTIAL_MATCH'
          ? <p>Partial SM37 identity match. Review Job Name, Step Program, server and execution time before using it as evidence.</p>
          : state === 'NOT_FOUND'
            ? <p>No authoritative SM37 execution matched this workload context in the verification window.</p>
            : <p>{source?.status === 'NOT_CONFIGURED' ? 'SM37 execution feed is not configured. SPHERE keeps this context unverified.' : 'Verification requires an imported authoritative SM37 execution record.'}</p>}
  </section>
}

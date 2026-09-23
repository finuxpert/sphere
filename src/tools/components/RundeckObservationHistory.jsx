import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { formatWib, numberText, shortHost } from './sapUiFormat.js'
import './RundeckObservationHistory.css'

const API = `${import.meta.env.BASE_URL}api`
const GAP_MS = 25 * 60 * 1000

const numeric = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const rowMetric = (row, key) => {
  const details = row?.details || {}
  if (key === 'pss') return numeric(details.total_pss_gb ?? details.pss_gb)
  if (key === 'processes') return numeric(details.process_count) ?? numeric(details.pids?.length) ?? 1
  return null
}

function latestEpisode(items = [], targetAt = '') {
  const rows = [...items].filter((row) => Number.isFinite(Date.parse(row?.collected_at || ''))).sort((a, b) => Date.parse(a.collected_at) - Date.parse(b.collected_at))
  if (!rows.length) return []
  const episodes = []
  let current = []
  rows.forEach((row) => {
    const previous = current.at(-1)
    if (previous && Date.parse(row.collected_at) - Date.parse(previous.collected_at) > GAP_MS) {
      episodes.push(current)
      current = []
    }
    current.push(row)
  })
  if (current.length) episodes.push(current)
  const target = Date.parse(targetAt || '')
  if (!Number.isFinite(target)) return episodes.at(-1) || []
  return episodes.reduce((best, episode) => {
    const bestDistance = Math.min(...best.map((row) => Math.abs(Date.parse(row.collected_at) - target)))
    const distance = Math.min(...episode.map((row) => Math.abs(Date.parse(row.collected_at) - target)))
    return distance < bestDistance ? episode : best
  }, episodes[0])
}

export default function RundeckObservationHistory({ job = null, refreshToken = '', onSelectJob, embedded = false }) {
  const [rows, setRows] = React.useState([])
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (!job?.key) {
      setRows([])
      setError('')
      return undefined
    }
    const controller = new AbortController()
    const params = new URLSearchParams({ job: job.key, days: '90', limit: '500' })
    if (job.host) params.set('host', job.host)
    if (job.consumerType) params.set('type', job.consumerType)
    fetch(`${API}/history/job?${params.toString()}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Observation history unavailable (${response.status})`)
        return response.json()
      })
      .then((result) => {
        setRows([...latestEpisode(result.items || [], job.at || '')].reverse())
        setError('')
      })
      .catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message || 'Observation history unavailable.') })
    return () => controller.abort()
  }, [job?.at, job?.consumerType, job?.host, job?.key, refreshToken])

  if (!job?.key) return null

  const inspectObservation = (row) => {
    if (!row?.collected_at || !onSelectJob) return
    onSelectJob({
      key: job.key,
      host: row.host || job.host || '',
      consumerType: row.consumer_type || job.consumerType || '',
      source: 'observation-history',
      at: row.collected_at,
      collectionId: row.collection_id || '',
      executionId: row.execution_id || '',
    })
  }

  const selectedAt = Date.parse(job.at || '')

  const content = <>
    {error && <div className="rundeckObservationHistoryState is-error">{error}</div>}
    {!error && <div className="rundeckObservationHistoryTableWrap"><table>
      <thead><tr><th>Time WIB</th><th>Run</th><th>APP</th><th>CPU Usage</th><th>PSS Memory</th><th>Processes</th><th>WP</th><th>Critical WP</th></tr></thead>
      <tbody>{rows.map((row) => {
        const details = row.details || {}
        const pss = rowMetric(row, 'pss')
        const wp = [details.wp_type, details.wp].filter(Boolean).join(' ') || '—'
        const rowAt = Date.parse(row.collected_at || '')
        const inspected = Number.isFinite(selectedAt) && Number.isFinite(rowAt) && Math.abs(rowAt - selectedAt) < 1000
        const actionable = Boolean(onSelectJob && row.collected_at)
        return <tr
          key={`${row.collection_id}-${row.host}-${row.collected_at}`}
          className={[actionable ? 'is-investigable' : '', inspected ? 'is-inspected' : ''].filter(Boolean).join(' ')}
          tabIndex={actionable ? 0 : undefined}
          title={actionable ? 'Inspect this historical observation in Selected Workload. Current dashboard state remains live.' : undefined}
          onClick={actionable ? () => inspectObservation(row) : undefined}
          onKeyDown={actionable ? (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            inspectObservation(row)
          } : undefined}
        >
          <td>{formatWib(row.collected_at, true)}</td>
          <td>#{row.execution_id || String(row.collection_id || '').replace('rundeck-', '') || '—'}</td>
          <td title={row.host}>{shortHost(row.host)}</td>
          <td>{numberText(row.cpu_pct)}%</td>
          <td>{pss === null ? '—' : `${numberText(pss, 2)} GB`}</td>
          <td>{numberText(rowMetric(row, 'processes'), 0)}</td>
          <td>{wp}</td>
          <td>{numberText(row.host_wp_critical, 0)}</td>
        </tr>
      })}{!rows.length && <tr><td colSpan="8">No stored observations for this workload.</td></tr>}</tbody>
    </table></div>}
  </>

  if (embedded) return <section className="rundeckJobExecutionHistory rundeckObservationHistoryV1234 is-embedded" aria-label="Observation History">{content}</section>

  return <details className="rundeckJobExecutionHistory rundeckObservationHistoryV1234">
    <summary><SphereIcon name="history" /> Observation History <span>{error ? 'unavailable' : `${rows.length} observations`}</span></summary>
    {content}
  </details>
}

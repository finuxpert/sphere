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
  const [showAll, setShowAll] = React.useState(false)

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

  React.useEffect(() => setShowAll(false), [job?.at, job?.host, job?.key])

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
  const visibleRows = showAll ? rows : rows.slice(0, 8)
  const cpuValues = rows.map((row) => numeric(row.cpu_pct)).filter((value) => value !== null)
  const pssValues = rows.map((row) => rowMetric(row, 'pss')).filter((value) => value !== null)
  const criticalValues = rows.map((row) => numeric(row.host_wp_critical)).filter((value) => value !== null)
  const firstPss = pssValues.length ? pssValues.at(-1) : null
  const lastPss = pssValues.length ? pssValues[0] : null
  const historySummary = rows.length
    ? [
        cpuValues.length ? `CPU ${numberText(cpuValues.reduce((sum, value) => sum + value, 0) / cpuValues.length, 1)}–${numberText(Math.max(...cpuValues), 1)}%` : '',
        firstPss !== null && lastPss !== null ? `Memory ${numberText(firstPss, 2)}→${numberText(lastPss, 2)} GB` : '',
        criticalValues.length ? `Critical WP ${Math.min(...criticalValues)}–${Math.max(...criticalValues)}` : '',
      ].filter(Boolean).join(' · ')
    : ''

  const content = <>
    {error && <div className="rundeckObservationHistoryState is-error">{error}</div>}
    {!error && <div className="rundeckObservationHistoryTableWrap"><table>
      <thead><tr><th>Time WIB</th><th>Run</th><th>APP</th><th>CPU</th><th>Memory</th><th>Critical WP</th></tr></thead>
      <tbody>{visibleRows.map((row) => {
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
          title={actionable ? 'Open this record in Selected Job / Program.' : undefined}
          onClick={actionable ? () => inspectObservation(row) : undefined}
          onKeyDown={actionable ? (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            inspectObservation(row)
          } : undefined}
        >
          <td>{formatWib(row.collected_at, true)}</td>
          <td><button type="button" className="rundeckHistoryRunButton" title="Open this run timestamp in the selected job chart" onClick={(event) => { event.stopPropagation(); inspectObservation(row) }}>#{row.execution_id || String(row.collection_id || '').replace('rundeck-', '') || '—'}</button></td>
          <td title={row.host}>{shortHost(row.host)}</td>
          <td>{numberText(row.cpu_pct)}%</td>
          <td>{pss === null ? '—' : `${numberText(pss, 2)} GB`}</td>
          <td title={`Processes ${numberText(rowMetric(row, 'processes'), 0)} · WP ${wp}`}>{numberText(row.host_wp_critical, 0)}</td>
        </tr>
      })}{!rows.length && <tr><td colSpan="6">No saved performance records for this job or program.</td></tr>}</tbody>
    </table>{rows.length > 8 && <div className="rundeckObservationHistoryMore"><button type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show latest 8' : `View all ${rows.length}`}</button></div>}</div>}
  </>

  if (embedded) return <section className="rundeckJobExecutionHistory rundeckObservationHistoryV1234 is-embedded" aria-label="Observation History">{content}</section>

  return <details className="rundeckJobExecutionHistory rundeckObservationHistoryV1234">
    <summary>
      <SphereIcon name="history" /> Performance History
      <span>{error ? 'unavailable' : `90D · ${rows.length} records`}</span>
      {historySummary && <small className="rundeckObservationHistorySummary">{historySummary}</small>}
    </summary>
    {content}
  </details>
}

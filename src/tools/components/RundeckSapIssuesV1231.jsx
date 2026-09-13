import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { formatWib, numberText, shortHost } from './sapUiFormat.js'

const API = `${import.meta.env.BASE_URL}api`
const SEVERITY_RANK = { CRITICAL: 4, WARNING: 3, ATTENTION: 2, NORMAL: 1, CLEARED: 0, UNKNOWN: 0 }

const severityFor = (row = {}, value = undefined) => {
  if (row.code === 'WP_CRITICAL') {
    const count = Number(value ?? row.latest_value ?? 0)
    return count >= 3 ? 'CRITICAL' : count > 0 ? 'ATTENTION' : 'NORMAL'
  }
  return String(row.current_severity || row.severity || 'WARNING').toUpperCase()
}

const issueLabel = (value = '') => String(value || 'SAP Issue')
  .replace(/Critical Work Process Count/gi, 'Critical WP')
  .replace(/Critical WP Count/gi, 'Critical WP')
  .replace(/Work Process/gi, 'WP')

const valueText = (value, unit = '') => {
  if (value === null || value === undefined || value === '') return '—'
  const digits = unit === '%' ? 1 : 0
  return `${numberText(value, digits)}${unit || ''}`
}

const durationText = (seconds) => {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value < 60) return '<1m'
  const minutes = Math.floor(value / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

function InlineStatus({ value = 'UNKNOWN' }) {
  return <span className={`rundeckInlineStatus is-${String(value).toLowerCase()}`}>{value}</span>
}

export default function RundeckSapIssuesV1231({ refreshToken = '' }) {
  const [data, setData] = React.useState(null)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    const controller = new AbortController()
    fetch(`${API}/history/incidents?days=1&limit=200`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail || `SAP issues unavailable (${response.status})`)
        }
        return response.json()
      })
      .then((result) => {
        setData(result)
        setError('')
      })
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message || 'SAP issues unavailable')
      })
    return () => controller.abort()
  }, [refreshToken])

  const items = (data?.items || [])
    .filter((row) => row.state === 'ACTIVE')
    .sort((left, right) => {
      const leftSeverity = severityFor(left, left.latest_value)
      const rightSeverity = severityFor(right, right.latest_value)
      const severityDelta = (SEVERITY_RANK[rightSeverity] || 0) - (SEVERITY_RANK[leftSeverity] || 0)
      if (severityDelta) return severityDelta
      return Number(right.duration_seconds || 0) - Number(left.duration_seconds || 0)
    })

  const activeCount = Number(data?.active ?? items.length)
  const resolvedCount = Number(data?.resolved ?? 0)

  return <section className="rundeckSapIssuesV1231" aria-label="Active SAP issues">
    <header>
      <h3><SphereIcon name="alert" /> SAP Issues</h3>
      <span>{error ? 'unavailable' : `${activeCount} active · ${resolvedCount} resolved`}</span>
    </header>

    {error && !data && <div className="rundeckReviewState is-error">SAP issue data unavailable.</div>}

    {!error && data && <div className="rundeckSapIssuesTableWrap">
      <table className="rundeckSapIssuesTableV1231">
        <thead><tr><th>APP</th><th>Issue</th><th>Now</th><th>Peak</th><th>Duration</th></tr></thead>
        <tbody>
          {items.map((row) => {
            const severity = severityFor(row, row.latest_value)
            const peakSeverity = row.peak_severity || severityFor(row, row.peak_value)
            const title = [
              row.first_seen ? `First seen ${formatWib(row.first_seen, true)} WIB` : '',
              row.last_seen ? `Last seen ${formatWib(row.last_seen, true)} WIB` : '',
              `Peak severity ${peakSeverity}`,
            ].filter(Boolean).join('\n')
            return <tr key={row.id} title={title}>
              <td><strong>{shortHost(row.host || 'APP')}</strong></td>
              <td>{issueLabel(row.signal || row.code)}</td>
              <td><span className="rundeckIssueNowV1231"><strong>{valueText(row.latest_value, row.unit)}</strong><InlineStatus value={severity} /></span></td>
              <td>{valueText(row.peak_value, row.unit)}</td>
              <td>{durationText(row.duration_seconds)}</td>
            </tr>
          })}
          {!items.length && <tr><td colSpan="5">No active SAP issues.</td></tr>}
        </tbody>
      </table>
    </div>}
  </section>
}

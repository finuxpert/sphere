import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { formatWib, numberText, shortHost, workloadTypeLabel, observedWorkloadName, isUnresolvedSapIdentity } from './sapUiFormat.js'
import './RundeckCurrentWorkload.css'
import { processCount } from './rundeckWorkloadMetrics.js'

const API = `${import.meta.env.BASE_URL}api`
const CPU_HINT = 'CPU Total is the grouped multi-core workload CPU observation. It can exceed 100 percent when the workload uses more than one CPU core or process.'
const STALE_MINUTES = 15

function jobContext(row) {
  if (!row?.consumer_key) return null
  return {
    key: row.consumer_key,
    host: row.host || '',
    consumerType: row.consumer_type || '',
    source: 'current-workload',
    cpuPct: row.cpu_pct ?? null,
    memoryGb: pssGb(row),
    processes: processCount(row.details || {}),
    wp: wpText(row.details || {}),
    criticalWp: row.host_wp_critical ?? null,
  }
}

function pssGb(row = {}) {
  const raw = row.details?.total_pss_gb ?? row.details?.pss_gb
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function wpText(details = {}) {
  return [details.wp_type, details.wp].filter(Boolean).join(' ') || '—'
}

function relativeAge(value, nowMs) {
  const observed = Date.parse(value || '')
  if (!Number.isFinite(observed)) return ''
  const minutes = Math.max(0, Math.floor((nowMs - observed) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m ago` : `${hours}h ago`
}

function ageMinutes(value, nowMs) {
  const observed = Date.parse(value || '')
  return Number.isFinite(observed) ? Math.max(0, Math.floor((nowMs - observed) / 60000)) : null
}

function identitySummary(row = {}) {
  const details = row.details || {}
  const type = String(row.consumer_type || '').toUpperCase()
  const workload = String(row.consumer_key || '').trim()
  const jobName = String(details.job_name || '').trim()
  const program = String(details.program || '').trim()
  const processes = processCount(details)
  const wp = wpText(details)
  const pid = String(details.pid || '').trim()
  const parts = []

  const related = type === 'JOB'
    ? program
    : type === 'PROGRAM'
      ? jobName
      : program || jobName
  if (related && !isUnresolvedSapIdentity(related) && related.toUpperCase() !== workload.toUpperCase()) parts.push(related)
  if (wp !== '—') parts.push(wp)
  if (pid) parts.push(`PID ${pid}`)
  if (processes > 1) parts.push(`${processes} proc`)
  return parts.join(' · ') || workloadTypeLabel(row.consumer_type)
}

function hasReviewSignal(row = {}) {
  const details = row.details || {}
  const status = String(row.review_status || row.status || '').toUpperCase()
  const anomaly = String(row.anomaly_status || details.anomaly_status || '').toUpperCase()
  return Boolean(
    row.review_required ||
    details.review_required ||
    ['REVIEW REQUIRED', 'ATTENTION', 'CRITICAL'].includes(status) ||
    ['ABOVE BASELINE', 'ANOMALY'].includes(anomaly)
  )
}

function identityTitle(row = {}) {
  const details = row.details || {}
  const values = []
  const push = (label, value) => {
    const text = Array.isArray(value) ? value.filter(Boolean).join(', ') : String(value || '').trim()
    if (text) values.push(`${label}: ${text}`)
  }
  push('APP Server', row.host)
  push('Job Name', details.job_name || (String(row.consumer_type || '').toUpperCase() === 'JOB' ? row.consumer_key : ''))
  push('ABAP Program', details.program || (String(row.consumer_type || '').toUpperCase() === 'PROGRAM' ? row.consumer_key : ''))
  push('Work Process', details.wps?.length ? details.wps.map((value) => `${details.wp_type || ''} ${value}`.trim()) : wpText(details) === '—' ? '' : wpText(details))
  push('PID', details.pids?.length ? details.pids : details.pid)
  push('SAP User', details.users?.length ? details.users : details.user)
  push('Client', details.client || details.mandt || details.sap_client)
  push('Transaction', details.transaction || details.tcode || details.transaction_code)
  push('Report', details.report)
  return values.join(' | ')
}

export default function RundeckCurrentWorkload({ collectionId = '', selectedJob = null, onSelectJob, onSelectedContext, compactLimit = 50, embedded = false }) {
  const [rows, setRows] = React.useState([])
  const [workloadMeta, setWorkloadMeta] = React.useState({ total: 0, coverageScope: '' })
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [loadedSearch, setLoadedSearch] = React.useState('')
  const [listPage,setListPage]=React.useState(0)
  const [nowMs, setNowMs] = React.useState(() => Date.now())
  const [viewportHeight, setViewportHeight] = React.useState(() => typeof window === 'undefined' ? 768 : window.innerHeight)

  React.useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight)
    window.addEventListener('resize', onResize, { passive: true })
    return () => window.removeEventListener('resize', onResize)
  }, [])

  React.useEffect(() => {
    if (!collectionId) {
      setRows([])
      setWorkloadMeta({ total: 0, coverageScope: '' })
      return undefined
    }
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(`${API}/history/jobs/current?collection_id=${encodeURIComponent(collectionId)}&limit=50`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail || `Current SAP Workload unavailable (${response.status})`)
        }
        return response.json()
      })
      .then((result) => {
        setRows(result.items || [])
        setWorkloadMeta({ total: Number(result.total || 0), coverageScope: String(result.coverage_scope || '') })
        setNowMs(Date.now())
      })
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message || 'Current SAP Workload unavailable')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [collectionId])

  React.useEffect(() => {
    if (!rows.length) return undefined
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [rows.length])

  React.useEffect(() => {
    if (!selectedJob?.key || !selectedJob?.host || !onSelectedContext || !rows.length) return
    const match = rows.find((row) => (
      row.consumer_key === selectedJob.key &&
      row.host === selectedJob.host &&
      (!selectedJob.consumerType || row.consumer_type === selectedJob.consumerType)
    ))
    if (!match) return
    const context = jobContext(match)
    if (!context) return
    const changed = ['cpuPct', 'memoryGb', 'processes', 'wp', 'criticalWp'].some((key) => context[key] !== selectedJob[key])
    if (changed) onSelectedContext(context)
  }, [rows, selectedJob, onSelectedContext])

  const sortedRows = [...rows].sort((left, right) => Number(right.cpu_pct || 0) - Number(left.cpu_pct || 0))
  const visibleLimit = Math.max(1, Number(compactLimit || 50))
  const loaded = sortedRows.slice(0, visibleLimit)
  const query = loadedSearch.trim().toLocaleLowerCase()
  const visible = query ? loaded.filter((row) => {
    const d = row.details || {}
    return [row.host,row.consumer_key,d.job_name,d.program,d.pid,
      ...(Array.isArray(d.pids) ? d.pids : []),d.wp,d.wp_type]
      .some(value => String(value ?? '').toLocaleLowerCase().includes(query))
  }) : loaded
  // Keep pagination aligned with the viewport's available table height.
  // Rows are still actual loaded observations; no synthetic results or truncation.
  const pageSize = viewportHeight <= 720 ? 3 : viewportHeight <= 900 ? 4 : viewportHeight <= 1080 ? 5 : 7
  const totalPages=Math.max(1,Math.ceil(visible.length/pageSize))
  const currentPage=Math.min(listPage,totalPages-1)
  const pageRows=visible.slice(currentPage*pageSize,(currentPage+1)*pageSize)
  const latestObservedAt = rows.reduce((latest, row) => {
    const timestamp = Date.parse(row.collected_at || '')
    return Number.isFinite(timestamp) && timestamp > Date.parse(latest || '') ? row.collected_at : latest
  }, rows[0]?.collected_at || '')
  const freshness = latestObservedAt ? relativeAge(latestObservedAt, nowMs) : ''
  const freshnessMinutes = latestObservedAt ? ageMinutes(latestObservedAt, nowMs) : null
  const showFreshness = freshnessMinutes !== null && freshnessMinutes >= STALE_MINUTES

  return <section className="rundeckCurrentWorkload" aria-label="Current SAP jobs and programs">
    <div className={`rundeckCurrentWorkloadHead${embedded ? ' is-embedded' : ''}`}>
      {!embedded && <h3><SphereIcon name="workload" /> Current Jobs & Programs</h3>}
      <span className="rundeckCurrentWorkloadCount" title="Observed count from API; Live search and pagination cover only loaded rows. Use historical Search for all saved observations.">{workloadMeta.total > rows.length ? `${workloadMeta.total} observed · ${rows.length} loaded` : `${workloadMeta.total || rows.length} observed · ${rows.length} loaded`}</span>
      <div className="rundeckCurrentWorkloadTools">
        <label className="rundeckCurrentWorkloadSearch">
          <span>Search {rows.length} loaded rows</span>
          <input type="search" aria-label={`Search ${loaded.length} loaded jobs and programs only`} placeholder={`Search ${loaded.length} loaded rows`} value={loadedSearch} onChange={event => {setLoadedSearch(event.target.value);setListPage(0)}} />
        </label>
        {showFreshness && <span className="rundeckWorkloadFreshness is-stale" title="Age of the latest stored Rundeck workload observation">STALE · {formatWib(latestObservedAt, true)} WIB · {freshness}</span>}
      </div>
    </div>

    {loading && <div className="rundeckCurrentWorkloadState">Loading jobs and programs…</div>}
    {error && <div className="rundeckCurrentWorkloadState is-error">{error}</div>}

    {!loading && !error && <div className="rundeckCurrentWorkloadTableWrap">
      <table>
        <thead><tr><th>APP</th><th>Job / Program</th><th title={CPU_HINT}>CPU Total ↓</th><th>PSS Memory</th><th>Processes</th><th title="SAP work process type / number context">WP Context</th><th title="Last retained workload observation time in WIB, not an SM37 completion time">Observed At</th></tr></thead>
        <tbody>
          {pageRows.map((row) => {
            const details = row.details || {}
            const context = jobContext(row)
            const active = context && selectedJob?.key === context.key && selectedJob?.host === context.host
            const pss = pssGb(row)
            const cpu = Number(row.cpu_pct)
            const cpuNeedsAttention = hasReviewSignal(row)
            const processes = processCount(details)
            const identity = identitySummary(row)
            const fullIdentity = identityTitle(row)
            return <tr
              key={`${row.collection_id}-${row.host}-${row.consumer_type}-${row.consumer_key}`}
              className={active ? 'is-selected' : ''}
              onClick={context ? () => onSelectJob?.(context) : undefined}
            >
              <td title={row.host}>{shortHost(row.host)}</td>
              <td className="rundeckCurrentWorkloadName">
                <button type="button" onClick={(event) => { event.stopPropagation(); context && onSelectJob?.(context) }} title={row.consumer_key}>{observedWorkloadName(row.consumer_key, details)}</button>
                <small title={fullIdentity || identity}>{identity}</small>
              </td>
              <td title={CPU_HINT} className={Number.isFinite(cpu) && cpuNeedsAttention ? 'is-attention' : ''}>{numberText(row.cpu_pct)}%</td>
              <td>{pss === null ? '—' : `${numberText(pss, 2)} GB`}</td>
              <td>{processes === null ? '—' : numberText(processes, 0)}</td>
              <td>{wpText(details)}</td>
               <td title="Last saved workload observation, not job end time">{row.collected_at ? `${formatWib(row.collected_at,true)} WIB` : '—'}</td>
            </tr>
          })}
          {!visible.length && <tr><td colSpan="7">{query
            ? <>No matching job or program in the {loaded.length} loaded rows. {rows.length ? 'Use Search for retained history.' : 'No workload observations loaded for this collection.'}</>
            : 'No job or program observed in this collection.'}</td></tr>}
        </tbody>
      </table>
    </div>}
    {!loading&&!error&&visible.length>0&&<nav className="rundeckWorkloadPager" aria-label="Loaded job pages">
      <small>{visible.length} matching of {loaded.length} loaded · Page {currentPage+1}/{totalPages}</small>
      <button type="button" disabled={currentPage===0} onClick={()=>setListPage(n=>Math.max(0,n-1))}>Previous</button>
      <button type="button" disabled={currentPage>=totalPages-1} onClick={()=>setListPage(n=>Math.min(totalPages-1,n+1))}>Next</button>
    </nav>}
  </section>
}
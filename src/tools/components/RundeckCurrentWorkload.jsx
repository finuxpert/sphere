import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { formatWib, numberText, shortHost, workloadTypeLabel, observedWorkloadName, isUnresolvedSapIdentity } from './sapUiFormat.js'
import './RundeckCurrentWorkload.css'
import { processCount, workloadCpuSignal } from './rundeckWorkloadMetrics.js'
import { workloadRowsThatFit, workloadPagerReserve } from './rundeckWorkloadViewport.js'
import { combineCurrentWorkloadResponses } from './rundeckCurrentWorkloadCoverage.js'
import RundeckManualAttention from './RundeckManualAttention.jsx'
import {attentionKey,attentionSnapshot} from './rundeckManualAttention.js'

const API = `${import.meta.env.BASE_URL}api`
const CPU_HINT = 'Workload CPU Total (%) is a grouped multi-core observation and can exceed 100%. It is not APP host CPU (%); SAP execution status is verified separately in SM37.'
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

export default function RundeckCurrentWorkload({ collectionId = '', selectedJob = null, onSelectJob, onSelectedContext, compactLimit = 100, sourceHosts = [], layoutKey = '', embedded = false }) {
  const [rows, setRows] = React.useState([])
  const [workloadMeta, setWorkloadMeta] = React.useState({ total: 0, coverageScope: '' })
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [loadedSearch, setLoadedSearch] = React.useState('')
  const [hostFilter, setHostFilter] = React.useState('ALL')
  const [listPage,setListPage]=React.useState(0)
  const [nowMs, setNowMs] = React.useState(() => Date.now())
  const [viewportHeight, setViewportHeight] = React.useState(() => typeof window === 'undefined' ? 768 : window.innerHeight)
  const [fittedRows, setFittedRows] = React.useState(null)
  const tableWrapRef = React.useRef(null)
  const pagerRef = React.useRef(null)
  const [attentionRows,setAttentionRows] = React.useState([])
  const [attentionPreview,setAttentionPreview] = React.useState(null)
  const [attentionOpen,setAttentionOpen] = React.useState(false)
  const closeAttention=React.useCallback(()=>setAttentionOpen(false),[])
  const markAttention=(snapshot,checked)=>{
    if(!snapshot)return
    setAttentionRows(items=>checked?[...items.filter(r=>r.id!==snapshot.id),snapshot]:items.filter(r=>r.id!==snapshot.id))
    if(checked)setAttentionPreview(snapshot)
  }

  React.useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight)
    window.addEventListener('resize', onResize, { passive: true })
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const hostKey = sourceHosts.map(row => String(row?.host || '').trim().toUpperCase()).filter(Boolean).sort().join(',')
  React.useEffect(() => {
    if (!collectionId) {
      setRows([])
      setWorkloadMeta({ total: 0, coverageScope: '' })
      setHostFilter('ALL')
      return undefined
    }
    const controller = new AbortController()
    const hosts = [...new Set(hostKey.split(',').filter(Boolean))]
    const limit = Math.max(1, Math.min(100, Number(compactLimit) || 100))
    const paths = hosts.length ? hosts.map(host =>
      `${API}/history/jobs/current?collection_id=${encodeURIComponent(collectionId)}&host=${encodeURIComponent(host)}&limit=${limit}`
    ) : [`${API}/history/jobs/current?collection_id=${encodeURIComponent(collectionId)}&limit=${limit}`]
    setRows([])
    setHostFilter('ALL')
    setListPage(0)
    setLoading(true)
    setError('')
    Promise.all(paths.map(path => fetch(path, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail || `Current SAP Workload unavailable (${response.status})`)
        }
        return response.json()
      })))
      .then(results => {
        if (controller.signal.aborted) return
        const merged = combineCurrentWorkloadResponses(results, collectionId)
        setRows(merged.items)
        setWorkloadMeta({ total: merged.total, coverageScope: merged.coverageScope })
        setNowMs(Date.now())
      })
      .catch(failure => {
        if (failure.name !== 'AbortError' && !controller.signal.aborted) setError(failure.message || 'Current SAP Workload unavailable')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [collectionId, compactLimit, hostKey])
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
  const loaded = sortedRows
  const availableHosts = [...new Set(rows.map(row => row.host).filter(Boolean))].sort()
  const allLoaded = workloadMeta.total === rows.length
  const coverageLabel = workloadMeta.coverageScope === 'ALL_OBSERVED_ACTIVE_WORKLOADS'
    ? 'current run · observed'
    : workloadMeta.coverageScope === 'TOP_CONSUMERS_ONLY'
      ? 'top consumers only'
      : 'coverage unverified'
  const query = loadedSearch.trim().toLocaleLowerCase()
  const visible = loaded.filter(row => {
    if (hostFilter !== 'ALL' && row.host !== hostFilter) return false
    if (!query) return true
    const d = row.details || {}
    return [row.host,row.consumer_key,d.job_name,d.program,d.pid,
      ...(Array.isArray(d.pids) ? d.pids : []),d.wp,d.wp_type]
      .some(value => String(value ?? '').toLocaleLowerCase().includes(query))
  })

  const defaultPageSize = viewportHeight <= 720 ? 2 : viewportHeight <= 940 ? 3 : viewportHeight <= 1100 ? 4 : 5
  React.useLayoutEffect(() => {
    if (typeof window === 'undefined') return undefined
    const wrap = tableWrapRef.current
    const measure = () => {
      if (window.innerWidth < 1200 || !visible.length) {
        setFittedRows(null)
        return
      }
      if (!wrap) return
      const header = wrap.querySelector('thead tr')
      const firstRow = wrap.querySelector('tbody tr')
      if (!header || !firstRow) return
      const next = workloadRowsThatFit({
        viewportHeight: window.innerHeight,
        tableTop: wrap.getBoundingClientRect().top,
        headerHeight: header.getBoundingClientRect().height,
        rowHeight: firstRow.getBoundingClientRect().height,
        reserveBelow: workloadPagerReserve(pagerRef.current?.getBoundingClientRect().height),
        maxRows: defaultPageSize,
      })
      setFittedRows(old => old === next ? old : next)
    }
    // Re-measure when the three-trend area or workload geometry changes after
    // async data loading. Keep pager + footer visible without hiding real rows.
    let frame = 0
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(measure)
    }
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure)
    const trendPanel = document.querySelector('.rundeckTripleTrendV13457')
    if (wrap) resizeObserver?.observe(wrap)
    if (pagerRef.current) resizeObserver?.observe(pagerRef.current)
    if (trendPanel) resizeObserver?.observe(trendPanel)
    measure()
    window.addEventListener('resize', scheduleMeasure, { passive: true })
    window.visualViewport?.addEventListener('resize', scheduleMeasure, { passive: true })
    return () => {
      window.cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
      window.visualViewport?.removeEventListener('resize', scheduleMeasure)
    }
  }, [visible.length, viewportHeight, defaultPageSize, layoutKey])
  const pageSize = fittedRows === null ? defaultPageSize : Math.min(defaultPageSize, fittedRows)
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
      <button type="button" className="sphereAttentionTrigger" onClick={()=>setAttentionOpen(true)} aria-label={`Open manual Attention List, ${attentionRows.length} marked workloads`}>Attention List <b>{attentionRows.length}</b></button>
       <span className="rundeckCurrentWorkloadCount" title="Workload observations for the latest collection only. This count is not the saved 1D evaluation population in Workload Health. Coverage is source-specific; per-APP API is capped at 100 rows and unloaded records cannot be searched here.">{allLoaded ? `${rows.length} saved · ${coverageLabel}` : `${rows.length}/${workloadMeta.total} loaded · ${coverageLabel}`}</span>
      <div className="rundeckCurrentWorkloadTools">
        <select className="rundeckWorkloadHostFilter" aria-label="Filter workload APP" title="Independent from selected APP Trend focus. All APP includes saved workload observations from all loaded APP hosts." value={hostFilter} onChange={event => {setHostFilter(event.target.value);setListPage(0)}}>
          <option value="ALL">All APP · global</option>
          {availableHosts.map(host => <option key={host} value={host}>{shortHost(host)}</option>)}
        </select>
        <label className="rundeckCurrentWorkloadSearch">
          <span>Search {rows.length} observations</span>
          <input type="search" aria-label={`Search ${rows.length} loaded jobs and programs`} placeholder="Search job / program" value={loadedSearch} onChange={event => {setLoadedSearch(event.target.value);setListPage(0)}} />
        </label>
        {showFreshness && <span className="rundeckWorkloadFreshness is-stale" title="Age of the latest stored Rundeck workload observation">STALE · {formatWib(latestObservedAt, true)} WIB · {freshness}</span>}
      </div>
    </div>

    {loading && <div className="rundeckCurrentWorkloadState">Loading jobs and programs…</div>}
    {error && <div className="rundeckCurrentWorkloadState is-error">{error}</div>}

    {!loading && !error && <div className="rundeckCurrentWorkloadTableWrap" ref={tableWrapRef}>
      <table>
        <thead><tr><th>APP</th><th>Job / Program</th><th title={CPU_HINT}>CPU Total ↓<small className="rundeckWorkloadCpuUnit">multi-core</small></th><th title="Proportional Set Size; workload memory in gigabytes, not APP host RAM">PSS (GB)</th><th>Processes</th><th title="SAP work process type / number context">WP Context</th><th title="Last retained workload observation time in WIB, not an SM37 completion time">Observed</th></tr></thead>
        <tbody>
          {pageRows.map((row) => {
            const details = row.details || {}
            const context = jobContext(row)
            const active = context && selectedJob?.key === context.key && selectedJob?.host === context.host
            const pss = pssGb(row)
            const cpu = row.cpu_pct === null || row.cpu_pct === undefined || row.cpu_pct === '' ? null : Number(row.cpu_pct)
            const cpuNeedsAttention = workloadCpuSignal(row)
            const processes = processCount(details)
            const identity = identitySummary(row)
            const fullIdentity = identityTitle(row)
            const attentionId=attentionKey(row)
            const marked=attentionId&&attentionRows.some(item=>item.id===attentionId)
            const snapshot=attentionSnapshot(row,context,observedWorkloadName(row.consumer_key,details),fullIdentity)
            return <tr
              key={`${row.collection_id}-${row.host}-${row.consumer_type}-${row.consumer_key}`}
              className={[active?'is-selected':'',marked?'is-manually-marked':''].filter(Boolean).join(' ')}
              onClick={context ? () => onSelectJob?.(context) : undefined}
              onMouseEnter={()=>snapshot&&setAttentionPreview(snapshot)}
              onFocusCapture={()=>snapshot&&setAttentionPreview(snapshot)}
            >
              <td title={row.host}><label className="sphereAttentionMark" title="Manual attention, not SAP job status">
                <input type="checkbox" disabled={!snapshot} checked={Boolean(marked)}
                  aria-label={`Mark ${snapshot?.name||row.consumer_key} on ${shortHost(row.host)} for manual attention`}
                  onClick={event=>event.stopPropagation()}
                  onChange={event=>{event.stopPropagation();markAttention(snapshot,event.target.checked)}} />
                {shortHost(row.host)}
              </label></td>
              <td className="rundeckCurrentWorkloadName">
                <button type="button" onClick={(event) => { event.stopPropagation(); context && onSelectJob?.(context) }} title={row.consumer_key}>{observedWorkloadName(row.consumer_key, details)}</button>
                <small title={fullIdentity || identity}>{identity}</small>
              </td>
              <td title={CPU_HINT} className={Number.isFinite(cpu) && cpu >= 0 && cpuNeedsAttention ? 'is-attention' : ''}>{Number.isFinite(cpu) && cpu >= 0 ? numberText(cpu) + '%' : '—'}</td>
              <td>{pss === null ? '—' : `${numberText(pss, 2)} GB`}</td>
              <td>{processes === null ? '—' : numberText(processes, 0)}</td>
              <td>{wpText(details)}</td>
               <td title={row.collected_at ? `Saved observation: ${formatWib(row.collected_at,true)} WIB, not job completion` : 'Observation time unavailable'}>{row.collected_at ? formatWib(row.collected_at,true) : '—'}</td>
            </tr>
          })}
          {!visible.length && <tr><td colSpan="7">{query
            ? <>No matching job or program in {rows.length} loaded observations. {!allLoaded ? 'Some observations are not loaded; use historical Search.' : ''}</>
            : 'No job or program observed in this collection.'}</td></tr>}
        </tbody>
      </table>
    </div>}
    {!loading&&!error&&visible.length>0&&<nav ref={pagerRef} className="rundeckWorkloadPager" aria-label="Current collection workload pages">
      <small>{query || hostFilter !== 'ALL' ? `${visible.length} matches · ${rows.length} loaded` : `Showing ${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, visible.length)} of ${visible.length}`}</small>
      <label className="rundeckWorkloadPageJump">
        <span>Page</span>
        <select aria-label="Jump to workload page" value={currentPage}
          onChange={event=>setListPage(Number(event.target.value))}>
          {Array.from({length:totalPages},(_,page)=><option key={page} value={page}>{page+1}/{totalPages}</option>)}
        </select>
      </label>
      <button type="button" disabled={currentPage===0} onClick={()=>setListPage(n=>Math.max(0,n-1))}>Previous</button>
      <button type="button" disabled={currentPage>=totalPages-1} onClick={()=>setListPage(n=>Math.min(totalPages-1,n+1))}>Next</button>
    </nav>}
    <RundeckManualAttention open={attentionOpen} rows={attentionRows} preview={attentionPreview}
      onClose={closeAttention} onRemove={id=>setAttentionRows(items=>items.filter(row=>row.id!==id))}
      onClear={()=>setAttentionRows([])}
      onOpenJob={entry=>entry.context&&onSelectJob?.(entry.context)} />
  </section>
}
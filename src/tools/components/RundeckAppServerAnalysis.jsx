import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { shortHost, observedWorkloadName, formatWib } from './sapUiFormat.js'
import './RundeckAppServerAnalysis.css'

const API = `${import.meta.env.BASE_URL}api`
const metric = (value, suffix = '') => value === null || value === undefined || value === '' ? '—' : `${Number(value).toLocaleString('en-US',{maximumFractionDigits:1})}${suffix}`

const pssText = (row = {}) => {
  const raw = row.details?.total_pss_gb ?? row.details?.pss_gb
  const value = Number(raw)
  return raw != null && String(raw).trim() !== '' && Number.isFinite(value) && value >= 0 ? `${value.toLocaleString('en-US',{maximumFractionDigits:2})} GB` : '—'
}
const processText = (row = {}) => {
  const raw = row.details?.process_count ?? row.details?.pids?.length
  const value = Number(raw)
  return raw != null && String(raw).trim() !== '' && Number.isInteger(value) && value >= 0 ? value.toLocaleString('en-US',{maximumFractionDigits:0}) : '—'
}
/** Reject mixed collection/APP payloads; request parameters alone do not prove source identity. */
function validateAppWorkloadResponse(result, collectionId, host) {
  const same = (left, right) => String(left || '').trim().toUpperCase() === String(right || '').trim().toUpperCase()
  if (!collectionId || !host || !result || String(result.collection_id || '') !== String(collectionId) ||
      !same(result.host, host) || !Array.isArray(result.items) ||
      (result.total === null || result.total === undefined || result.total === '') ||
      !Number.isSafeInteger(Number(result.total)) || Number(result.total) < result.items.length) return false
  const unique = new Set()
  for (const row of result.items) {
    if (!row || String(row.collection_id || '') !== String(collectionId) || !same(row.host, host) ||
        !['JOB', 'PROGRAM'].includes(String(row.consumer_type || '').toUpperCase()) ||
        !String(row.consumer_key || '').trim()) return false
    const key = String(row.consumer_type).toUpperCase() + ':' + String(row.consumer_key)
    if (unique.has(key)) return false
    unique.add(key)
  }
  return true
}

const processIdentity = (details = {}) => {
  const values = (plural, singular) => {
    const items = Array.isArray(details[plural]) && details[plural].length
      ? details[plural] : details[singular] == null || details[singular] === '' ? [] : [details[singular]]
    return [...new Set(items.map(value => String(value).trim()).filter(Boolean))]
  }
  const pids = values('pids', 'pid')
  const wps = values('wps', 'wp')
  const wp = wps.length ? (details.wp_type ? details.wp_type + ' ' : '') + wps.join(', ') :
    String(details.wp_type || '').trim()
  const full = [wp && 'WP ' + wp, pids.length && 'PID ' + pids.join(', ')].filter(Boolean).join(' · ')
  const short = [wp && 'WP ' + wp, pids.length && 'PID ' + pids.slice(0, 2).join(', ') + (pids.length > 2 ? ' +' + (pids.length - 2) : '')].filter(Boolean).join(' · ')
  return { short: short || '—', full: full || 'Process identifiers not retained' }
}

const durationText = (seconds) => {
  if (seconds == null || String(seconds).trim() === '') return '—'
  const value = Number(seconds)
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value < 60) return '<1m'
  const minutes = Math.floor(value / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

export default function RundeckAppServerAnalysis({ app, latestCollectionId = '', refreshToken = '', onSelectJob }) {
  const [rows,setRows]=React.useState([])
  const [workloadMeta,setWorkloadMeta]=React.useState({total:0,coverage_scope:'',collectionId:'',host:''})
  const [loading,setLoading]=React.useState(false)
  const [error,setError]=React.useState('')
  const [incident,setIncident]=React.useState(null)
  const [hostSnapshot,setHostSnapshot]=React.useState(app)

  React.useEffect(()=>{
    setRows([])
    setWorkloadMeta({total:0,coverage_scope:'',collectionId:'',host:''})
    setIncident(null)
    setHostSnapshot(app)
    if(!app?.host || !latestCollectionId) { setLoading(false); setError(''); return undefined }
    const controller=new AbortController()
    setLoading(true); setError('')
    Promise.all([
      fetch(`${API}/history/jobs/current?collection_id=${encodeURIComponent(latestCollectionId)}&host=${encodeURIComponent(app.host)}&limit=100`,{cache:'no-store',signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error(`Job / Program detail unavailable (${r.status})`);return r.json()}),
      fetch(`${API}/analysis/performance`,{cache:'no-store',signal:controller.signal}).then(r=>r.ok?r.json():null).catch(()=>null),
      fetch(`${API}/history/hosts/latest`,{cache:'no-store',signal:controller.signal}).then(r=>r.ok?r.json():null).catch(()=>null),
    ]).then(([result,analysis,hosts])=>{
      if (controller.signal.aborted) return
      if (!validateAppWorkloadResponse(result, latestCollectionId, app.host)) {
        throw new Error('APP workload data does not match selected collection or host')
      }
      const hostRows=[...result.items].sort((a,b)=>Number(b.cpu_pct||0)-Number(a.cpu_pct||0))
      const candidates = (hosts?.items || []).filter(row =>
        String(row.host || '').trim().toUpperCase() === String(app.host).trim().toUpperCase())
      const aliases = (hosts?.items || []).filter(row => shortHost(row.host) === shortHost(app.host))
      const latestHost = candidates[0] || (aliases.length === 1 ? aliases[0] : null)
      const hostCollection = latestHost?.collection_id
      const alignedHost = latestHost && String(hostCollection || '') === String(latestCollectionId)
      setRows(hostRows)
      setWorkloadMeta({total:Number(result.total),coverage_scope:String(result.coverage_scope||'UNKNOWN'),
        collectionId:result.collection_id,host:result.host})
      setHostSnapshot(alignedHost ? {...app,...latestHost} : app)
      setIncident(analysis?.active &&
        String(analysis.collection_id || '') === String(latestCollectionId) &&
        shortHost(analysis.affected_server||'') === shortHost(app.host) ? analysis : null)
    }).catch(failure=>{
      if(failure.name!=='AbortError' && !controller.signal.aborted) {
        setRows([])
        setError(failure.message||'APP analysis unavailable')
      }
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[app,latestCollectionId,refreshToken])

  if(!app) return null
  const matchedCollection = Boolean(latestCollectionId) && workloadMeta.collectionId === latestCollectionId &&
    String(workloadMeta.host || '').trim().toUpperCase() === String(app.host || '').trim().toUpperCase()
  const displayRows = matchedCollection ? rows : []
  const resolvedApp=matchedCollection && hostSnapshot?.host === app.host ? hostSnapshot : app
  const hostLabel=shortHost(resolvedApp.host)
  return <section className="rundeckAppServerAnalysis" aria-label={`${hostLabel} APP server analysis`}>
    <div className="rundeckAppServerSummary">
      <span><b>CPU</b>{metric(resolvedApp.cpu_pct,'%')}</span>
      <span><b>Memory</b>{metric(resolvedApp.ram_pct,'%')}</span>
      <span><b>I/O Wait</b>{metric(resolvedApp.io_wait_pct,'%')}</span>
      <span><b>APP Critical WP</b>{metric(resolvedApp.wp_critical)}</span>
    </div>

    {incident && matchedCollection && <div className="rundeckAppServerIssue">
      <SphereIcon name="alert" />
      <div><strong>Recorded incident · Critical WP</strong><small>Duration: {durationText(incident.duration_seconds)} · Peak: {metric(incident.primary_signal?.peak ?? incident.peak_value ?? resolvedApp.wp_critical)}</small></div>
    </div>}

    <section className="rundeckAppServerWorkloads">
      <header>
        <div><span>Performance Collection</span><h4>Job / Program observations · {hostLabel}</h4></div>
        <small>{matchedCollection ? `${displayRows.length} loaded / ${workloadMeta.total} stored` : 'Collection not verified'}</small>
      </header>
      {!latestCollectionId && <div className="rundeckAppServerState">Performance collection identity unavailable; workload observations not verified.</div>}
      {loading && <div className="rundeckAppServerState">Loading jobs and programs…</div>}
      {error && <div className="rundeckAppServerState is-error">{error}</div>}
      {!loading && !error && matchedCollection && <><div className="rundeckAppServerSource">Coverage: {workloadMeta.coverage_scope === 'ALL_OBSERVED_ACTIVE_WORKLOADS' ? 'All observed workloads' :
  workloadMeta.coverage_scope === 'TOP_CONSUMERS_ONLY' ? 'Top consumers only' : 'Coverage unverified'} | Collection: {latestCollectionId} | APP: {hostLabel} · Workload CPU is grouped, not host CPU or SM37 status</div><div className="rundeckAppServerTableWrap"><table>
        <thead><tr>
          <th>Job / Program</th><th title="Grouped multi-core workload CPU; may exceed 100%, not host CPU">CPU Total</th>
          <th title="Proportional Set Size, grouped workload memory in GB">PSS</th>
          <th>Processes</th><th>WP / PID</th><th>Observed At</th>
        </tr></thead>
        <tbody>
          {displayRows.map(row=>{
            const identity=processIdentity(row.details || {})
            return <tr key={`${row.collection_id}-${row.host}-${row.consumer_type}-${row.consumer_key}`} tabIndex={0} role="button"
              onClick={()=>onSelectJob?.({key:row.consumer_key,host:row.host,consumerType:row.consumer_type,source:'app-server-analysis'})}
              onKeyDown={(event)=>{if(event.key!=='Enter'&&event.key!==' ')return;event.preventDefault();onSelectJob?.({key:row.consumer_key,host:row.host,consumerType:row.consumer_type,source:'app-server-analysis'})}}>
              <td>
                <strong title={row.consumer_key}>{observedWorkloadName(row.consumer_key, row.details)}</strong>
                <small title={`Observed identity: ${row.details?.identity_source || 'SAP workload observation'}; not SM37 execution status`}><span className={`rundeckAppTypeBadge is-${String(row.consumer_type||'unknown').toLowerCase()}`}>{String(row.consumer_type||'—').toUpperCase()}</span> {observedWorkloadName(row.details?.program || row.details?.job_name || '', row.details) || ''}</small>
              </td>
              <td>{metric(row.cpu_pct,'%')}</td>
              <td>{pssText(row)}</td>
              <td>{processText(row)}</td>
              <td title={identity.full}>{identity.short}</td>
              <td title="Saved workload observation; not job completion time">{row.collected_at ? `${formatWib(row.collected_at,true)} WIB` : '—'}</td>
            </tr>
          })}
          {!displayRows.length&&<tr><td colSpan="6">No job or program observed for this APP in the verified collection.</td></tr>}
        </tbody>
      </table></div></>}
    </section>
  </section>
}

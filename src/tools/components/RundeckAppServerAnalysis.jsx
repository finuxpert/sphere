import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { shortHost } from './sapUiFormat.js'
import './RundeckAppServerAnalysis.css'

const API = `${import.meta.env.BASE_URL}api`
const metric = (value, suffix = '') => value === null || value === undefined || value === '' ? '—' : `${Number(value).toLocaleString('en-US',{maximumFractionDigits:1})}${suffix}`

const pssText = (row = {}) => {
  const value = Number(row.details?.total_pss_gb ?? row.details?.pss_gb)
  return Number.isFinite(value) ? `${value.toLocaleString('en-US',{maximumFractionDigits:2})} GB` : '—'
}
const processText = (row = {}) => {
  const value = Number(row.details?.process_count ?? row.details?.pids?.length ?? 1)
  return Number.isFinite(value) ? value.toLocaleString('en-US',{maximumFractionDigits:0}) : '—'
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

export default function RundeckAppServerAnalysis({ app, latestCollectionId = '', refreshToken = '', onSelectJob }) {
  const [rows,setRows]=React.useState([])
  const [loading,setLoading]=React.useState(false)
  const [error,setError]=React.useState('')
  const [incident,setIncident]=React.useState(null)
  const [hostSnapshot,setHostSnapshot]=React.useState(app)

  React.useEffect(()=>{
    if(!app?.host || !latestCollectionId) return undefined
    const controller=new AbortController()
    setLoading(true); setError('')
    Promise.all([
      fetch(`${API}/history/jobs/current?collection_id=${encodeURIComponent(latestCollectionId)}&limit=100`,{cache:'no-store',signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error(`Job / Program detail unavailable (${r.status})`);return r.json()}),
      fetch(`${API}/analysis/performance`,{cache:'no-store',signal:controller.signal}).then(r=>r.ok?r.json():null).catch(()=>null),
      fetch(`${API}/history/hosts/latest`,{cache:'no-store',signal:controller.signal}).then(r=>r.ok?r.json():null).catch(()=>null),
    ]).then(([result,analysis,hosts])=>{
      setRows((result.items||[]).filter(row=>row.host===app.host).sort((a,b)=>Number(b.cpu_pct||0)-Number(a.cpu_pct||0)))
      const latestHost=(hosts?.items||[]).find(row=>row.host===app.host || shortHost(row.host)===shortHost(app.host))
      setHostSnapshot(latestHost ? {...app,...latestHost} : app)
      setIncident(analysis?.active && shortHost(analysis.affected_server||'')===shortHost(app.host) ? analysis : null)
    }).catch(failure=>{if(failure.name!=='AbortError')setError(failure.message||'APP analysis unavailable')})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[app?.host,latestCollectionId,refreshToken])

  if(!app) return null
  const resolvedApp=hostSnapshot || app
  const hostLabel=shortHost(resolvedApp.host)
  return <section className="rundeckAppServerAnalysis" aria-label={`${hostLabel} APP server analysis`}>
    <div className="rundeckAppServerSummary">
      <span><b>CPU</b>{metric(resolvedApp.cpu_pct,'%')}</span>
      <span><b>Memory</b>{metric(resolvedApp.ram_pct,'%')}</span>
      <span><b>I/O Wait</b>{metric(resolvedApp.io_wait_pct,'%')}</span>
      <span><b>Critical WP</b>{metric(resolvedApp.wp_critical)}</span>
    </div>

    {incident && <div className="rundeckAppServerIssue">
      <SphereIcon name="alert" />
      <div><strong>Critical WP active</strong><small>Duration {durationText(incident.duration_seconds)} · Peak {metric(incident.primary_signal?.peak ?? incident.peak_value ?? resolvedApp.wp_critical)}</small></div>
    </div>}

    <section className="rundeckAppServerWorkloads">
      <header>
        <div><span>Current Run</span><h4>Jobs & Programs on {hostLabel}</h4></div>
        <small>{rows.length} captured</small>
      </header>
      {loading && <div className="rundeckAppServerState">Loading jobs and programs…</div>}
      {error && <div className="rundeckAppServerState is-error">{error}</div>}
      {!loading && !error && <div className="rundeckAppServerTableWrap"><table>
        <thead><tr><th>Job / Program</th><th>Type</th><th>CPU</th><th>Memory</th><th>Processes</th></tr></thead>
        <tbody>
          {rows.map((row,index)=><tr key={`${row.host}-${row.consumer_type}-${row.consumer_key}-${index}`} tabIndex={0} role="button"
            onClick={()=>onSelectJob?.({key:row.consumer_key,host:row.host,consumerType:row.consumer_type,source:'app-server-analysis'})}
            onKeyDown={(event)=>{if(event.key!=='Enter'&&event.key!==' ')return;event.preventDefault();onSelectJob?.({key:row.consumer_key,host:row.host,consumerType:row.consumer_type,source:'app-server-analysis'})}}>
            <td><strong>{row.consumer_key}</strong><small>{row.details?.program || row.details?.job_name || ''}</small></td>
            <td>{String(row.consumer_type||'—').toUpperCase()}</td>
            <td>{metric(row.cpu_pct,'%')}</td>
            <td>{pssText(row)}</td>
            <td>{processText(row)}</td>
          </tr>)}
          {!rows.length&&<tr><td colSpan="5">No jobs or programs captured for this APP in the current run.</td></tr>}
        </tbody>
      </table></div>}
    </section>
  </section>
}

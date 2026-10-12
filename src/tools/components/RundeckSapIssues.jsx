import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import SphereOperatorTabs from './SphereOperatorTabs.jsx'
import { numberText, shortHost } from './sapUiFormat.js'
import { metricResourceState, sapWorkloadState, OPERATOR_THRESHOLDS } from './rundeckStatusSemantics.js'
import { settleSapIssueSources, unavailableSapIssueIndicators, SAP_ISSUE_SOURCE_LABELS, sapIssueSampleFreshness } from './rundeckIssueSources.js'

const API = `${import.meta.env.BASE_URL}api`
const SEVERITY_RANK = { CRITICAL: 4, WARNING: 3, ATTENTION: 2, NORMAL: 1, UNKNOWN: 0 }

const serviceState = (value) => {
  const state = String(value || 'UNKNOWN').toUpperCase()
  if (['UP','PASS','ACTIVE','OK','NORMAL'].includes(state)) return 'NORMAL'
  if (['DOWN','FAIL','FAILED','ERROR','CRITICAL'].includes(state)) return 'CRITICAL'
  if (['WARNING','STALE','PARTIAL','NOT_CONFIGURED','WAITING'].includes(state)) return 'WARNING'
  return 'UNKNOWN'
}
const valueText = (value, unit = '') => value === null || value === undefined || String(value).trim() === '' || !Number.isFinite(Number(value)) ? '—' : `${numberText(value, unit === '%' ? 1 : 0)}${unit}`
const durationText = (seconds) => {
  const value = seconds === null || seconds === undefined || String(seconds).trim() === '' ? NaN : Number(seconds)
  if (!Number.isFinite(value) || value < 0) return '—'
  const minutes = Math.floor(value / 60)
  if (minutes < 60) return minutes < 1 ? '<1m' : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}
const issueLabel = (value = '') => String(value || 'SAP Issue').replace(/Critical Work Process Count/gi,'Critical WP').replace(/Critical WP Count/gi,'Critical WP').replace(/Work Process/gi,'WP')
const statusClass = (value) => `is-${String(value || 'UNKNOWN').toLowerCase()}`
const wpState = host => sapWorkloadState({ wp_critical: host?.wp_critical })
const wpValue = value => valueText(value)

function Status({ value }) {
  return <span className={`rundeckIssueStatus ${statusClass(value)}`}><i aria-hidden="true" />{value}</span>
}

export default function RundeckSapIssues({ refreshToken = '', onInspectApp, compact = false, onOpen = null, paired = false }) {
  const [data, setData] = React.useState({ incidents:null, hosts:null, availability:null, readiness:null })
  const [failedSources, setFailedSources] = React.useState([])
  const [indicatorView, setIndicatorView] = React.useState('review')
  const [indicatorQuery,setIndicatorQuery] = React.useState('')
  const [appFilter,setAppFilter] = React.useState('ALL')

  React.useEffect(() => {
    const controller = new AbortController()
    const get = async (url) => {
      const response = await fetch(url,{cache:'no-store',signal:controller.signal})
      if(!response.ok) throw new Error(`Request failed (${response.status})`)
      return response.json()
    }
    setData({ incidents:null, hosts:null, availability:null, readiness:null })
    setFailedSources([])
    Promise.allSettled([
      get(`${API}/history/incidents?days=1&limit=200`),
      get(`${API}/history/hosts/latest`),
      get(`${API}/availability/latest`),
      get(`${API}/readiness`),
    ]).then((results) => {
      if(controller.signal.aborted) return
      const settled = settleSapIssueSources(results)
      setData(settled.data)
      setFailedSources(settled.failed)
    })
    return () => controller.abort()
  },[refreshToken])

  const incidentItems=(data.incidents?.items||[]).filter((row)=>row.state==='ACTIVE')
  const activeCount=data.incidents ? Number(data.incidents.active ?? incidentItems.length) : null
  const peakCriticalWp=incidentItems.filter((row)=>row.code==='WP_CRITICAL').reduce((value,row)=>Math.max(value,Number(row.peak_value||0)),0)

  const hosts=data.hosts?.items||[]
  const availability=data.availability||{}
  const indicators=unavailableSapIssueIndicators(failedSources)

  const nowMs = Date.now()
  hosts.forEach((host)=>{
    const app=shortHost(host.host)
    const freshness=sapIssueSampleFreshness(data.hosts,host,nowMs)
    const reportedState=(state)=>freshness==='FRESH'?state:'UNKNOWN'
    const prefix=freshness==='FRESH'?'':'Last '
    const sampleReason=freshness==='FRESH'?'':freshness==='STALE'?' · Old sample':' · Sample time or collection not verified'
    indicators.push(
      {scope:app,indicator:'CPU',status:reportedState(metricResourceState(host.cpu_pct,'cpu')),current:prefix+valueText(host.cpu_pct,'%'),reason:`Warn ${OPERATOR_THRESHOLDS.cpu.warning}% · Crit ${OPERATOR_THRESHOLDS.cpu.critical}%${sampleReason}`,host:host.host},
      {scope:app,indicator:'RAM',status:reportedState(metricResourceState(host.ram_pct,'ram')),current:prefix+valueText(host.ram_pct,'%'),reason:`Warn ${OPERATOR_THRESHOLDS.ram.warning}% · Crit ${OPERATOR_THRESHOLDS.ram.critical}%${sampleReason}`,host:host.host},
      {scope:app,indicator:'I/O Wait',status:reportedState(metricResourceState(host.io_wait_pct ?? host.iowait_pct,'ioWait')),current:prefix+valueText(host.io_wait_pct ?? host.iowait_pct,'%'),reason:`Warn ${OPERATOR_THRESHOLDS.ioWait.warning}% · Crit ${OPERATOR_THRESHOLDS.ioWait.critical}%${sampleReason}`,host:host.host},
      {scope:app,indicator:'APP Critical WP',status:reportedState(wpState(host)),current:prefix+wpValue(host.wp_critical),reason:`Attention ${OPERATOR_THRESHOLDS.criticalWp.attention}–2 · Critical ≥${OPERATOR_THRESHOLDS.criticalWp.critical}${sampleReason}`,host:host.host},
    )
  })

  if(data.hosts?.complete === false) indicators.push({scope:'APP',indicator:'Collection coverage',status:'UNKNOWN',current:`${data.hosts.received_host_count ?? hosts.length}/${data.hosts.expected_host_count ?? '—'} APPs`,reason:'Latest collection is incomplete'})
  if (data.hosts && !hosts.length) indicators.push({scope:'APP',indicator:'Host performance',status:'UNKNOWN',current:'No observations',reason:'Host response contains no APP readings'})
  const addServices=(label,rows)=>{ if (!data.availability) return
    if (!Array.isArray(rows) || !rows.length) { indicators.push({scope:label,indicator:label,status:'UNKNOWN',current:'Not reported',reason:'No service status in Availability response'}); return }
    rows.forEach((row)=>indicators.push({
    scope:row.name||label,
    indicator:label,
    status:serviceState(row.status),
    current:String(row.status||'UNKNOWN').toUpperCase(),
    reason:['UP','PASS','ACTIVE','OK','NORMAL'].includes(String(row.status||'').toUpperCase())?'Service check passed':'Check service state',
  }))
  }
  addServices('SAP App Availability',availability.sap_app)
  addServices('HANA',availability.hana_system_db)
  addServices('Replication',availability.hana_replication)
  addServices('Web Dispatcher',availability.web_dispatcher)
  addServices('SSH',availability.ssh)

  const sm37=data.readiness ? String(data.readiness?.features?.job_monitor || 'WAITING_FOR_SM37_FEED').toUpperCase() : 'UNKNOWN'
  if(data.readiness) indicators.push({scope:'SAP Job Source',indicator:'SM37 Feed',status:sm37==='READY'?'NORMAL':'WARNING',current:sm37==='READY'?'CONNECTED':'NOT CONNECTED',reason:sm37==='READY'?'Execution source ready':'Check job status in SAP (SM37)'})

  const sortedIndicators=[...indicators].sort((a,b)=>(SEVERITY_RANK[b.status]||0)-(SEVERITY_RANK[a.status]||0))
  const reviewIndicators=sortedIndicators.filter((row)=>row.status!=='NORMAL' && row.scope!=='SAP Job Source')
  const unknownCount=reviewIndicators.filter((row)=>row.status==='UNKNOWN').length
  const criticalCount=reviewIndicators.filter((row)=>row.status==='CRITICAL').length
  const warningCount=reviewIndicators.filter((row)=>row.status==='WARNING'||row.status==='ATTENTION').length
  const baseIndicators=indicatorView==='all' ? sortedIndicators : reviewIndicators
  const normalizedQuery=indicatorQuery.trim().toLocaleLowerCase()
  const visibleIndicators=baseIndicators.filter(row=>
    (appFilter==='ALL' || row.scope===appFilter)
    && (!normalizedQuery || [row.scope,row.indicator,row.status,row.current,row.reason].some(value=>String(value||'').toLocaleLowerCase().includes(normalizedQuery)))
  )
  const appOptions=[...new Set(hosts.map(row=>shortHost(row.host)).filter(value=>/^APP[1-9][0-9]*$/i.test(value)))].sort((a,b)=>Number(a.slice(3))-Number(b.slice(3)))

  if(compact){
    const reviewText=reviewIndicators.length ? `${reviewIndicators.length} indicators need review` : 'No reported issue'
    return <button type="button" className="rundeckEvidenceCard rundeckIssuesCard" onClick={onOpen} aria-label="Open SAP Issues">
      <span className="rundeckEvidenceCardTitle"><SphereIcon name="alert" /> SAP Issues</span>
      <strong>{failedSources.length ? `${failedSources.length} source(s) unavailable · ${reviewText}` : `${reviewText}${sm37 === 'READY' ? '' : sm37 === 'UNKNOWN' ? ' · SM37 unverified' : ' · SM37 not connected'}`}</strong>
      <em aria-hidden="true">›</em>
    </button>
  }

  const inspect=(row)=>row.host&&onInspectApp?.({host:row.host,source:'sap-issues',issue:row.indicator,severity:row.status})

  return <section className="rundeckSapIssuesV1231 is-indicator-console" aria-label="SAP operational issues">
    {!paired && <header><h3><SphereIcon name="alert" /> SAP Issues</h3><span>{reviewIndicators.length} need review{sm37 === 'READY' ? '' : sm37 === 'UNKNOWN' ? ' · SM37 unverified' : ' · SM37 not connected'}</span></header>}
    {failedSources.length>0 && <div className="rundeckReviewState is-error" role="status">Unavailable: {failedSources.map(name=>SAP_ISSUE_SOURCE_LABELS[name]).join(', ')}. Successful checks remain visible; failed sources are UNKNOWN.</div>}
    <div className="rundeckSapIssuesSummaryStrip">
      <span><b>Needs review</b><strong>{reviewIndicators.length}</strong></span>
      <span><b>Critical</b><strong>{criticalCount}</strong></span>
      <span><b>Attention</b><strong>{warningCount}</strong></span>
      <span><b>Unknown</b><strong>{unknownCount}</strong></span>
      <span><b>Active issues</b><strong>{activeCount === null || !Number.isFinite(activeCount) ? '—' : activeCount}</strong></span>
    </div>

    <section className="rundeckIssueIndicatorSection">
      <div className="rundeckIssueSectionTitle">
        <h4>Indicators</h4>
        <SphereOperatorTabs
          className="rundeckIssueViewSwitch"
          label="Indicator view"
          value={indicatorView}
          options={[
            { value: 'review', label: `Needs review (${reviewIndicators.length})` },
            { value: 'all', label: `All indicators (${indicators.length})` },
          ]}
          onChange={setIndicatorView}
        />
      </div>
      {sm37!=='READY'&&<p className="rundeckIssueSourceNote">{sm37 === 'UNKNOWN' ? 'SM37 feed status unavailable.' : 'SM37 feed not connected.'} Verify job execution status directly in SAP (SM37).</p>}
      <div className="rundeckIssueFilters" role="group" aria-label="Filter SAP indicators">
        <label><span>Find indicator</span><input type="search" value={indicatorQuery} onChange={event=>setIndicatorQuery(event.target.value)} placeholder="APP, indicator or status" /></label>
        <label><span>APP</span><select value={appFilter} onChange={event=>setAppFilter(event.target.value)}>
          <option value="ALL">All APPs</option>{appOptions.map(app=><option key={app} value={app}>{app}</option>)}
        </select></label>
        <small>{visibleIndicators.length} shown</small>
      </div>
      {indicatorView==='review'&&!reviewIndicators.length&&<p className="rundeckIssueEmpty">No abnormal indicators in the latest available checks. Verify freshness before treating this as current status.</p>}
      {!visibleIndicators.length && baseIndicators.length>0 && <p className="rundeckIssueEmpty">No indicators match these filters.</p>}
      {visibleIndicators.length>0&&<div className="rundeckIssueIndicatorTableWrap">
        <table className="rundeckIssueIndicatorTable">
          <thead><tr><th>Scope</th><th>Indicator</th><th>Status</th><th>Current</th><th>Basis Check</th></tr></thead>
          <tbody>
            {visibleIndicators.map((row,index)=><tr key={`${row.scope}-${row.indicator}-${index}`} className={row.host?'is-investigable':''}>
              <td>{row.host ? <button type="button" className="rundeckIssueInspect" onClick={()=>inspect(row)} aria-label={`Inspect ${row.scope} ${row.indicator}`}>{row.scope} <span aria-hidden="true">↗</span></button> : <strong>{row.scope}</strong>}</td>
              <td>{row.indicator}</td><td><Status value={row.status}/></td><td>{row.current}</td><td>{row.reason}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </section>

    {incidentItems.length>0&&<section className="rundeckIssueIndicatorSection is-history">
      <div className="rundeckIssueSectionTitle"><h4>Active issues</h4><small>Critical WP peak {peakCriticalWp||'—'}</small></div>
      <div className="rundeckSapIssuesTableWrap"><table className="rundeckSapIssuesTableV1231">
        <thead><tr><th>APP</th><th>Signal</th><th>Current status</th><th>Incident peak</th><th>Incident duration</th></tr></thead>
        <tbody>{incidentItems.map((row)=>{
          const severity=row.code==='WP_CRITICAL'?sapWorkloadState({wp_critical:row.latest_value}):String(row.current_severity||row.severity||'UNKNOWN').toUpperCase()
          return <tr key={row.id} className={row.host?'is-investigable':''} onClick={row.host?()=>inspect({host:row.host,indicator:issueLabel(row.signal||row.code),status:severity}):undefined}>
            <td><strong>{shortHost(row.host||'APP')}</strong></td><td>{issueLabel(row.signal||row.code)}</td><td><Status value={severity}/></td><td>{valueText(row.peak_value,row.unit||'')}</td><td>{durationText(row.duration_seconds)}</td>
          </tr>
        })}</tbody>
      </table></div>
    </section>}
  </section>
}

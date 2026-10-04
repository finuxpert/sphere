import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { numberText, shortHost } from './sapUiFormat.js'

const API = `${import.meta.env.BASE_URL}api`
const SEVERITY_RANK = { CRITICAL: 4, WARNING: 3, ATTENTION: 2, NORMAL: 1, UNKNOWN: 0 }

const pctState = (value, warning, critical) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return 'UNKNOWN'
  if (number >= critical) return 'CRITICAL'
  if (number >= warning) return 'WARNING'
  return 'NORMAL'
}
const wpState = (value) => Number(value || 0) >= 3 ? 'CRITICAL' : Number(value || 0) > 0 ? 'ATTENTION' : 'NORMAL'
const serviceState = (value) => {
  const state = String(value || 'UNKNOWN').toUpperCase()
  if (['UP','PASS','ACTIVE','OK','NORMAL'].includes(state)) return 'NORMAL'
  if (['DOWN','FAIL','FAILED','ERROR','CRITICAL'].includes(state)) return 'CRITICAL'
  if (['WARNING','STALE','PARTIAL','NOT_CONFIGURED','WAITING'].includes(state)) return 'WARNING'
  return 'UNKNOWN'
}
const valueText = (value, unit = '') => value === null || value === undefined || value === '' ? '—' : `${numberText(value, unit === '%' ? 1 : 0)}${unit}`
const durationText = (seconds) => {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value < 0) return '—'
  const minutes = Math.floor(value / 60)
  if (minutes < 60) return minutes < 1 ? '<1m' : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}
const issueLabel = (value = '') => String(value || 'SAP Issue').replace(/Critical Work Process Count/gi,'Critical WP').replace(/Critical WP Count/gi,'Critical WP').replace(/Work Process/gi,'WP')
const statusClass = (value) => `is-${String(value || 'UNKNOWN').toLowerCase()}`

function Status({ value }) {
  return <span className={`rundeckIssueStatus ${statusClass(value)}`}><i aria-hidden="true" />{value}</span>
}

export default function RundeckSapIssues({ refreshToken = '', onInspectApp, compact = false, onOpen = null }) {
  const [data, setData] = React.useState({ incidents:null, hosts:null, availability:null, readiness:null })
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    const controller = new AbortController()
    const get = async (url) => {
      const response = await fetch(url,{cache:'no-store',signal:controller.signal})
      if(!response.ok) throw new Error(`Request failed (${response.status})`)
      return response.json()
    }
    Promise.allSettled([
      get(`${API}/history/incidents?days=1&limit=200`),
      get(`${API}/history/hosts/latest`),
      get(`${API}/availability/latest`),
      get(`${API}/readiness`),
    ]).then(([incidents,hosts,availability,readiness]) => {
      if(controller.signal.aborted) return
      setData({
        incidents: incidents.status==='fulfilled' ? incidents.value : null,
        hosts: hosts.status==='fulfilled' ? hosts.value : null,
        availability: availability.status==='fulfilled' ? availability.value : null,
        readiness: readiness.status==='fulfilled' ? readiness.value : null,
      })
      setError(incidents.status==='rejected' && hosts.status==='rejected' && availability.status==='rejected' ? 'SAP issue data unavailable' : '')
    })
    return () => controller.abort()
  },[refreshToken])

  const incidentItems=(data.incidents?.items||[]).filter((row)=>row.state==='ACTIVE')
  const activeCount=Number(data.incidents?.active ?? incidentItems.length)
  const longestActive=incidentItems.reduce((value,row)=>Math.max(value,Number(row.duration_seconds||0)),0)
  const peakCriticalWp=incidentItems.filter((row)=>row.code==='WP_CRITICAL').reduce((value,row)=>Math.max(value,Number(row.peak_value||0)),0)

  const hosts=data.hosts?.items||[]
  const availability=data.availability||{}
  const indicators=[]

  hosts.forEach((host)=>{
    const app=shortHost(host.host)
    indicators.push(
      {scope:app,indicator:'CPU',status:pctState(host.cpu_pct,75,90),current:valueText(host.cpu_pct,'%'),reason:'Warn 75% · Crit 90%',host:host.host},
      {scope:app,indicator:'RAM',status:pctState(host.ram_pct,75,90),current:valueText(host.ram_pct,'%'),reason:'Warn 75% · Crit 90%',host:host.host},
      {scope:app,indicator:'I/O Wait',status:pctState(host.io_wait_pct,5,10),current:valueText(host.io_wait_pct,'%'),reason:'Warn 5% · Crit 10%',host:host.host},
      {scope:app,indicator:'APP Critical WP',status:wpState(host.wp_critical),current:String(Number(host.wp_critical||0)),reason:'Attention 1–2 · Critical ≥3',host:host.host},
    )
  })

  const addServices=(label,rows=[])=>rows.forEach((row)=>indicators.push({
    scope:row.name||label,
    indicator:label,
    status:serviceState(row.status),
    current:String(row.status||'UNKNOWN').toUpperCase(),
    reason:['UP','PASS','ACTIVE','OK','NORMAL'].includes(String(row.status||'').toUpperCase())?'Service check passed':'Check service state',
  }))
  addServices('SAP App Availability',availability.sap_app)
  addServices('HANA',availability.hana_system_db)
  addServices('Replication',availability.hana_replication)
  addServices('Web Dispatcher',availability.web_dispatcher)
  addServices('SSH',availability.ssh)

  const sm37=String(data.readiness?.features?.job_monitor||'WAITING_FOR_SM37_FEED').toUpperCase()
  indicators.push({scope:'SAP Job Source',indicator:'SM37 Feed',status:sm37==='READY'?'NORMAL':'WARNING',current:sm37==='READY'?'CONNECTED':'NOT CONNECTED',reason:sm37==='READY'?'Execution source ready':'Check job status in SAP (SM37)'})

  const sortedIndicators=[...indicators].sort((a,b)=>(SEVERITY_RANK[b.status]||0)-(SEVERITY_RANK[a.status]||0))
  const issueIndicators=sortedIndicators.filter((row)=>row.status!=='NORMAL'&&row.status!=='UNKNOWN')
  const criticalCount=issueIndicators.filter((row)=>row.status==='CRITICAL').length
  const warningCount=issueIndicators.filter((row)=>row.status==='WARNING'||row.status==='ATTENTION').length
  const mostImpacted=issueIndicators.find((row)=>/^APP\d+$/i.test(row.scope||''))?.scope || '—'

  if(compact){
    const top=issueIndicators[0]
    return <button type="button" className="rundeckEvidenceCard rundeckIssuesCard" onClick={onOpen} aria-label="Open SAP Issues">
      <span className="rundeckEvidenceCardTitle"><SphereIcon name="alert" /> SAP Issues</span>
      <strong>{error ? 'Unavailable' : issueIndicators.length ? `${issueIndicators.length} need attention${sm37 === 'READY' ? '' : ' · SM37 warning'}` : 'No active issue indicator'}</strong>
      <em aria-hidden="true">›</em>
    </button>
  }

  const inspect=(row)=>row.host&&onInspectApp?.({host:row.host,source:'sap-issues',issue:row.indicator,severity:row.status})

  return <section className="rundeckSapIssuesV1231 is-indicator-console" aria-label="SAP operational issues">
    <header><h3><SphereIcon name="alert" /> SAP Issues</h3><span>{issueIndicators.length} need attention</span></header>
    {error&&<div className="rundeckReviewState is-error">{error}</div>}
    <div className="rundeckSapIssuesSummaryStrip">
      <span><b>Checked indicators</b><strong>{indicators.length}</strong></span>
      <span><b>Critical</b><strong>{criticalCount}</strong></span>
      <span><b>Warning / Attention</b><strong>{warningCount}</strong></span>
      <span><b>Most signals</b><strong>{mostImpacted}</strong></span>
      <span><b>Active incident rows</b><strong>{activeCount}</strong></span>
      <span><b>Longest active</b><strong>{longestActive?durationText(longestActive):'—'}</strong></span>
    </div>

    <section className="rundeckIssueIndicatorSection">
      <div className="rundeckIssueSectionTitle"><h4>Current Indicator Status</h4><small>CPU · RAM · I/O Wait · Critical WP · Availability · HANA · Web · SSH · SM37</small></div>
      <div className="rundeckIssueIndicatorTableWrap">
        <table className="rundeckIssueIndicatorTable">
          <thead><tr><th>Scope</th><th>Indicator</th><th>Status</th><th>Current</th><th>Basis Check</th></tr></thead>
          <tbody>
            {sortedIndicators.map((row,index)=><tr key={`${row.scope}-${row.indicator}-${index}`} className={row.host?'is-investigable':''} onClick={row.host?()=>inspect(row):undefined}>
              <td><strong>{row.scope}</strong></td><td>{row.indicator}</td><td><Status value={row.status}/></td><td>{row.current}</td><td>{row.reason}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    {incidentItems.length>0&&<section className="rundeckIssueIndicatorSection is-history">
      <div className="rundeckIssueSectionTitle"><h4>Active Incident Signals</h4><small>Retained incident rows · Critical WP peak {peakCriticalWp||'—'}</small></div>
      <div className="rundeckSapIssuesTableWrap"><table className="rundeckSapIssuesTableV1231">
        <thead><tr><th>APP</th><th>Signal</th><th>Now</th><th>Peak</th><th>Duration</th></tr></thead>
        <tbody>{incidentItems.map((row)=>{
          const severity=row.code==='WP_CRITICAL'?wpState(row.latest_value):String(row.current_severity||row.severity||'WARNING').toUpperCase()
          return <tr key={row.id} className={row.host?'is-investigable':''} onClick={row.host?()=>inspect({host:row.host,indicator:issueLabel(row.signal||row.code),status:severity}):undefined}>
            <td><strong>{shortHost(row.host||'APP')}</strong></td><td>{issueLabel(row.signal||row.code)}</td><td><Status value={severity}/></td><td>{valueText(row.peak_value,row.unit||'')}</td><td>{durationText(row.duration_seconds)}</td>
          </tr>
        })}</tbody>
      </table></div>
    </section>}
  </section>
}

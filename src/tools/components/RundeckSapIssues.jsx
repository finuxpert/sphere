import React from 'react'
import { createPortal } from 'react-dom'
import SphereIcon from './SphereIcon.jsx'
import SphereOperatorTabs from './SphereOperatorTabs.jsx'
import { formatWib, numberText, shortHost } from './sapUiFormat.js'
import { metricResourceState, sapWorkloadState, OPERATOR_THRESHOLDS } from './rundeckStatusSemantics.js'
import { settleSapIssueSources, unavailableSapIssueIndicators, SAP_ISSUE_SOURCE_LABELS, sapIssueSampleFreshness, sapIssueTimestampFreshness } from './rundeckIssueSources.js'

const API = `${import.meta.env.BASE_URL}api`
const SEVERITY_RANK = { CRITICAL: 4, WARNING: 3, ATTENTION: 2, UNKNOWN: 1, NORMAL: 0 }
const EMPTY_SNAPSHOT = Object.freeze({ incidents:null, hosts:null, availability:null, readiness:null, failedSources:[] })

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

export default function RundeckSapIssues({ refreshToken = '', onInspectApp, compact = false, inlineSummary = false, onOpen = null, paired = false, readinessRoot = null, historyRoot = null }) {
  const [snapshot, setSnapshot] = React.useState({ ...EMPTY_SNAPSHOT, requestKey: refreshToken })
  const data = snapshot.requestKey === refreshToken ? snapshot : EMPTY_SNAPSHOT
  const failedSources = data.failedSources
  const [indicatorView, setIndicatorView] = React.useState('review')
  const [indicatorQuery,setIndicatorQuery] = React.useState('')
  const [appFilter,setAppFilter] = React.useState('ALL')
  const [showMoreIndicators,setShowMoreIndicators] = React.useState(false)
  const [showFilters,setShowFilters] = React.useState(false)

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
    ]).then((results) => {
      if(controller.signal.aborted) return
      const settled = settleSapIssueSources(results)
      setSnapshot({ ...settled.data, failedSources:settled.failed, requestKey:refreshToken })
    })
    return () => controller.abort()
  },[refreshToken])

  const incidentItems=(data.incidents?.items||[]).filter((row)=>row.state==='ACTIVE')
  // ACTIVE describes the retained incident lifecycle, not the current APP severity.
  const retainedIncidentCount=data.incidents ? incidentItems.length : null
  const peakCriticalWp=incidentItems.filter((row)=>row.code==='WP_CRITICAL').reduce((value,row)=>Math.max(value,Number(row.peak_value||0)),0)

  const hosts=data.hosts?.items||[]
  const appSampleTime=data.hosts?.collected_at || hosts.find(host=>host.collected_at)?.collected_at || ''
  const availability=data.availability||{}
  const availabilityFreshness=sapIssueTimestampFreshness(data.availability?.collected_at)
  const loading=['incidents','hosts','availability','readiness'].every(key=>data[key]===null) && failedSources.length===0
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
    status:availabilityFreshness==='FRESH'?serviceState(row.status):'UNKNOWN',
    current:`${availabilityFreshness==='FRESH'?'':'Last '}${String(row.status||'UNKNOWN').toUpperCase()}`,
    reason:availabilityFreshness==='FRESH'
      ? `Reported status: ${String(row.status || 'UNKNOWN').toUpperCase()}`
      : availabilityFreshness==='STALE'?'Availability sample is old':'Availability sample time not verified',
  }))
  }
  addServices('SAP App Availability',availability.sap_app)
  addServices('HANA',availability.hana_system_db)
  addServices('Replication',availability.hana_replication)
  addServices('Web Dispatcher',availability.web_dispatcher)
  addServices('SSH',availability.ssh)

  const sm37=data.readiness ? String(data.readiness?.features?.job_monitor ?? 'UNKNOWN').toUpperCase() : 'UNKNOWN'
  const sm37SourceFailed = failedSources.includes('readiness')
  const readinessSummary = <div className="rundeckSapChecksReadiness" title="Readiness of the SAP SM37 data source, not SAP job execution status.">
    <b>SM37 readiness</b>
    <strong className={sm37 === 'READY' ? 'is-ready' : sm37SourceFailed || sm37 === 'UNKNOWN' ? 'is-unknown' : 'is-warning'}>
      {sm37SourceFailed ? 'UNAVAILABLE' : loading ? 'CHECKING' : sm37}
    </strong>
  </div>
  if(data.readiness) indicators.push({scope:'SAP Job Source',indicator:'SM37 Feed',status:sm37==='READY'?'NORMAL':sm37==='UNKNOWN'?'UNKNOWN':'WARNING',current:sm37==='READY'?'CONNECTED':sm37==='UNKNOWN'?'UNVERIFIED':'NOT CONNECTED',reason:`Readiness: ${sm37} · Execution status: SAP SM37`})

  const sortedIndicators=[...indicators].sort((a,b)=>(SEVERITY_RANK[b.status]||0)-(SEVERITY_RANK[a.status]||0))
  const reviewIndicators=sortedIndicators.filter((row)=>row.status!=='NORMAL' && row.scope!=='SAP Job Source')
  const unknownCount=reviewIndicators.filter((row)=>row.status==='UNKNOWN').length
  const criticalCount=reviewIndicators.filter((row)=>row.status==='CRITICAL').length
  const warningCount=reviewIndicators.filter((row)=>row.status==='WARNING'||row.status==='ATTENTION').length
  const activeFindings = criticalCount + warningCount
  const normalCount=indicators.filter((row)=>row.status==='NORMAL' && row.scope!=='SAP Job Source').length
  const baseIndicators=indicatorView==='all' ? sortedIndicators : reviewIndicators
  const normalizedQuery=indicatorQuery.trim().toLocaleLowerCase()
  const visibleIndicators=baseIndicators.filter(row=>
    (appFilter==='ALL' || row.scope===appFilter)
    && (!normalizedQuery || [row.scope,row.indicator,row.status,row.current,row.reason].some(value=>String(value||'').toLocaleLowerCase().includes(normalizedQuery)))
  )
  const displayedIndicators=paired && indicatorView==='review' && !showMoreIndicators && !normalizedQuery && appFilter==='ALL' ? visibleIndicators.slice(0,5) : visibleIndicators
  const hiddenIndicatorCount=visibleIndicators.length-displayedIndicators.length
  const filtersExpanded=!paired || indicatorView==='all' || showFilters || Boolean(normalizedQuery) || appFilter!=='ALL'
  const showWpThreshold=displayedIndicators.some(row=>row.indicator==='APP Critical WP')
  const appOptions=[...new Set(hosts.map(row=>shortHost(row.host)).filter(value=>/^APP[1-9][0-9]*$/i.test(value)))].sort((a,b)=>Number(a.slice(3))-Number(b.slice(3)))

  if(inlineSummary){
    const priority = reviewIndicators.filter(row => ['CRITICAL','WARNING','ATTENTION'].includes(row.status)
      && !['CPU','RAM'].includes(row.indicator)).slice(0,2)
    return <section className="sphereHealthInlineBlock" aria-label="SAP Issues overview">
      <div className="sphereHealthInlineHead"><h4>SAP Issues</h4><button type="button" onClick={onOpen}>Details</button></div>
      <div className="sphereHealthIssueSummary"><strong>{loading ? 'Checking…' : `${activeFindings} Attention / Critical`}</strong>
        <small>{loading ? '' : `${unknownCount} No Data`}</small></div>
      <div className="sphereHealthInlineIssues">{priority.map((row,i) =>
        <div key={[row.scope,row.indicator,i].join(':')} title={row.reason}>
          <span>{row.scope} · {row.indicator}</span><b>{row.current}</b>
        </div>)}
        {!priority.length && <small>{loading ? 'Checking saved signals…' : failedSources.length ? 'Some sources unavailable' : 'No additional verified issue details'}</small>}
      </div>
    </section>
  }
  if(compact){
    const statusText = `${activeFindings} Attention / Critical · ${unknownCount} No Data`
    return <button type="button" className="rundeckEvidenceCard rundeckIssuesCard" onClick={onOpen} aria-label="Open SAP Issues">
      <span className="rundeckEvidenceCardTitle"><SphereIcon name="alert" /> SAP Issues</span>
      <strong>{loading ? 'Checking…' : statusText}{failedSources.length ? ' · Source unavailable' : ''}</strong>
      <em aria-hidden="true">›</em>
    </button>
  }

  const inspect=(row)=>row.host&&onInspectApp?.({host:row.host,source:'sap-issues',issue:row.indicator,severity:row.status})

  const historyContent = data.incidents ? <details className="rundeckSapChecksHistoryDisclosure" open={!paired || (incidentItems.length > 0 && incidentItems.length <= 5)}>
      <summary>Incident history <span>{retainedIncidentCount ?? '—'}</span><small>{incidentItems.length > 5 ? 'Expand saved records' : 'Saved incident details · peak and duration'}</small></summary>
      <section className="rundeckIssueIndicatorSection is-history">
      <div className="rundeckIssueSectionTitle"><h4>Saved incidents</h4><small>Peak Critical WP {peakCriticalWp||'—'} · APP status from latest verified sample</small></div>
      {incidentItems.length > 0 ? <div className="rundeckSapIssuesTableWrap"><table className="rundeckSapIssuesTableV1231">
        <thead><tr><th>APP</th><th>Signal</th><th>Current APP status</th><th>Incident peak</th><th>Incident duration</th></tr></thead>
        <tbody>{incidentItems.map((row)=>{
          // Active is a retained incident state; current severity requires a verified recent host sample.
          const latestHost=hosts.find(host=>shortHost(host.host)===shortHost(row.host))
          const currentVerified=latestHost && sapIssueSampleFreshness(data.hosts,latestHost,nowMs)==='FRESH'
          const code=String(row.code||'').toUpperCase()
          const severity=!currentVerified?'UNKNOWN'
            :code==='WP_CRITICAL'?sapWorkloadState(latestHost)
            :code.includes('IOWAIT')||code.includes('IO_WAIT')?metricResourceState(latestHost.io_wait_pct ?? latestHost.iowait_pct,'ioWait')
            :code.includes('CPU')?metricResourceState(latestHost.cpu_pct,'cpu')
            :code.includes('RAM')||code.includes('MEMORY')?metricResourceState(latestHost.ram_pct,'ram')
            :'UNKNOWN'
          return <tr key={row.id} className={row.host?'is-investigable':''}>
            <td>{row.host
              ? <button type="button" className="rundeckIssueInspect" onClick={()=>inspect({host:row.host,indicator:issueLabel(row.signal||row.code),status:severity})} aria-label={`Inspect ${shortHost(row.host)} ${issueLabel(row.signal||row.code)} incident`}>{shortHost(row.host)} <span aria-hidden="true">↗</span></button>
              : <strong>{shortHost(row.host||'APP')}</strong>}</td><td>{issueLabel(row.signal||row.code)}</td><td><Status value={severity}/></td><td>{valueText(row.peak_value,row.unit||'')}</td><td>{durationText(row.duration_seconds)}</td>
          </tr>
        })}</tbody>
      </table></div> : <p className="rundeckIssueEmpty">No retained active issues in the current incident window.</p>}
      </section>
    </details> : failedSources.includes('incidents') ? <div className="rundeckIssueEmpty" role="status">Incident history unavailable.</div> : loading ? <div className="rundeckIssueEmpty">Checking incident history…</div> : null

  return <section className="rundeckSapIssuesV1231 is-indicator-console" aria-label="SAP operational issues">
    {!paired && <header><h3><SphereIcon name="alert" /> SAP Issues</h3><span>{reviewIndicators.length} non-normal indicators</span></header>}
    {loading && <div className="rundeckReviewState" role="status">Checking SAP source data…</div>}
    {failedSources.length>0 && <div className="rundeckReviewState is-error" role="status">Unavailable: {failedSources.map(name=>SAP_ISSUE_SOURCE_LABELS[name]).join(', ')}. Successful checks remain visible; failed sources are UNKNOWN.</div>}
    {paired && readinessRoot ? createPortal(readinessSummary, readinessRoot) : readinessSummary}
    <div className="rundeckSapIssuesSummaryStrip" aria-label="Current indicator status">
      <span title={`${criticalCount} Critical · ${warningCount} Attention/Warning; does not include Unknown or SM37`}><b>Active findings</b><strong>{activeFindings}</strong></span>
      <span title="Verified critical indicators"><b>Critical</b><strong>{criticalCount}</strong></span>
      <span title="Unavailable or stale evidence. UNKNOWN is not a confirmed SAP service failure."><b>Data unavailable</b><strong>{unknownCount}</strong></span>
      <span title="Indicators normal on a fresh verified source; excludes SM37 readiness"><b>Normal</b><strong>{normalCount}</strong></span>
    </div>

    <section className="rundeckIssueIndicatorSection">
      <div className="rundeckIssueSectionTitle">
        <h4>SAP indicators{appSampleTime && <small className="rundeckSapChecksSampleTime" title="APP host collection sample">APP sample {formatWib(appSampleTime,true)} WIB</small>}</h4>
        <SphereOperatorTabs
          className="rundeckIssueViewSwitch"
          label="Indicator view"
          value={indicatorView}
          options={[
            { value: 'review', label: `Non-normal (${reviewIndicators.length})` },
            { value: 'all', label: `All indicators (${indicators.length})` },
          ]}
          onChange={setIndicatorView}
        />
      </div>
      <p className="rundeckSapIssueBreakdown">Verified findings: {criticalCount} Critical · {warningCount} Attention/Warning · {unknownCount} Unknown. Unknown is missing or stale evidence, not confirmed SAP downtime.</p>
      {sm37!=='READY'&&<p className="rundeckIssueSourceNote">{sm37SourceFailed ? 'SM37 readiness unavailable' : sm37 === 'UNKNOWN' ? 'SM37 readiness unverified' : `SM37 not connected · ${sm37}`}. Confirm job execution status in SAP SM37.</p>}
      {paired && indicatorView==='review' && <button type="button" className="rundeckSapChecksFilterToggle" aria-expanded={filtersExpanded} onClick={()=>{ if(filtersExpanded){ setIndicatorQuery(''); setAppFilter('ALL'); setShowFilters(false) } else setShowFilters(true) }}>{filtersExpanded ? 'Clear and hide filters' : 'Filter indicators'}</button>}
      {filtersExpanded && <div className="rundeckIssueFilters" role="group" aria-label="Filter SAP indicators">
        <label><span>Find indicator</span><input type="search" value={indicatorQuery} onChange={event=>setIndicatorQuery(event.target.value)} placeholder="APP, indicator or status" /></label>
        <label><span>APP</span><select value={appFilter} onChange={event=>setAppFilter(event.target.value)}>
          <option value="ALL">All APPs</option>{appOptions.map(app=><option key={app} value={app}>{app}</option>)}
        </select></label>
        <small aria-live="polite">{visibleIndicators.length} shown</small>
      </div>}
      {indicatorView==='review'&&!reviewIndicators.length&&<p className="rundeckIssueEmpty">0 non-normal indicators · status based on available samples</p>}
      {!visibleIndicators.length && baseIndicators.length>0 && <p className="rundeckIssueEmpty">No indicators match these filters.</p>}
      {visibleIndicators.length>0&&<div className="rundeckIssueIndicatorTableWrap">
        <table className="rundeckIssueIndicatorTable">
          <thead><tr><th>Scope</th><th>Indicator</th><th>Status</th><th>Current</th>{!paired && <th>Basis Check</th>}</tr></thead>
          <tbody>
            {displayedIndicators.map((row,index)=><tr key={`${row.scope}-${row.indicator}-${index}`} className={row.host?'is-investigable':''}>
              <td>{row.host ? <button type="button" className="rundeckIssueInspect" onClick={()=>inspect(row)} aria-label={`Inspect ${row.scope} ${row.indicator}`}>{row.scope} <span aria-hidden="true">↗</span></button> : <strong>{row.scope}</strong>}</td>
              <td title={paired ? row.reason : undefined}>{row.indicator}{paired && row.status==='UNKNOWN' && <small className="rundeckSapChecksUnknownReason">{row.reason}</small>}</td><td><Status value={row.status}/></td><td>{row.current}</td>{!paired && <td>{row.reason}</td>}
            </tr>)}
          </tbody>
        </table>
      </div>}
      {paired && showWpThreshold && <p className="rundeckSapChecksThresholdNote">APP Critical WP: Attention 1–2 · Critical ≥3</p>}
      {hiddenIndicatorCount>0 && <button type="button" className="rundeckSapChecksMoreButton" onClick={()=>setShowMoreIndicators(true)}>Show {hiddenIndicatorCount} more indicators</button>}
      {paired && showMoreIndicators && indicatorView==='review' && !normalizedQuery && appFilter==='ALL' && <button type="button" className="rundeckSapChecksMoreButton" onClick={()=>setShowMoreIndicators(false)}>Show fewer indicators</button>}
    </section>

    {paired ? (historyRoot && historyContent ? createPortal(historyContent, historyRoot) : null) : historyContent}
  </section>
}

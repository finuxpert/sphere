import React from 'react'
import { wpCpuCoreEquivalent } from './monthlyCpuMetrics.js'
import { shortHost } from './sapUiFormat.js'
import { buildMonthlyPdf } from './rundeckMonthlyPdf.js'
import { buildManagementMonthlyPdf } from './rundeckMonthlyManagementPdf.js'
import './RundeckMonthlyReview.css'
import './RundeckMonthlyFinal20261030.css'

const API = import.meta.env.BASE_URL + 'api'
const PAGE_SIZE = 8
const fmt = (value, digits = 1) => value === null || value === undefined || !Number.isFinite(Number(value))
  ? '—' : Number(value).toLocaleString('id-ID', { maximumFractionDigits: digits })
const pct = value => fmt(value) === '—' ? '—' : fmt(value) + '%'
// WP CPU is measured against one logical CPU, not the entire APP host.
const wpCoreEq = value => {
  const cores = wpCpuCoreEquivalent(value)
  return cores === null ? '—' : fmt(cores, 2) + ' core eq.'
}
const id = row => String(row.consumer_type || '') + ':' + String(row.consumer_key || '')
const hostLabel = host => shortHost(typeof host === 'string' ? host : host?.host || '').toUpperCase()
const hostsFor = row => (Array.isArray(row.hosts) ? row.hosts : []).map(hostLabel).filter(Boolean).join(', ')
const pressureHostsFor = (row, metric) => (row.pressure_overlap?.[metric + '_pressure_hosts'] || []).map(hostLabel).filter(Boolean).join(', ')
const when = value => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit',
    minute: '2-digit', hour12: false,
  }).format(date) + ' WIB'
}
const dateShort = value => {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric',
  }).format(d)
}
function monthOptions() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: 'numeric' })
    .formatToParts(new Date())
  const year = Number(parts.find(part => part.type === 'year')?.value)
  const month = Number(parts.find(part => part.type === 'month')?.value)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1))
    return {
      value: date.toISOString().slice(0, 7),
      label: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(date) + (index === 0 ? ' · ongoing' : ''),
    }
  })
}
const MONTHS = monthOptions()
const CHART_COLORS = ['#3dd6dc', '#839af4', '#af90e7', '#e7a364', '#7ac59c']
const PRESSURE_FILTERS = [
  ['ALL', 'All observations'], ['CPU', 'CPU Pressure'], ['RAM', 'RAM Pressure'], ['WP', 'Critical WP'],
]

function HostTrend({ rows = [], month, metric, mode = 'peak', host = 'ALL', threshold = null, fitObserved = true }) {
  const field = (mode === 'avg' ? 'avg_' : 'peak_') + metric + '_pct'
  const [year, monthNum] = month.split('-').map(Number)
  const days = new Date(Date.UTC(year, monthNum, 0)).getUTCDate()
  const names = [...new Set(rows.map(row => hostLabel(row.host)))].sort().filter(name => host === 'ALL' || name === host)
  const observedDays = rows
    .filter(row => (host === 'ALL' || hostLabel(row.host) === host) &&
      row[field] !== null && row[field] !== undefined && Number.isFinite(Number(row[field])))
    .map(row => Number(String(row.day).slice(-2)))
    .filter(day => Number.isInteger(day) && day >= 1 && day <= days)
  const firstObservedDay = observedDays.length ? Math.min(...observedDays) : 1
  // Display-only focus. Days before the first retained sample remain unavailable,
  // never zero; Full month shows the complete calendar domain on demand.
  const startDay = fitObserved ? firstObservedDay : 1
  const width = 620; const left = 36; const plotW = 566; const top = 12; const plotH = 124
  const xFor = day => left + (day - startDay) * plotW / Math.max(1, days - startDay)
  const yFor = val => top + plotH * (1 - Math.max(0, Math.min(100, Number(val))) / 100)
  const showThreshold = threshold != null && Number.isFinite(Number(threshold))
  return <div className="sphereMonthlyTrend" role="group" aria-label={metric.toUpperCase() + ' daily APP ' + mode + ' trend'}>
    <svg viewBox={'0 0 ' + width + ' 164'} preserveAspectRatio="xMidYMid meet" role="img"
      aria-label={'Saved daily ' + mode + ' host ' + metric + ' percent; missing days are not zero'}>
      {[0,25,50,75,100].map(level => <g key={level}>
        <line x1={left} x2={left + plotW} y1={yFor(level)} y2={yFor(level)} stroke="currentColor" strokeOpacity=".11" strokeDasharray="3 4"/>
        <text x="5" y={yFor(level)+3} fontSize="9" fill="currentColor" opacity=".6">{level}%</text>
      </g>)}
      {[...new Set([startDay,5,10,15,20,25,days].filter(day=>day>=startDay && day<=days))].map(day => <text key={day} x={xFor(day)} y="155" fontSize="9" fill="currentColor" opacity=".7" textAnchor="middle">{day === 1 || day === days ? day + ' ' + new Intl.DateTimeFormat('en-GB',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(year,monthNum-1,1))) : day}</text>)}
      {showThreshold && <g>
        <line x1={left} x2={left + plotW} y1={yFor(threshold)} y2={yFor(threshold)} stroke="#e2b56a" strokeWidth="1.5" strokeDasharray="6 4"/>
        <rect x={left + plotW - 115} y={yFor(threshold) - 15} width="114" height="13" rx="2" fill="#253642"/>
        <text x={left + plotW - 4} y={yFor(threshold) - 5} fontSize="10" fill="#ffd39a" textAnchor="end">Warning {pct(threshold)}</text>
      </g>}
      {names.map((name,i) => {
        const points = rows.filter(row => hostLabel(row.host) === name && row[field] !== null && row[field] !== undefined)
          .map(row => ({day:Number(String(row.day).slice(-2)),value:row[field],
            warningChecks:Number(row[metric+'_warning_checks']||0), peakAt:row['peak_'+metric+'_at']||null})).sort((a,b)=>a.day-b.day)
        return <g key={name}>
          {points.map((point,k) => <g key={point.day}>
            {k>0 && point.day===points[k-1].day+1 && <path
              d={(() => {
                const x0=xFor(points[k-1].day), y0=yFor(points[k-1].value)
                const x1=xFor(point.day), y1=yFor(point.value), dx=(x1-x0)*.42
                return 'M '+x0+' '+y0+' C '+(x0+dx)+' '+y0+' '+(x1-dx)+' '+y1+' '+x1+' '+y1
              })()}
              fill="none" stroke={CHART_COLORS[i%CHART_COLORS.length]}
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>}
            {mode==='peak' && point.warningChecks>0 && <circle cx={xFor(point.day)} cy={yFor(point.value)}
              r="5.5" fill="none" stroke="#e6ad67" strokeWidth="1.3" aria-hidden="true"/>}
            <circle cx={xFor(point.day)} cy={yFor(point.value)} r="2.9" fill={CHART_COLORS[i%CHART_COLORS.length]}>
              <title>{name} · {month}-{String(point.day).padStart(2,'0')} · {pct(point.value)} {mode} {metric.toUpperCase()} · {fmt(point.warningChecks,0)} warning host-checks{mode==='peak' && point.peakAt ? ' · Peak time '+when(point.peakAt) : ''}</title>
            </circle>
          </g>)}
        </g>
      })}
    </svg>
    <div className="sphereMonthlyTrendLegend">
      {names.map((name,i)=><span key={name}><i style={{background:CHART_COLORS[i%CHART_COLORS.length]}}/>{name}</span>)}
    </div>
    <small>Daily peak is the highest saved APP sample per day; gold rings indicate warning readings. Missing dates are not zero.</small>
    {firstObservedDay>1 && <small className="sphereMonthlyObservedNote">
      Data starts {String(firstObservedDay).padStart(2,'0')} {new Intl.DateTimeFormat('en-GB',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(year,monthNum-1,1)))}.
      {fitObserved ? ' Earlier dates are outside this display, not missing-value zeros.' : ' Earlier dates have no retained observations.'}
    </small>}
  </div>
}


const DASHBOARD_COLORS = ['#D4A35D', '#4AA9B8', '#57AB89', '#91A0AB']
const WORKLOAD_GROUPS = [
  { key:'review', label:'Review' },
  { key:'attention', label:'Watch' },
  { key:'normal', label:'Normal' },
  { key:'unknown', label:'Limited Data' },
]

function WorkloadDistribution({ summary = {}, onSelect }) {
  const status = summary.health || {}
  const values = WORKLOAD_GROUPS.map(group => {
    const raw = Number(status[group.key])
    return Number.isFinite(raw) && raw >= 0 ? raw : 0
  })
  const total = values.reduce((sum, value) => sum + value, 0)
  let degrees = 0
  const segments = values.map((value, index) => {
    const size = total > 0 ? value / total * 360 : 0
    const start = degrees
    degrees += size
    return `${DASHBOARD_COLORS[index]} ${start}deg ${degrees}deg`
  })
  return <section className="sphereMonthlyPanel sphereMonthlyVisualCard sphereMonthlyMix" aria-label="Workload review distribution">
    <div className="sphereMonthlyVisualHeading">
      <div><h4>Job & Program Status</h4>
        <small>How observed jobs and programs were classified this month</small></div>
    </div>
    {total>0 ? <div className="sphereMonthlyMixBody">
      <div className="sphereMonthlyDonut" role="img"
        aria-label={WORKLOAD_GROUPS.map((group, index)=>group.label+': '+values[index]).join(', ')}
        style={{background:'conic-gradient('+segments.join(', ')+')'}}>
        <div className="sphereMonthlyDonutCenter">
          <strong>{fmt(total,0)}</strong><span>Workloads</span>
        </div>
      </div>
      <div className="sphereMonthlyMixLegend">
        {WORKLOAD_GROUPS.map((group,index)=>{
          const value = values[index]
          return <button key={group.key} type="button"
            className="sphereMonthlyMixItem"
            onClick={()=>onSelect(group.key.toUpperCase())}
            aria-label={'Open '+group.label+' workloads'}>
            <i aria-hidden="true" style={{background:DASHBOARD_COLORS[index]}}/>
            <span>{group.label}</span><strong>{fmt(value,0)}</strong>
            <small>{fmt(value/total*100,1)}%</small>
          </button>
        })}
      </div>
    </div> : <div className="sphereMonthlyMixEmpty">
      No JOB or PROGRAM workload observations for the selected month.
    </div>}
    <small className="sphereMonthlyVisualNote">Select a category to see the related jobs and programs.</small>
  </section>
}

function PressureRows({ label, evidence, metric, onMetricChange }) {
  const rows = metric === 'ram' ? evidence.top_ram_workloads || [] : evidence.top_cpu_workloads || []
  return <section className="sphereMonthlyPanel sphereMonthlyRank">
    <div className="sphereMonthlyTableHead">
      <div><h4>{label}</h4>
        <small>Top 5 observed workload identities at matching APP and collection · WP CPU 100% = one logical core.</small></div>
      <label className="sphereMonthlyPressureMode">Resource <select className="form-select form-select-sm" aria-label="Pressure workload type" value={metric} onChange={event=>onMetricChange?.(event.target.value)}><option value="cpu">CPU</option><option value="ram">RAM</option></select></label>
    </div>
    <div className="sphereMonthlyTableScroll">
      <table className="table table-sm align-middle sphereBootstrapReportTable"><thead><tr><th>Job / Program</th><th>APP host-checks</th><th>{metric === 'ram' ? 'Peak PSS' : 'Peak WP CPU'}</th></tr></thead>
        <tbody>{rows.map(row => <tr key={id(row)}>
          <td className="sphereMonthlyName"><strong>{row.consumer_key}</strong><small>{row.consumer_type} · Observed APP: {pressureHostsFor(row, metric) || '—'}</small></td>
          <td>{fmt(row.pressure_overlap?.[metric + '_pressure_host_checks'],0)}</td>
          <td>{metric === 'ram' ? fmt(row.pressure_overlap?.pss_peak_during_ram_pressure,2)+' GB'
            : <span className="sphereMonthlyCpuValue"><strong>{pct(row.pressure_overlap?.cpu_peak_during_cpu_pressure)}</strong>
                <small>{wpCoreEq(row.pressure_overlap?.cpu_peak_during_cpu_pressure)}</small></span>}</td>
        </tr>)}
        {!rows.length && <tr><td colSpan="3">No correlated workload recorded during {metric.toUpperCase()} pressure.</td></tr>}
        </tbody>
      </table>
    </div>
  </section>
}

function PressureObservations({ metric, pressure }) {
  const evidence = pressure?.[metric] || {}
  return <section className="sphereMonthlyPanel sphereMonthlyWarningTable">
    <div className="sphereMonthlyTableHead">
      <div><h4>{metric.toUpperCase()} Warning Observations</h4>
        <small>{fmt(evidence.observed_pressure_host_checks,0)} APP checks · Peak {pct(evidence.peak?.peak_pct)} · {hostLabel(evidence.peak?.host)} · {when(evidence.peak?.peak_at)}</small></div>
    </div>
    <div className="sphereMonthlyTableScroll"><table className="table table-sm align-middle sphereBootstrapReportTable">
      <thead><tr><th>APP</th><th>Observed window (WIB)</th><th>Peak / time</th><th>Checks</th></tr></thead>
      <tbody>{(evidence.recent_episodes || []).map((row,index)=><tr key={row.host+String(row.first_at)+index}>
        <td>{hostLabel(row.host)}</td>
        <td>{when(row.first_at)}{row.last_at && row.last_at!==row.first_at && <small>– {when(row.last_at)}</small>}</td>
        <td><strong>{pct(row.peak_pct)}</strong>
          {row.peak_at && row.peak_at!==row.first_at && row.peak_at!==row.last_at && <small>{when(row.peak_at)}</small>}</td>
        <td>{fmt(row.observed_host_checks,0)}</td>
      </tr>)}
      {!evidence.recent_episodes?.length && <tr><td colSpan="4">{evidence.episodes === null ? "No APP observations retained for this month." : "No observations reached the warning threshold."}</td></tr>}
      </tbody>
    </table></div>
  </section>
}

function relatedMonthlyErrorCodes(row, errorEvidence = {}) {
  if (errorEvidence.status === 'ERROR_SOURCE_NOT_RETAINED') return '—'
  const identity = String(row.consumer_key || '').toUpperCase()
  const type = String(row.consumer_type || '').toUpperCase()
  const linked = (errorEvidence.top_errors || []).filter(item =>
    (type === 'PROGRAM' && item.program_link === 'EXPLICIT_ERROR_PROGRAM' &&
      String(item.program || '').toUpperCase() === identity) ||
    (type === 'JOB' && (item.job_names || []).some(name => String(name).toUpperCase() === identity))
  )
  return [...new Set(linked.map(item => item.error_code).filter(Boolean))].join(', ') || '—'
}

function MonthlyErrorAnalysis({ evidence }) {
  const errors = evidence || {}
  const rows = errors.top_errors || []
  const [categoryFilter,setCategoryFilter] = React.useState('ALL')
  const [appFilter,setAppFilter] = React.useState('ALL')
  const categories = [...new Set(rows.map(row=>row.category_label).filter(Boolean))].sort()
  const apps = [...new Set(rows.map(row=>hostLabel(row.host)).filter(Boolean))].sort()
  const visible = rows.filter(row=>(categoryFilter==='ALL'||row.category_label===categoryFilter) &&
    (appFilter==='ALL'||hostLabel(row.host)===appFilter))
  const state = errors.status || 'ERROR_SOURCE_NOT_RETAINED'
  const unknownSource = state === 'ERROR_SOURCE_NOT_RETAINED'
  return <section className="sphereMonthlyPanel sphereMonthlyWide sphereMonthlyErrors" aria-label="ABAP program error review">
    <div className="sphereMonthlyTableHead">
      <div>
        <h4>ABAP Program Error Review</h4>
        <small>Saved SPHERE evidence · Verify errors in ST22 and SM37</small>
      </div>
      <span className="sphereMonthlyErrorCounter">
        {state === 'TRUNCATED' ? 'Partial error history' : state === 'ERROR_SOURCE_NOT_RETAINED' ? 'Error source not retained' :
        state === 'NO_RETAINED_ERROR_EVIDENCE' ? 'No retained error code' :
        state === 'WP_SIGNALS_ONLY' ? 'WP diagnostic signals only' :
        state === 'SNAPSHOT_ONLY' ? 'Snapshot observations only' :
        state === 'UNTIMED_TRACE_ONLY' ? 'Untimed WP trace' : fmt(errors.timestamped_events, 0) + ' timestamped events'}
      </span>
    </div>
    {unknownSource ? <p className="sphereMonthlySourceNote">WP error fields were not retained in this period. Verify historical errors in ST22, SM37, or saved SPHERE archives. This does not mean zero errors.</p> : <>
    <div className="sphereMonthlyStatStrip">
      <span>Timestamped events: {unknownSource ? 'Unavailable' : state === 'TRUNCATED' ? 'Partial' : fmt(errors.timestamped_events, 0)}</span>
      <span>Error observations at snapshot: {unknownSource ? 'Unavailable' : fmt(errors.snapshot_host_checks, 0)}</span>
      <span>Programs with error evidence: {unknownSource ? 'Unavailable' : fmt(errors.error_program_count,0)}</span>
      <span>Error codes: {unknownSource ? 'Unavailable' : fmt(errors.error_code_count,0)}</span>
      <span>RABAX: {unknownSource ? 'Unavailable' : fmt(errors.rabax_wp_checks,0) + ' WP checks'}</span>
      <span>RXMSG: {unknownSource ? 'Unavailable' : fmt(errors.rxmsg_wp_checks,0) + ' WP checks'}</span>
    </div>
    <div className="sphereMonthlyErrorTools">
      <span>{fmt(rows.length,0)} of {fmt(errors.groups ?? rows.length,0)} retained error groups</span>
      <label>Category <select className="form-select form-select-sm" aria-label="Filter error category" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}>
        <option value="ALL">All categories</option>{categories.map(value=><option value={value} key={value}>{value}</option>)}
      </select></label>
      <label>APP <select className="form-select form-select-sm" aria-label="Filter error APP" value={appFilter} onChange={e=>setAppFilter(e.target.value)}>
        <option value="ALL">All APPs</option>{apps.map(value=><option value={value} key={value}>{value}</option>)}
      </select></label>
    </div>
    <div className="sphereMonthlyTableScroll"><table className="table table-sm align-middle sphereBootstrapReportTable"><thead><tr>
      <th>Related program</th><th>Issue type</th><th>SAP error code</th><th>APP / WP / PID</th><th>WP CPU / PSS at snapshot</th>
      <th>Dated events</th><th>Error time (WIB)</th><th>WP checks</th><th>Program link</th>
    </tr></thead><tbody>
      {visible.map((row,index)=><tr key={[row.host,row.error_code,row.program,index].join(':')}>
        <td className="sphereMonthlyName"><strong>{row.program || 'Unidentified program'}</strong>
          {row.job_names?.length>0 && <small>Job context: {row.job_names.join(', ')}</small>}
          {row.sample_workload && <small>Observed workload: {row.sample_workload}</small>}
          {row.log_paths?.[0] && <small title={row.log_paths[0]}>WP trace: {row.log_paths[0]}</small>}
          {row.untimed_trace_checks>0 && <small>Trace without event time: {fmt(row.untimed_trace_checks,0)} checks</small>}</td>
        <td>{row.category_label}</td><td>{row.error_code}</td>
        <td>{hostLabel(row.host)}
          {row.wps?.length>0 && <small>WP {row.wps.join(', ')}</small>}
          {row.pids?.length>0 && <small>PID {row.pids.join(', ')}</small>}</td>
        <td>{row.snapshot_host_checks>0 && (row.cpu_snapshot_pct!=null || row.pss_snapshot_gb!=null)
          ? pct(row.cpu_snapshot_pct) + ' · ' + fmt(row.pss_snapshot_gb,2) + ' GB' : '—'}</td>
        <td>{fmt(row.event_count,0)}</td>
        <td>{row.first_at ? when(row.first_at) : 'Event time unavailable'}
          {row.last_at && row.last_at!==row.first_at && <small>Last event: {when(row.last_at)}</small>}
          {row.observed_at && <small>Snapshot: {when(row.observed_at)}</small>}</td>
        <td>{fmt(row.snapshot_host_checks,0)}</td>
        <td>{row.program_link === 'EXPLICIT_ERROR_PROGRAM' ? 'Explicit WP trace program' : 'Workload context only'}</td>
      </tr>)}
      {!visible.length && <tr><td colSpan="9">{unknownSource
        ? 'WP error fields were not retained in the selected workload history. Recoverable raw SPHERE archives should be checked before concluding no errors.'
        : rows.length ? 'No error evidence matches these filters.'
        : 'No error code was found in available retained observations. Check ST22 and SM37 for authoritative SAP records.'}</td></tr>}
    </tbody></table></div></>}
    {(errors.wp_diagnostics || []).length > 0 && <div className="sphereMonthlyWpDiagnostics">
      <h4>WP Trace Signals for ABAP Review</h4>
      <small>RABAX and RXMSG are WP trace signals, not confirmed ST22 dump or failed-job counts.</small>
      <div className="sphereMonthlyTableScroll"><table className="table table-sm align-middle sphereBootstrapReportTable"><thead><tr><th>Signal</th><th>APP</th><th>Related program</th><th>WP checks</th><th>Peak trace value</th></tr></thead>
        <tbody>{errors.wp_diagnostics.map((item,index)=><tr key={item.signal+item.host+item.program+index}>
          <td>{item.signal}</td><td>{hostLabel(item.host)}</td><td className="sphereMonthlyName"><strong>{item.program}</strong>
            <small>{item.program_link === 'EXPLICIT_ERROR_PROGRAM' ? 'Program explicitly identified' : 'Workload context only: '+(item.sample_workload || 'unavailable')}</small></td>
          <td>{fmt(item.observed_checks,0)}</td><td>{fmt(item.peak_tail_count,0)}</td>
        </tr>)}</tbody>
      </table></div>
    </div>}
    {!unknownSource && <p>{state === 'TRUNCATED' ? 'Retained history is incomplete. ' : ''}RABAX and RXMSG are WP trace signals, not confirmed ST22 dumps. Confirm job status in SM37; program attribution is unverified.</p>}
  </section>
}

export default function RundeckMonthlyReview() {
  const [month,setMonth]=React.useState(MONTHS[1]?.value || MONTHS[0].value)
  const [tab,setTab]=React.useState('summary')
  const [pressureMetric,setPressureMetric]=React.useState('cpu')
  const [kind,setKind]=React.useState('ALL')
  const [health,setHealth]=React.useState('REVIEW')
  const [pressureFilter,setPressureFilter]=React.useState('ALL')
  const [signalFilter,setSignalFilter]=React.useState('ALL')
  const [search,setSearch]=React.useState('')
  const [appliedSearch,setAppliedSearch]=React.useState('')
  const [page,setPage]=React.useState(0)
  const [data,setData]=React.useState(null)
  const [loading,setLoading]=React.useState(true)
  const [error,setError]=React.useState('')
  const [chartMode,setChartMode]=React.useState('peak')
  const [chartHost,setChartHost]=React.useState('ALL')
  const [chartMetric,setChartMetric]=React.useState('cpu')
  const [chartFitObserved,setChartFitObserved]=React.useState(true)
  const [pdfMode,setPdfMode]=React.useState('management')
  const [pdfBusy,setPdfBusy]=React.useState(false)
  const [pdfError,setPdfError]=React.useState('')
  const [pdfUrl,setPdfUrl]=React.useState('')
  const pdfRef=React.useRef('')
  const pdfInFlightRef=React.useRef(false)
  const pdfGenerationRef=React.useRef(0)
  React.useEffect(()=>()=>{if(pdfRef.current) URL.revokeObjectURL(pdfRef.current)},[])
  React.useEffect(()=>{
    const timer=window.setTimeout(()=>setAppliedSearch(search.trim()),300)
    return ()=>window.clearTimeout(timer)
  },[search])
  React.useEffect(()=>{
    const controller=new AbortController()
    const params=new URLSearchParams({
      month,type:kind,health,pressure:pressureFilter,flag:signalFilter,q:appliedSearch,
      limit:String(PAGE_SIZE),offset:String(page*PAGE_SIZE),
    })
    pdfGenerationRef.current += 1
    if(pdfRef.current)URL.revokeObjectURL(pdfRef.current)
    pdfRef.current='';setPdfUrl('')
    setLoading(true);setError('');setData(null)
    fetch(API+'/evaluation/workloads/monthly?'+params.toString(),{cache:'no-store',signal:controller.signal})
      .then(async response=>{
        if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.detail||'Monthly evidence unavailable (HTTP '+response.status+')')}
        return response.json()
      })
      .then(payload=>{
        if(controller.signal.aborted)return
        if(payload.month!==month||payload.period!=='month'||payload.page?.scope!=='FULL_EVALUATED_POPULATION')throw Error('Invalid monthly evidence contract')
        if(!payload.monthly_pressure||!payload.monthly_errors)throw Error('Monthly pressure or error evidence is unavailable on this backend')
        setData(payload)
      })
      .catch(failure=>{if(!controller.signal.aborted)setError(failure.message||'Historical evidence unavailable')})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return ()=>controller.abort()
  },[month,kind,health,pressureFilter,signalFilter,appliedSearch,page])
  const changeMonth=value=>{
    pdfGenerationRef.current += 1
    setMonth(value);setPage(0);setKind('ALL');setHealth('REVIEW');setPressureFilter('ALL');setSignalFilter('ALL')
    setSearch('');setAppliedSearch('');setPdfError('')
    if(pdfRef.current)URL.revokeObjectURL(pdfRef.current)
    pdfRef.current='';setPdfUrl('')
  }
  const changeFilter=(setter,value)=>{pdfGenerationRef.current += 1;setter(value);setPage(0)}
  const handleTabKeyDown=(event,value)=>{
    const order=['summary','evidence','report']
    const current=order.indexOf(value)
    const next=event.key==='ArrowRight'?order[(current+1)%order.length]
      :event.key==='ArrowLeft'?order[(current+order.length-1)%order.length]
        :event.key==='Home'?order[0]:event.key==='End'?order[order.length-1]:null
    if(!next)return
    event.preventDefault()
    setTab(next)
    event.currentTarget.parentElement?.querySelector('#sphere-month-tab-'+next)?.focus()
  }
  const items=data?.items||[]
  const quality=data?.quality||{}
  const summary=data?.summary||{}
  const evidence=data?.monthly_pressure||{}
  const errors=data?.monthly_errors||{}
  const tuningCandidates=data?.monthly_abap_candidates||[]
  const hosts=evidence.hosts||[]
  const total=Number(data?.page?.total||0)
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE))
  const changePdfMode=mode=>{
    if(!['management','technical'].includes(mode))return
    pdfGenerationRef.current+=1
    if(pdfRef.current)URL.revokeObjectURL(pdfRef.current)
    pdfRef.current='';setPdfUrl('');setPdfError('')
    setPdfMode(mode)
  }
  const previewPdf=React.useCallback(async()=>{
    if(!data||loading||pdfBusy||pdfInFlightRef.current)return
    pdfInFlightRef.current=true
    const generation=pdfGenerationRef.current
    setPdfBusy(true);setPdfError('')
    try{
      // Reports must never depend on Detailed Evidence paging, search or filters.
      // Fetch a canonical month-scoped population before building either PDF.
      const params = new URLSearchParams({
        month, type:'ALL', health:'ALL', pressure:'ALL', flag:'ALL',
        q:'', limit:String(PAGE_SIZE), offset:'0',
      })
      const response = await fetch(API+'/evaluation/workloads/monthly?'+params.toString(), {cache:'no-store'})
      if(!response.ok) throw Error('Monthly PDF evidence unavailable (HTTP '+response.status+')')
      const reportData = await response.json()
      if(generation!==pdfGenerationRef.current) return
      if(reportData.month!==month || reportData.period!=='month' ||
          reportData.page?.scope!=='FULL_EVALUATED_POPULATION' ||
          !reportData.monthly_pressure || !reportData.monthly_errors || !reportData.quality) {
        throw Error('PDF evidence does not match the selected reporting month')
      }
      const blob=await (pdfMode==='management'
        ? buildManagementMonthlyPdf({month,data:reportData})
        : buildMonthlyPdf({month,data:reportData}))
      if(generation!==pdfGenerationRef.current)return
      const url=URL.createObjectURL(blob)
      if(pdfRef.current)URL.revokeObjectURL(pdfRef.current)
      pdfRef.current=url
      setPdfUrl(url)
    }catch(failure){if(generation===pdfGenerationRef.current)setPdfError(failure.message||'PDF could not be generated')}
    finally{pdfInFlightRef.current=false;setPdfBusy(false)}
  },[data,loading,pdfBusy,month,pdfMode])
  // One click on Report generates a source-backed preview. Errors stop auto-retries.
  React.useEffect(()=>{
    if(tab==='report' && data && !loading && !pdfBusy && !pdfUrl && !pdfError) void previewPdf()
  },[tab,data,loading,pdfBusy,pdfUrl,pdfError,previewPdf])
  return <section className="sphereMonthlyReview is-v2 container-fluid px-0" aria-label="Monthly SAP Performance and Job Impact">
    <div className="sphereMonthlyHead">
      <div><strong>Monthly Review</strong></div>
      <div className="sphereMonthlyPicker">
        <label htmlFor="sphere-month-choice">Reporting month</label>
        <select className="form-select form-select-sm" id="sphere-month-choice" value={month} onChange={event=>changeMonth(event.target.value)}>
          {MONTHS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
    </div>
    <div className="sphereMonthlyTabs" role="tablist" aria-label="Monthly report sections">
      {[['summary','Summary'],['evidence','Detailed Evidence'],['report','PDF Report']]
        .map(([value,label])=><button key={value} type="button" role="tab"
          id={'sphere-month-tab-'+value} aria-controls={'sphere-month-panel-'+value}
          aria-selected={tab===value} tabIndex={tab===value?0:-1}
          className={tab===value?'is-active':''}
          onKeyDown={event=>handleTabKeyDown(event,value)}
          onClick={()=>setTab(value)}>{label}</button>)}
    </div>
    {loading&&<div className="sphereMonthlyState" role="status">Loading historical CPU, RAM and workload evidence…</div>}
    {error&&<div className="sphereMonthlyState is-error" role="alert">{error}. No simulated values are substituted.</div>}
    {data&&!loading&&<>
      <div className="sphereMonthlyProvenance" title={'Reporting month: ' + month + ' · Monitoring records ' + fmt(quality.complete_checks,0) + ' / ~' + fmt(quality.expected_checks,0) + ' expected (' + pct(quality.coverage_pct) + ') · Recorded ' + dateShort(quality.first_complete_at) + ' – ' + dateShort(quality.last_complete_at)}>
        <span><b>{fmt(quality.complete_checks,0)}</b> complete collections · Estimated coverage {pct(quality.coverage_pct)}{quality.expected_checks_is_estimate ? ` (~${fmt(quality.expected_checks,0)} expected)` : ''}</span>
        <span>{dateShort(quality.first_complete_at)} – {dateShort(quality.last_complete_at)}</span>
      </div>
      {tab==='summary'&&<div id="sphere-month-panel-summary" role="tabpanel" aria-labelledby="sphere-month-tab-summary" className="sphereMonthlyLayout sphereMonthlyDashboard">
        <div className="sphereMonthlyVisualGrid sphereMonthlyMainColumn col-12 col-xl-7">
          <section className="sphereMonthlyPanel sphereMonthlyVisualCard sphereMonthlyPrimaryTrend">
            <div className="sphereMonthlyVisualHeading">
              <div><h4>Daily Server Performance</h4>
                <small>{chartMode==='peak'?'Highest':'Average'} reading each day · {month}</small></div>
              <div className="sphereMonthlyFilters sphereMonthlyVisualFilters">
                <select className="form-select form-select-sm" aria-label="Resource metric" value={chartMetric} onChange={event=>setChartMetric(event.target.value)}>
                  <option value="cpu">CPU</option><option value="ram">RAM</option>
                </select>
                <select className="form-select form-select-sm" aria-label="Trend statistic" value={chartMode} onChange={event=>setChartMode(event.target.value)}>
                  <option value="peak">Daily peak</option><option value="avg">Daily average</option>
                </select>
                <select className="form-select form-select-sm" aria-label="Select APP trend" value={chartHost} onChange={event=>setChartHost(event.target.value)}>
                  <option value="ALL">All APP</option>
                  {hosts.map(row=><option key={row.host} value={hostLabel(row.host)}>{hostLabel(row.host)}</option>)}
                </select>
                <button type="button" className="sphereMonthlyChartFit" aria-pressed={chartFitObserved}
                  onClick={()=>setChartFitObserved(value=>!value)} title="Fit saved observations or view the full month without inventing missing data">
                  {chartFitObserved?'Full month':'Fit observed'}
                </button>
              </div>
            </div>
            <HostTrend rows={evidence.daily_hosts||[]} month={month} metric={chartMetric}
              mode={chartMode} host={chartHost} fitObserved={chartFitObserved}
              threshold={evidence.thresholds?.[chartMetric+'_warning_pct']}/>
            <div className="sphereMonthlyVisualFooter">
              <span>{fmt(evidence[chartMetric]?.observed_pressure_host_checks,0)} {chartMetric.toUpperCase()} warning checks across {fmt(evidence[chartMetric]?.observed_warning_app_days,0)} APP-days</span>
            </div>
          </section>
                  <div className="sphereMonthlyPanel sphereMonthlyHostSummary">
          <h4>Server Performance by APP</h4>
          <div className="sphereMonthlyTableScroll"><table className="table table-sm align-middle sphereBootstrapReportTable"><thead><tr>
            <th>APP</th><th>CPU Peak</th><th>RAM Peak</th><th>CPU / RAM Warning Checks</th><th>Critical WP Checks</th>
          </tr></thead><tbody>
            {hosts.map(row=><tr key={row.host}><td>{hostLabel(row.host)}</td>
              <td title={'Average CPU '+pct(row.avg_cpu_pct)}>{pct(row.peak_cpu_pct)}</td><td title={'Average RAM '+pct(row.avg_ram_pct)}>{pct(row.peak_ram_pct)}</td>
              <td title={'CPU '+fmt(row.cpu_warning_host_checks,0)+' readings / '+fmt(row.cpu_warning_days,0)+' days; RAM '+fmt(row.ram_warning_host_checks,0)+' readings / '+fmt(row.ram_warning_days,0)+' days'}>{fmt(row.cpu_warning_host_checks,0)} / {fmt(row.ram_warning_host_checks,0)}</td>
              <td title="Saved APP host checks with critical work processes; not confirmed failures">{fmt(row.critical_wp_host_checks,0)}</td></tr>)}
            {!hosts.length&&<tr><td colSpan="5">No historical host samples available.</td></tr>}
          </tbody></table></div>
          <small>Warning and Critical WP counts are saved APP host checks, not confirmed job failures.</small>
        </div>
        
        </div>
        <div className="sphereMonthlySideColumn col-12 col-xl-5">
          <WorkloadDistribution summary={summary} onSelect={value=>{
            setKind('ALL');setPressureFilter('ALL');setSignalFilter('ALL')
            setHealth(value);setPage(0);setSearch('');setAppliedSearch('');setTab('evidence')
          }}/>

          <section className="sphereMonthlyPanel sphereMonthlyPriorities" aria-label="Programs to review">
          <div className="sphereMonthlyTableHead"><div><h4>Programs to Review</h4><small>{fmt(tuningCandidates.length,0)} saved evaluation candidates · not confirmed failed jobs</small></div>
            <button type="button" onClick={()=>setTab('evidence')}>View All</button></div>
          <div className="sphereMonthlyPriorityList">
            {tuningCandidates.slice(0,5).map(row=><div key={id(row)} className="sphereMonthlyPriorityRow">
              <span><strong title={row.consumer_key}>{row.consumer_key}</strong><small>{row.consumer_type} · {hostsFor(row)||'APP unavailable'}</small></span>
              <span title="Work process CPU, not APP utilization">{pct(row.peak_cpu_pct)} WP CPU</span>
            </div>)}
            {!tuningCandidates.length&&<p>No review candidates in retained observations.</p>}
          </div>
          <small>ABAP errors: {errors.status==='ERROR_SOURCE_NOT_RETAINED' ? 'Source not retained — check archives' : fmt(errors.error_program_count,0)+' programs with retained error evidence'}</small>
        </section>
        </div>
      </div>}
      {tab==='evidence'&&<div id="sphere-month-panel-evidence" role="tabpanel" aria-labelledby="sphere-month-tab-evidence" className="sphereMonthlyEvidencePage">
      <div className="sphereMonthlyPanel">
        <div className="sphereMonthlyTableHead">
          <div><h4>Jobs & Programs to Review</h4><small>{total} results. Page {page+1} of {pages}</small></div>
          <div className="sphereMonthlyFilters">
            <input type="search" className="form-control form-control-sm" value={search} onChange={event=>{pdfGenerationRef.current+=1;setSearch(event.target.value);setPage(0)}}
              placeholder="Search full job / program name" aria-label="Search job and program"/>
            <select className="form-select form-select-sm" aria-label="Workload type" value={kind} onChange={event=>changeFilter(setKind,event.target.value)}>
              <option value="ALL">All types</option><option value="JOB">Jobs</option><option value="PROGRAM">Programs</option>
            </select>
            <select className="form-select form-select-sm" aria-label="Evaluation group" value={health} onChange={event=>changeFilter(setHealth,event.target.value)}>
              <option value="REVIEW">Review required</option><option value="ATTENTION">Watch</option>
              <option value="ALL">All evaluations</option><option value="NORMAL">Normal</option><option value="UNKNOWN">Limited Data</option>
            </select>
            <select className="form-select form-select-sm" aria-label="Workload signal" value={signalFilter} onChange={event=>changeFilter(setSignalFilter,event.target.value)}>
              <option value="ALL">All signals</option>
              <option value="HIGH_CPU">High CPU</option>
              <option value="HIGH_MEMORY">High memory</option>
              <option value="RECURRING">Recurring</option>
            </select>
            <select className="form-select form-select-sm" aria-label="Resource pressure filter" value={pressureFilter} onChange={event=>changeFilter(setPressureFilter,event.target.value)}>
              {PRESSURE_FILTERS.map(([value,label])=><option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>
        <small className="sphereMonthlyCpuNote">WP CPU: 100% = 1 logical CPU core; not host CPU utilization.</small>
        <div className="sphereMonthlyTableScroll"><table className="table table-sm align-middle sphereBootstrapReportTable"><thead><tr>
          <th>Job / Program</th><th>Observed APPs</th><th>Avg / Peak WP CPU</th><th>Avg / Peak PSS</th>
          <th>Observations</th><th>CPU / RAM Warnings</th><th>Critical WP Checks</th><th>ABAP Error Code</th>
        </tr></thead><tbody>
          {items.map(row=><tr key={id(row)}>
            <td className="sphereMonthlyName">
              <strong>{row.consumer_key}</strong>
              <small>{row.consumer_type} · {row.assessment||'Observed'}</small>
              {(row.first_seen || row.last_seen) && <small>{row.first_seen && row.last_seen && row.first_seen===row.last_seen
                ? 'Observed ' + when(row.first_seen)
                : 'First ' + (row.first_seen ? when(row.first_seen) : '—') + ' · Last ' + (row.last_seen ? when(row.last_seen) : '—')}</small>}
            </td>
            <td>{hostsFor(row)||'—'}</td>
            <td className="sphereMonthlyCpuValue">
              <strong>{pct(row.avg_cpu_pct)} / {pct(row.peak_cpu_pct)}</strong>
              <small>{wpCoreEq(row.avg_cpu_pct)} / {wpCoreEq(row.peak_cpu_pct)}</small>
            </td>
            <td>{fmt(row.avg_pss_gb,2)} / {fmt(row.peak_pss_gb,2)} GB</td>
            <td>{fmt(row.occurrences,0)}<small>{fmt(row.host_observations,0)} host checks · max {fmt(row.peak_process_count,0)} processes</small></td>
            <td>{fmt(row.pressure_overlap?.cpu_pressure_host_checks,0)} / {fmt(row.pressure_overlap?.ram_pressure_host_checks,0)}
              <small>CPU: {pressureHostsFor(row,'cpu')||'—'} · RAM: {pressureHostsFor(row,'ram')||'—'}</small></td>
            <td>{fmt(row.pressure_overlap?.wp_host_checks,0)}</td>
            <td>{relatedMonthlyErrorCodes(row,errors)}</td>
          </tr>)}
          {!items.length&&<tr><td colSpan="8">No jobs or programs match these filters.</td></tr>}
        </tbody></table></div>
        <div className="sphereMonthlyPager"><small>Filters use saved SPHERE observations</small>
          <button type="button" disabled={page===0} onClick={()=>setPage(n=>n-1)}>Previous</button>
          <button type="button" disabled={page+1>=pages} onClick={()=>setPage(n=>n+1)}>Next</button>
        </div>
      </div>
      <section className="sphereMonthlyEvidenceDisclosure" aria-label="Resource pressure and ABAP error evidence">
      <h4 className="sphereMonthlyEvidenceTitle">Resource Pressure & ABAP Errors</h4>
      <div className="sphereMonthlyImpact">
        <div className="sphereMonthlyPanel sphereMonthlyPressureSummary sphereMonthlyWide"><h4>Resource Warning Summary</h4>
          <div className="sphereMonthlyStatStrip">
            <span>CPU ≥ {pct(evidence.thresholds?.cpu_warning_pct)} · {fmt(evidence.cpu?.observed_pressure_host_checks,0)} checks</span>
            <span>RAM ≥ {pct(evidence.thresholds?.ram_warning_pct)} · {fmt(evidence.ram?.observed_pressure_host_checks,0)} checks</span>
          </div>
          <p>APP readings are historical observations; matching workloads are review candidates, not confirmed causes.</p>
        </div>
        <PressureObservations metric="cpu" pressure={evidence}/>
        <PressureObservations metric="ram" pressure={evidence}/>
        <PressureRows label="Jobs & Programs During Resource Pressure" evidence={evidence} metric={pressureMetric} onMetricChange={setPressureMetric}/>
        <MonthlyErrorAnalysis key={month} evidence={errors}/>
      </div></section></div>}
      {tab==='report'&&<div id="sphere-month-panel-report" role="tabpanel" aria-labelledby="sphere-month-tab-report" className="sphereMonthlyPanel sphereMonthlyReportPreview">
        <div className="sphereMonthlyTableHead">
          <div><h4>Monthly Report</h4><small>Management: one A4 landscape page · Technical: detailed saved evidence</small></div>
          <div className="sphereMonthlyReportActions">
            <label htmlFor="sphere-monthly-pdf-mode">Report type</label>
            <select className="form-select form-select-sm" id="sphere-monthly-pdf-mode" aria-label="Report type" value={pdfMode}
              onChange={event=>changePdfMode(event.target.value)}>
              <option value="management">Management · 1 page</option>
              <option value="technical">Technical · full detail</option>
            </select>
          <button type="button" className="is-primary" disabled={pdfBusy || !data} onClick={previewPdf}>
            {pdfBusy?'Generating…':pdfUrl?'Refresh PDF':'Generate PDF'}
          </button>
          {pdfUrl && <a className="sphereMonthlyDownload" href={pdfUrl}
            download={'SPHERE-Monthly-'+(pdfMode==='management'?'Management-Summary-':'Technical-Review-')+month+'.pdf'}>
            Download PDF
          </a>}
          </div>
        </div>
        {pdfError&&<p className="sphereMonthlyWarning" role="alert">{pdfError}</p>}
        {pdfUrl&&<div className="sphereMonthlyPdfFrame">
          <iframe title={'SPHERE '+(pdfMode==='management'?'management summary':'technical report')+' PDF preview'}
            src={pdfUrl+'#toolbar=0&navpanes=0&view=FitH'}/>
          <div className="sphereMonthlyPdfActions">
            <span>Preview may show browser controls. Full report is available above.</span>
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">Open full screen</a>
          </div>
        </div>}
      </div>}
    </>}
  </section>
}

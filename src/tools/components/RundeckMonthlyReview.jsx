import React from 'react'
import { wpCpuCoreEquivalent } from './monthlyCpuMetrics.js'
import { shortHost } from './sapUiFormat.js'
import { buildMonthlyPdf } from './rundeckMonthlyPdf.js'
import { buildManagementMonthlyPdf, monthlyEnterpriseReportModel } from './rundeckMonthlyEnterprisePdf.js'
import './RundeckMonthlyReview.css'
import './RundeckMonthlyFinal20261030.css'
import RundeckWorkspaceDrawer from './RundeckWorkspaceDrawer.jsx'
import './RundeckUnifiedExperience20261030.css'

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


const monthlySize = bytes => {
  if(bytes===null || bytes===undefined || !Number.isFinite(Number(bytes)))return 'Not Collected'
  const unit=Number(bytes)>=1e12?'TB':'GB'
  return fmt(Number(bytes)/(unit==='TB'?1e12:1e9),2)+' '+unit
}
const MONTHLY_STORAGE_ROWS=['File System OS','FS SAP Archive','Archive INTF','INTF']

function MonthlyRanking({ title, rows=[], metric }) {
  const values=rows.map(row=>metric==='cpu'?wpCpuCoreEquivalent(row.peak_cpu_pct):Number(row.peak_pss_gb))
  const top=Math.max(0,...values.filter(v=>v!==null && Number.isFinite(v)))
  return <section className="sphereMonthlyManagerPanel" aria-label={title}>
    <h4>{title}</h4>
    <div className="sphereMonthlyManagerBars">
      {rows.slice(0,10).map((row,index)=>{
        const val=values[index]
        const usable=val!==null&&Number.isFinite(val)
        return <div className="sphereMonthlyManagerBar" key={id(row)}>
          <span className="sphereMonthlyManagerJob" title={row.consumer_key}>{row.consumer_key}</span>
          <div className="sphereMonthlyManagerTrack"><i style={{width:usable&&top>0?(val/top*100)+'%':'0%'}}/></div>
          <b>{usable?fmt(val,2)+(metric==='cpu'?' cores':' GB'):'—'}</b>
        </div>
      })}
      {!rows.length&&<span className="sphereMonthlyManagerMissing">Not Collected</span>}
    </div>
  </section>
}
function MonthlyManagementDashboard({month,full,preview,storage}) {
  const data=full||preview
  const pressure=data?.monthly_pressure||{}
  const model=full && Array.isArray(full.monthly_top_wp_cpu) &&
    Array.isArray(full.monthly_top_wp_pss) && storage?.month===month
    ? monthlyEnterpriseReportModel(month,{...full,monthly_storage:storage}) : null
  const hosts=Array.from({length:5},(_,i)=>{
    const name='APP'+(i+1)
    return (pressure.hosts||[]).find(row=>hostLabel(row.host)===name)||{host:name}
  })
  const peak=metric=>{
    const p=model?.[metric==='cpu'?'cpuPeak':'ramPeak']
    return p ? 'Peak '+pct(p.value)+' · '+p.host+' · '+when(p.at) : 'Not Collected'
  }
  return <div className="sphereMonthlyManagement" aria-label="SAP Monthly Performance Report">
    <div className="sphereMonthlyManagerPair">
      {['cpu','ram'].map(metric=><section className="sphereMonthlyManagerPanel" key={metric}>
        <div className="sphereMonthlyManagerHeading"><h4>{metric==='cpu'?'CPU Utilization Trend':'Memory Utilization Trend'}</h4><strong>{peak(metric)}</strong></div>
        <HostTrend rows={pressure.daily_hosts||[]} month={month} metric={metric}
          fitObserved={false} threshold={pressure.thresholds?.[metric+'_warning_pct']}/>
      </section>)}
    </div>
    <div className="sphereMonthlyManagerPair">
      <MonthlyRanking title="Top 10 Jobs by Peak WP CPU" metric="cpu" rows={model?.sortedCpu||[]}/>
      <MonthlyRanking title="Top 10 Jobs by Peak WP Memory" metric="ram" rows={model?.sortedPss||[]}/>
    </div>
    <div className="sphereMonthlyManagerPair is-tables">
      <section className="sphereMonthlyManagerPanel">
        <h4>Application Server Performance</h4>
        <table className="sphereMonthlyManagerTable"><thead><tr><th>APP</th><th>CPU Avg</th><th>CPU Max</th><th>RAM Avg</th><th>RAM Max</th><th>CPU High Reads</th><th>RAM High Reads</th></tr></thead>
          <tbody>{hosts.map(row=><tr key={row.host}>
            <td>{hostLabel(row.host)}</td><td>{pct(row.avg_cpu_pct)}</td><td>{pct(row.peak_cpu_pct)}</td>
            <td>{pct(row.avg_ram_pct)}</td><td>{pct(row.peak_ram_pct)}</td>
            <td>{fmt(row.cpu_warning_host_checks,0)}</td><td>{fmt(row.ram_warning_host_checks,0)}</td>
          </tr>)}</tbody>
        </table>
      </section>
      <section className="sphereMonthlyManagerPanel">
        <h4>Top 10 Jobs for Tuning Review</h4>
        <table className="sphereMonthlyManagerTable"><thead><tr><th>No</th><th>Program / Job</th><th>APP</th><th>Samples</th><th>CPU cores</th><th>PSS GB</th><th>Evidence WIB</th><th>Review finding</th><th>Tuning action</th></tr></thead>
          <tbody>{(model?.candidates||[]).map((row,index)=><tr key={id(row)}>
            <td>{index+1}</td><td className="is-job">{row.consumer_key}</td>
            <td>{hostsFor(row)||'—'}</td><td>{fmt(row.observations,0)}</td>
            <td>{wpCoreEq(row.peak_cpu_pct)}</td><td>{fmt(row.peak_pss_gb,2)}</td>
            <td>{when(row.last_seen)}</td>
            <td>{row.signals?.high_memory?'High WP memory':row.signals?.sustained_high_cpu?'High WP CPU':row.signals?.cpu_spike?'WP CPU spike':row.signals?.baseline_anomaly?'Above baseline':'Performance review'}</td>
            <td>{row.signals?.high_memory?'Review memory use':row.signals?.sustained_high_cpu||row.signals?.cpu_spike?'Review processing':row.signals?.baseline_anomaly?'Check workload change':'Review in SAP'}</td>
          </tr>)}
          {!model&&<tr><td colSpan="9">Loading saved evaluation…</td></tr>}
          {model&&!model.candidates.length&&<tr><td colSpan="9">No candidates observed for this month</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
    <section className="sphereMonthlyManagerPanel is-storage">
      <h4>Storage Capacity</h4>
      <table className="sphereMonthlyManagerTable"><thead><tr><th>File System</th><th>Mounted On / Host</th><th>Total Capacity</th><th>Used Capacity</th><th>Free Capacity</th><th>Usage %</th><th>Sample WIB</th></tr></thead><tbody>
        {MONTHLY_STORAGE_ROWS.map(name=>{
          const row=storage?.month===month?storage.items?.find(r=>r.category===name):null
          const present=row?.status==='COLLECTED'
          return <tr key={name}><td>{name}</td>
            <td>{present?row.mount_point+' · '+hostLabel(row.host):'Not Collected'}</td>
            <td>{present?monthlySize(row.total_bytes):'—'}</td><td>{present?monthlySize(row.used_bytes):'—'}</td>
            <td>{present?monthlySize(row.free_bytes):'—'}</td><td>{present?pct(row.used_pct):'—'}</td>
            <td>{present?when(row.sample_at):'—'}</td></tr>
        })}
      </tbody></table>
    </section>
  </div>
}

export default function RundeckMonthlyReview({ showTitle = true }) {
  const [month,setMonth]=React.useState(MONTHS[1]?.value || MONTHS[0].value)
  const [evidenceOpen,setEvidenceOpen]=React.useState(false)
  const [pressureMetric,setPressureMetric]=React.useState('cpu')
  const [kind,setKind]=React.useState('ALL')
  const [health,setHealth]=React.useState('REVIEW')
  const [pressureFilter,setPressureFilter]=React.useState('ALL')
  const [signalFilter,setSignalFilter]=React.useState('ALL')
  const [search,setSearch]=React.useState('')
  const [appliedSearch,setAppliedSearch]=React.useState('')
  const [page,setPage]=React.useState(0)
  const [data,setData]=React.useState(null)
  const [hostPreview,setHostPreview]=React.useState(null)
  const [hostPreviewError,setHostPreviewError]=React.useState('')
  const [hostPreviewRetry,setHostPreviewRetry]=React.useState(0)
  const [storage,setStorage]=React.useState(null)
  const [storageError,setStorageError]=React.useState('')
  const [loading,setLoading]=React.useState(true)
  const [error,setError]=React.useState('')
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
    setStorage(null);setStorageError('')
    fetch(API+'/infra/monthly-storage?'+new URLSearchParams({month}),{
      cache:'no-store',signal:controller.signal,
    }).then(async response=>{
      if(!response.ok)throw Error('Monthly storage history unavailable (HTTP '+response.status+')')
      return response.json()
    }).then(payload=>{
      if(!controller.signal.aborted){
        if(payload.month!==month || !Array.isArray(payload.items))throw Error('Invalid monthly storage evidence')
        setStorage(payload)
      }
    }).catch(failure=>{
      if(!controller.signal.aborted)setStorageError(failure.message||'Monthly storage unavailable')
    })
    return ()=>controller.abort()
  },[month])
  // Render retained monthly CPU/RAM/APP observations independently of the slower
  // full workload classification, correlation and WP error analysis.
  React.useEffect(()=>{
    const controller=new AbortController()
    setHostPreview(null)
    setHostPreviewError('')
    const previewDeadline=AbortSignal.timeout(20_000)
    fetch(API+'/evaluation/workloads/monthly/hosts?'+new URLSearchParams({month}), {
      cache:'no-store', signal:AbortSignal.any([controller.signal,previewDeadline]),
    })
      .then(async response=>{
        if(!response.ok)throw Error('Monthly host summary unavailable (HTTP '+response.status+')')
        return response.json()
      })
      .then(payload=>{
        if(controller.signal.aborted)return
        if(payload.month!==month||payload.preview_only!==true||
            !payload.monthly_pressure||!payload.quality)
          throw Error('Monthly host summary is not verified')
        setHostPreview(payload)
      })
      .catch(failure=>{
        if(!controller.signal.aborted)setHostPreviewError(previewDeadline.aborted
          ? 'Monthly host summary exceeded 20 seconds; check API and database'
          : failure.message||'Monthly host summary unavailable')
      })
    return ()=>controller.abort()
  },[month,hostPreviewRetry])
  // A boolean dependency avoids re-requesting expensive evidence just because
  // the user switches between Summary, Detailed Evidence and PDF Report.
  const fullEvaluationReady = hostPreview?.month===month
  React.useEffect(()=>{
    // Prioritize the host-only request on Summary. A failed host preview must
    // not trigger an even heavier fallback request or leave a permanent spinner.
    if(!fullEvaluationReady) {
      setLoading(!hostPreviewError)
      return
    }
    const controller=new AbortController()
    const params=new URLSearchParams({
      month,type:kind,health,pressure:pressureFilter,flag:signalFilter,q:appliedSearch,
      limit:String(PAGE_SIZE),offset:String(page*PAGE_SIZE),
    })
    pdfGenerationRef.current += 1
    if(pdfRef.current)URL.revokeObjectURL(pdfRef.current)
    pdfRef.current='';setPdfUrl('')
    setLoading(true);setError('');setData(null)
    const evaluationDeadline=AbortSignal.timeout(35_000)
    fetch(API+'/evaluation/workloads/monthly?'+params.toString(),{
      cache:'no-store',signal:AbortSignal.any([controller.signal,evaluationDeadline]),
    })
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
      .catch(failure=>{if(!controller.signal.aborted)setError(evaluationDeadline.aborted
        ? 'Monthly evaluation exceeded 35 seconds; inspect backend SQL timings'
        : failure.message||'Historical evidence unavailable')})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return ()=>controller.abort()
  },[month,kind,health,pressureFilter,signalFilter,appliedSearch,page,fullEvaluationReady,hostPreviewError])
  const changeMonth=value=>{
    pdfGenerationRef.current += 1
    setMonth(value);setEvidenceOpen(false);setPage(0);setKind('ALL');setHealth('REVIEW');setPressureFilter('ALL');setSignalFilter('ALL')
    setSearch('');setAppliedSearch('');setPdfError('')
    if(pdfRef.current)URL.revokeObjectURL(pdfRef.current)
    pdfRef.current='';setPdfUrl('')
  }
  const changeFilter=(setter,value)=>{pdfGenerationRef.current += 1;setter(value);setPage(0)}
  const preview=hostPreview?.month===month ? hostPreview : null
  const completedData=data?.month===month ? data : null
  const items=completedData?.items||[]
  const evidence=hostData?.monthly_pressure||{}
  const errors=completedData?.monthly_errors||{}
  const total=Number(completedData?.page?.total||0)
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE))
  const previewPdf=React.useCallback(async(reportType='management')=>{
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
      let exportData=reportData
      if(reportType==='management') {
        const storageResponse=await fetch(API+'/infra/monthly-storage?'+new URLSearchParams({month}),{cache:'no-store'})
        if(!storageResponse.ok)throw Error('Monthly storage evidence unavailable (HTTP '+storageResponse.status+')')
        const monthlyStorage=await storageResponse.json()
        if(monthlyStorage.month!==month || !Array.isArray(monthlyStorage.items))throw Error('Storage evidence is not from selected month')
        exportData={...reportData,monthly_storage:monthlyStorage}
      }
      const blob=await (reportType==='management'
        ? buildManagementMonthlyPdf({month,data:exportData})
        : buildMonthlyPdf({month,data:exportData}))
      if(generation!==pdfGenerationRef.current)return
      const url=URL.createObjectURL(blob)
      if(pdfRef.current)URL.revokeObjectURL(pdfRef.current)
      pdfRef.current=url
      setPdfMode(reportType)
      setPdfUrl(url)
    }catch(failure){if(generation===pdfGenerationRef.current)setPdfError(failure.message||'PDF could not be generated')}
    finally{pdfInFlightRef.current=false;setPdfBusy(false)}
  },[data,loading,pdfBusy,month])
  return <section className="sphereMonthlyReview is-v2 is-single-page container-fluid px-0" aria-label="Monthly SAP Performance and Job Impact">
    <div className="sphereMonthlyHead">
      {showTitle && <div><strong>Monthly Review</strong></div>}
      <div className="sphereMonthlyPicker">
        <label htmlFor="sphere-month-choice">Reporting month</label>
        <select className="form-select form-select-sm" id="sphere-month-choice" value={month} onChange={event=>changeMonth(event.target.value)}>
          {MONTHS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
    </div>
    <div className="sphereMonthlyReportActions sphereMonthlyOnePageActions" role="group" aria-label="Monthly report actions">
      <button type="button" className="btn btn-sm" onClick={() => setEvidenceOpen(true)} disabled={!completedData}>Detailed Evidence</button>
      <button type="button" className="is-primary" disabled={pdfBusy || !completedData} onClick={()=>previewPdf('management')}>
        {pdfBusy?'Generating…':'Generate PDF Management'}
      </button>
      {pdfUrl && <a className="sphereMonthlyDownload" href={pdfUrl} download={pdfMode==='management'?'SPHERE-Monthly-SAP-Performance-Report-'+month+'.pdf':'SPHERE-Monthly-Technical-Review-'+month+'.pdf'}>Download PDF</a>}
    </div>
    {storageError&&<p className="sphereMonthlyWarning" role="alert">{storageError}</p>}
    {pdfError&&<p className="sphereMonthlyWarning" role="alert">{pdfError}</p>}
    {loading&&<div className="sphereMonthlyState" role="status">{preview ? 'Loading Jobs & Programs evaluations…' : 'Loading saved monthly performance…'}</div>}
    {hostPreviewError&&!data&&!preview&&<div className="sphereMonthlyState is-error" role="alert">
      {hostPreviewError}
      <button type="button" className="btn btn-sm btn-outline-light ms-2"
        onClick={()=>{setHostPreviewError('');setHostPreviewRetry(count=>count+1)}}>Retry server data</button>
    </div>}
    {error&&<div className="sphereMonthlyState is-error" role="alert">{error}. No simulated values are substituted.</div>}
    {(completedData || preview)&&<>
      <MonthlyManagementDashboard month={month} full={completedData} preview={preview} storage={storage}/>
      {evidenceOpen && <RundeckWorkspaceDrawer title="Monthly Evidence" subtitle={month+' · Jobs, programs, resource pressure and ABAP traces'} size="wide" onClose={()=>setEvidenceOpen(false)}>
      <div className="sphereMonthlyReview is-v2 is-evidence-modal">
      <div className="sphereMonthlyTechnicalAction"><button type="button" disabled={pdfBusy || !completedData}
        onClick={()=>previewPdf('technical')}>Generate Technical PDF</button></div>
      {completedData ? <div id="sphere-month-panel-evidence" className="sphereMonthlyEvidencePage">
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
      </div></section></div> : <div className="sphereMonthlyState" role="status">Loading verified monthly evidence…</div>}
      </div>
      </RundeckWorkspaceDrawer>}
    </>}
  </section>
}

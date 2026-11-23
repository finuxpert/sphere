/* Presentation-only historical evidence panels. Source validity and filters are
 * supplied by the Reports controller; these components never call the API.
 */
import React from 'react'
import { fmt, pct, wpCoreEq, id, hostLabel, pressureHostsFor, when } from './rundeckMonthlyEvidence.js'

const DASHBOARD_COLORS = ['#D4A35D', '#4AA9B8', '#57AB89', '#91A0AB']
const WORKLOAD_GROUPS = [
  { key:'review', label:'Review' },
  { key:'attention', label:'Watch' },
  { key:'normal', label:'Normal' },
  { key:'unknown', label:'Limited Data' },
]

export function WorkloadDistribution({ summary = {}, onSelect }) {
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

export function PressureRows({ label, evidence, metric, onMetricChange }) {
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

export function PressureObservations({ metric, pressure }) {
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
      {!evidence.recent_episodes?.length && <tr><td colSpan="4">{evidence.episodes === null ? "No APP observations retained for this period." : "No observations reached the warning threshold."}</td></tr>}
      </tbody>
    </table></div>
  </section>
}

export function MonthlyErrorAnalysis({ evidence }) {
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
      {!visible.length && <tr><td colSpan="8">{unknownSource
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

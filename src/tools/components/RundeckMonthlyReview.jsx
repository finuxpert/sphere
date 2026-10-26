import React from 'react'
import { shortHost } from './sapUiFormat.js'
import { buildMonthlyPdf } from './rundeckMonthlyPdf.js'
import './RundeckMonthlyReview.css'

const API = import.meta.env.BASE_URL + 'api'
const PAGE_SIZE = 25
const fmt = (value, digits = 1) => value === null || value === undefined || !Number.isFinite(Number(value))
  ? '—' : Number(value).toLocaleString('id-ID', { maximumFractionDigits: digits })
const pct = value => fmt(value) === '—' ? '—' : fmt(value) + '%'
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

function HostTrend({ rows = [], month, metric, mode = 'peak', host = 'ALL', threshold = null }) {
  const field = (mode === 'avg' ? 'avg_' : 'peak_') + metric + '_pct'
  const [year, monthNum] = month.split('-').map(Number)
  const days = new Date(Date.UTC(year, monthNum, 0)).getUTCDate()
  const names = [...new Set(rows.map(row => hostLabel(row.host)))].sort().filter(name => host === 'ALL' || name === host)
  const width = 620; const left = 36; const plotW = 566; const top = 12; const plotH = 124
  const xFor = day => left + (day - 1) * plotW / Math.max(1, days - 1)
  const yFor = val => top + plotH * (1 - Math.max(0, Math.min(100, Number(val))) / 100)
  const showThreshold = threshold != null && Number.isFinite(Number(threshold))
  return <div className="sphereMonthlyTrend" role="group" aria-label={metric.toUpperCase() + ' daily APP ' + mode + ' trend'}>
    <svg viewBox={'0 0 ' + width + ' 164'} preserveAspectRatio="xMidYMid meet" role="img"
      aria-label={'Saved daily ' + mode + ' host ' + metric + ' percent; missing days are not zero'}>
      {[0,25,50,75,100].map(level => <g key={level}>
        <line x1={left} x2={left + plotW} y1={yFor(level)} y2={yFor(level)} stroke="currentColor" strokeOpacity=".11" strokeDasharray="3 4"/>
        <text x="5" y={yFor(level)+3} fontSize="9" fill="currentColor" opacity=".6">{level}%</text>
      </g>)}
      {[1,5,10,15,20,25,days].map(day => <text key={day} x={xFor(day)} y="155" fontSize="9" fill="currentColor" opacity=".7" textAnchor="middle">{day === 1 || day === days ? day + ' ' + new Intl.DateTimeFormat('en-GB',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(year,monthNum-1,1))) : day}</text>)}
      {showThreshold && <g>
        <line x1={left} x2={left + plotW} y1={yFor(threshold)} y2={yFor(threshold)} stroke="#e2b56a" strokeWidth="1.5" strokeDasharray="6 4"/>
        <rect x={left + plotW - 115} y={yFor(threshold) - 15} width="114" height="13" rx="2" fill="#253642"/>
        <text x={left + plotW - 4} y={yFor(threshold) - 5} fontSize="10" fill="#ffd39a" textAnchor="end">Warning {pct(threshold)}</text>
      </g>}
      {names.map((name,i) => {
        const points = rows.filter(row => hostLabel(row.host) === name && row[field] !== null && row[field] !== undefined)
          .map(row => ({day:Number(String(row.day).slice(-2)),value:row[field]})).sort((a,b)=>a.day-b.day)
        return <g key={name}>
          {points.map((point,k) => <g key={point.day}>
            {k>0 && point.day===points[k-1].day+1 && <line
              x1={xFor(points[k-1].day)} y1={yFor(points[k-1].value)}
              x2={xFor(point.day)} y2={yFor(point.value)}
              stroke={CHART_COLORS[i%CHART_COLORS.length]} strokeWidth="2.3" strokeLinecap="round"/>}
            <circle cx={xFor(point.day)} cy={yFor(point.value)} r="2.9" fill={CHART_COLORS[i%CHART_COLORS.length]}>
              <title>{name} · {month}-{String(point.day).padStart(2,'0')} · {pct(point.value)} {mode} {metric.toUpperCase()}</title>
            </circle>
          </g>)}
        </g>
      })}
    </svg>
    <div className="sphereMonthlyTrendLegend">
      {names.map((name,i)=><span key={name}><i style={{background:CHART_COLORS[i%CHART_COLORS.length]}}/>{name}</span>)}
    </div>
    <small>Tren harian {month} WIB. Garis putus-putus menunjukkan warning. Arahkan kursor ke titik untuk melihat tanggal.</small>
  </div>
}

function PressureRows({ label, evidence, metric }) {
  const rows = metric === 'ram' ? evidence.top_ram_workloads || [] : evidence.top_cpu_workloads || []
  return <section className="sphereMonthlyPanel sphereMonthlyRank">
    <div className="sphereMonthlyTableHead">
      <div><h4>{label}</h4><small>Top 5 workload identities · same APP + collection</small></div>
    </div>
    <div className="sphereMonthlyTableScroll">
      <table><thead><tr><th>Job / Program</th><th>APP host-checks</th><th>{metric === 'ram' ? 'Peak PSS' : 'Peak CPU'}</th></tr></thead>
        <tbody>{rows.map(row => <tr key={id(row)}>
          <td className="sphereMonthlyName"><strong>{row.consumer_key}</strong><small>{row.consumer_type} · APP saat tekanan: {pressureHostsFor(row, metric) || '—'}</small></td>
          <td>{fmt(row.pressure_overlap?.[metric + '_pressure_host_checks'],0)}</td>
          <td>{metric === 'ram' ? fmt(row.pressure_overlap?.pss_peak_during_ram_pressure,2)+' GB'
            : pct(row.pressure_overlap?.cpu_peak_during_cpu_pressure)}</td>
        </tr>)}
        {!rows.length && <tr><td colSpan="3">No correlated workload recorded during {metric.toUpperCase()} pressure.</td></tr>}
        </tbody>
      </table>
    </div>
  </section>
}

function PressureEpisodes({ metric, pressure }) {
  const evidence = pressure?.[metric] || {}
  return <section className="sphereMonthlyPanel">
    <div className="sphereMonthlyTableHead">
      <div><h4>{metric.toUpperCase()} Melewati Batas Warning</h4>
        <small>{fmt(evidence.observed_pressure_host_checks,0)} pemeriksaan APP. Puncak {pct(evidence.peak?.peak_pct)} pada {hostLabel(evidence.peak?.host)} tanggal {when(evidence.peak?.peak_at)}</small></div>
    </div>
    <div className="sphereMonthlyTableScroll"><table>
      <thead><tr><th>APP</th><th>Pertama tercatat</th><th>Terakhir tercatat</th><th>Waktu puncak</th><th>Nilai puncak</th><th>Pemeriksaan</th></tr></thead>
      <tbody>{(evidence.recent_episodes || []).map((row,index)=><tr key={row.host+String(row.first_at)+index}>
        <td>{hostLabel(row.host)}</td><td>{when(row.first_at)}</td><td>{when(row.last_at)}</td>
        <td>{when(row.peak_at)}</td><td>{pct(row.peak_pct)}</td><td>{fmt(row.observed_host_checks,0)}</td>
      </tr>)}
      {!evidence.recent_episodes?.length && <tr><td colSpan="6">{evidence.episodes === null ? "Belum ada data APP untuk bulan ini." : "Tidak ada pengamatan melewati batas warning."}</td></tr>}
      </tbody>
    </table></div>
  </section>
}

function AbapTuningCandidates({ rows = [] }) {
  return <section className="sphereMonthlyPanel sphereMonthlyWide sphereMonthlyTuning" aria-label="ABAP tuning candidates">
    <div className="sphereMonthlyTableHead">
      <div><h4>ABAP Tuning Candidates</h4>
        <small>Job dan program untuk evaluasi performa dari histori SPHERE. Status job perlu pemeriksaan di SM37.</small>
      </div>
      <span className="sphereMonthlyErrorCounter">{fmt(rows.length, 0)} candidates</span>
    </div>
    <div className="sphereMonthlyTableScroll"><table><thead><tr>
      <th>Job / Program</th><th>Observed APP</th><th>CPU Avg / Peak</th>
      <th>PSS Avg / Peak</th><th>Checks</th><th>CPU / RAM Pressure Checks</th><th>Review Signal</th>
    </tr></thead><tbody>
      {rows.map(row => <tr key={id(row)}>
        <td className="sphereMonthlyName"><strong>{row.consumer_key}</strong><small>{row.consumer_type} · {row.status}</small></td>
        <td>{hostsFor(row) || '—'}</td>
        <td>{pct(row.avg_cpu_pct)} / {pct(row.peak_cpu_pct)}</td>
        <td>{fmt(row.avg_pss_gb,2)} / {fmt(row.peak_pss_gb,2)} GB</td>
        <td>{fmt(row.occurrences,0)}</td>
        <td>{fmt(row.cpu_pressure_host_checks,0)} / {fmt(row.ram_pressure_host_checks,0)}</td>
        <td>{[
          row.signals?.sustained_high_cpu && 'High CPU',
          row.signals?.high_memory && 'High PSS',
          row.signals?.cpu_spike && 'CPU spike',
          row.signals?.baseline_anomaly && 'Above baseline',
        ].filter(Boolean).join(', ') || 'Review Required'}</td>
      </tr>)}
      {!rows.length && <tr><td colSpan="7">No Review Required workloads observed for this reporting period.</td></tr>}
    </tbody></table></div>
    <p>CPU workload bisa melebihi 100% pada beberapa core. PSS menunjukkan memori proses. Evaluasi ABAP tidak otomatis berarti job gagal.</p>
  </section>
}

function MonthlyErrorAnalysis({ evidence }) {
  const errors = evidence || {}
  const rows = errors.top_errors || []
  const [categoryFilter,setCategoryFilter] = React.useState('ALL')
  const [appFilter,setAppFilter] = React.useState('ALL')
  React.useEffect(()=>{setCategoryFilter('ALL');setAppFilter('ALL')},[evidence])
  const categories = [...new Set(rows.map(row=>row.category_label).filter(Boolean))].sort()
  const apps = [...new Set(rows.map(row=>hostLabel(row.host)).filter(Boolean))].sort()
  const visible = rows.filter(row=>(categoryFilter==='ALL'||row.category_label===categoryFilter) &&
    (appFilter==='ALL'||hostLabel(row.host)===appFilter))
  const state = errors.status || 'ERROR_SOURCE_NOT_RETAINED'
  const unknownSource = state === 'ERROR_SOURCE_NOT_RETAINED'
  return <section className="sphereMonthlyPanel sphereMonthlyWide sphereMonthlyErrors" aria-label="Evaluasi error program ABAP">
    <div className="sphereMonthlyTableHead">
      <div>
        <h4>Evaluasi Error Program ABAP</h4>
        <small>Histori SPHERE · Tidak menggantikan ST22 atau SM37</small>
      </div>
      <span className="sphereMonthlyErrorCounter">
        {state === 'TRUNCATED' ? 'Data error sebagian' : state === 'ERROR_SOURCE_NOT_RETAINED' ? 'Sumber error belum tersimpan' :
        state === 'NO_RETAINED_ERROR_EVIDENCE' ? 'Tidak ditemukan kode error' :
        state === 'WP_SIGNALS_ONLY' ? 'Ada sinyal diagnostik WP' :
        state === 'SNAPSHOT_ONLY' ? 'Hanya observasi snapshot' :
        state === 'UNTIMED_TRACE_ONLY' ? 'Trace tanpa waktu kejadian' : fmt(errors.timestamped_events, 0) + ' kejadian berwaktu'}
      </span>
    </div>
    <div className="sphereMonthlyStatStrip">
      <span>Kejadian berwaktu: {unknownSource ? 'Tidak tersedia' : state === 'TRUNCATED' ? 'Data parsial' : fmt(errors.timestamped_events, 0)}</span>
      <span>Observasi error saat snapshot: {unknownSource ? 'Tidak tersedia' : fmt(errors.snapshot_host_checks, 0)}</span>
      <span>Program dengan evidence error: {unknownSource ? 'Tidak tersedia' : fmt(errors.error_program_count,0)}</span>
      <span>Kode error: {unknownSource ? 'Tidak tersedia' : fmt(errors.error_code_count,0)}</span>
      <span>RABAX: {unknownSource ? 'Tidak tersedia' : fmt(errors.rabax_wp_checks,0) + ' pemeriksaan WP'}</span>
      <span>RXMSG: {unknownSource ? 'Tidak tersedia' : fmt(errors.rxmsg_wp_checks,0) + ' pemeriksaan WP'}</span>
    </div>
    <div className="sphereMonthlyErrorTools">
      <span>{fmt(rows.length,0)} dari {fmt(errors.groups ?? rows.length,0)} error groups tersedia untuk drilldown</span>
      <label>Category <select aria-label="Filter error category" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}>
        <option value="ALL">All categories</option>{categories.map(value=><option value={value} key={value}>{value}</option>)}
      </select></label>
      <label>APP <select aria-label="Filter error APP" value={appFilter} onChange={e=>setAppFilter(e.target.value)}>
        <option value="ALL">All APP</option>{apps.map(value=><option value={value} key={value}>{value}</option>)}
      </select></label>
    </div>
    <div className="sphereMonthlyTableScroll"><table><thead><tr>
      <th>Program terkait</th><th>Jenis masalah</th><th>Kode error SAP</th><th>APP / WP / PID</th><th>WP CPU / PSS at snapshot</th>
      <th>Kejadian berwaktu</th><th>Waktu error (WIB)</th><th>Observasi WP</th><th>Hubungan program</th>
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
    </tbody></table></div>
    {(errors.wp_diagnostics || []).length > 0 && <div className="sphereMonthlyWpDiagnostics">
      <h4>Sinyal WP untuk investigasi ABAP</h4>
      <small>RABAX dan RXMSG berasal dari hitungan trace collector. Bukan jumlah dump ST22 atau kejadian error terkonfirmasi.</small>
      <div className="sphereMonthlyTableScroll"><table><thead><tr><th>Sinyal</th><th>APP</th><th>Program terkait</th><th>Pemeriksaan WP</th><th>Nilai trace tertinggi</th></tr></thead>
        <tbody>{errors.wp_diagnostics.map((item,index)=><tr key={item.signal+item.host+item.program+index}>
          <td>{item.signal}</td><td>{hostLabel(item.host)}</td><td className="sphereMonthlyName"><strong>{item.program}</strong>
            <small>{item.program_link === 'EXPLICIT_ERROR_PROGRAM' ? 'Program tercatat eksplisit' : 'Hanya konteks workload: '+(item.sample_workload || 'tidak tersedia')}</small></td>
          <td>{fmt(item.observed_checks,0)}</td><td>{fmt(item.peak_tail_count,0)}</td>
        </tr>)}</tbody>
      </table></div>
    </div>}
    <p>{state === 'TRUNCATED' ? 'Histori yang dapat dibaca belum lengkap. ' : ''}RABAX dan RXMSG adalah indikator trace WP, bukan jumlah dump ST22. Status job diverifikasi di SM37. Nama program yang hanya muncul sebagai konteks tidak dinyatakan sebagai sumber error.</p>
  </section>
}

export default function RundeckMonthlyReview() {
  const [month,setMonth]=React.useState(MONTHS[1]?.value || MONTHS[0].value)
  const [tab,setTab]=React.useState('overview')
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
  const [expanded,setExpanded]=React.useState(null)
  const [chartMode,setChartMode]=React.useState('peak')
  const [chartHost,setChartHost]=React.useState('ALL')
  const [pdfBusy,setPdfBusy]=React.useState(false)
  const [pdfError,setPdfError]=React.useState('')
  const [pdfUrl,setPdfUrl]=React.useState('')
  const pdfRef=React.useRef('')
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
    setSearch('');setAppliedSearch('');setExpanded(null);setPdfError('')
    if(pdfRef.current)URL.revokeObjectURL(pdfRef.current)
    pdfRef.current='';setPdfUrl('')
  }
  const changeFilter=(setter,value)=>{pdfGenerationRef.current += 1;setter(value);setPage(0);setExpanded(null)}
  const items=data?.items||[]
  const quality=data?.quality||{}
  const summary=data?.summary||{}
  const evidence=data?.monthly_pressure||{}
  const errors=data?.monthly_errors||{}
  const tuningCandidates=data?.monthly_abap_candidates||[]
  const hosts=evidence.hosts||[]
  const total=Number(data?.page?.total||0)
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE))
  const previewPdf=async()=>{
    if(!data||loading||pdfBusy)return
    const generation=pdfGenerationRef.current
    setPdfBusy(true);setPdfError('')
    try{
      const blob=await buildMonthlyPdf({month,data})
      if(generation!==pdfGenerationRef.current)return
      const url=URL.createObjectURL(blob)
      if(pdfRef.current)URL.revokeObjectURL(pdfRef.current)
      pdfRef.current=url
      setPdfUrl(url)
    }catch(failure){if(generation===pdfGenerationRef.current)setPdfError(failure.message||'PDF could not be generated')}
    finally{setPdfBusy(false)}
  }
  return <section className="sphereMonthlyReview is-v2" aria-label="Monthly SAP Performance and Job Impact">
    <div className="sphereMonthlyHead">
      <div><strong>Evaluasi Kinerja SAP Bulanan</strong><small>Resource APP, Job, Program ABAP, dan error WP berdasarkan histori SPHERE</small></div>
      <div className="sphereMonthlyPicker">
        <label htmlFor="sphere-month-choice">Reporting month</label>
        <select id="sphere-month-choice" value={month} onChange={event=>changeMonth(event.target.value)}>
          {MONTHS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
    </div>
    <div className="sphereMonthlyTabs" role="tablist" aria-label="Monthly report sections">
      {[['overview','Overview'],['jobs','Jobs & Programs'],['impact','Performance Impact'],['report','Report']]
        .map(([value,label])=><button key={value} type="button" role="tab"
          aria-selected={tab===value} className={tab===value?'is-active':''}
          onClick={()=>setTab(value)}>{label}</button>)}
    </div>
    {loading&&<div className="sphereMonthlyState" role="status">Loading historical CPU, RAM and workload evidence…</div>}
    {error&&<div className="sphereMonthlyState is-error" role="alert">{error}. No simulated values are substituted.</div>}
    {data&&!loading&&<>
      <div className="sphereMonthlyProvenance">
        <span>Window: {when(data.start)} - {when(data.end)} (exclusive)</span>
        <span>Estimasi cakupan <b>{pct(quality.coverage_pct)}</b></span>
        <span>Confidence <b>{quality.confidence||'UNKNOWN'}</b></span>
        <span>Complete <b>{fmt(quality.complete_checks,0)}</b></span>
        <span>Incomplete <b>{fmt(quality.partial_or_incomplete_checks,0)}</b></span>
      </div>
      {tab==='overview'&&<div className="sphereMonthlyLayout">
        <div className="sphereMonthlyStats">
          {[
            ['CPU di atas warning',fmt(evidence.cpu?.observed_pressure_host_checks,0),'Pemeriksaan APP, puncak '+pct(evidence.cpu?.peak?.peak_pct)],
            ['RAM di atas warning',fmt(evidence.ram?.observed_pressure_host_checks,0),'Pemeriksaan APP, puncak '+pct(evidence.ram?.peak?.peak_pct)],
            ['Observasi Critical WP',fmt(hosts.reduce((sum,row)=>sum+(row.critical_wp_host_checks||0),0),0),'APP teramati dengan WP critical; bukan insiden'],
            ['Perlu evaluasi',fmt(summary.review_required,0),fmt(summary.workloads,0)+' job dan program teramati'],
          ].map(([label,value,detail])=><div className="sphereMonthlyStat" key={label}>
            <span>{label}</span><strong>{value}</strong><small>{detail}</small>
          </div>)}
        </div>
        <div className="sphereMonthlyPanel sphereMonthlyWide sphereMonthlyExecutive">
          <h4>Temuan Utama Bulan Ini</h4>
          <div className="sphereMonthlyExecutiveGrid">
            <div><span>CPU APP tertinggi</span><strong>{pct(evidence.cpu?.peak?.peak_pct)}</strong><small>{hostLabel(evidence.cpu?.peak?.host)} pada {when(evidence.cpu?.peak?.peak_at)}. Warning {pct(evidence.thresholds?.cpu_warning_pct)}</small></div>
            <div><span>RAM APP tertinggi</span><strong>{pct(evidence.ram?.peak?.peak_pct)}</strong><small>{hostLabel(evidence.ram?.peak?.host)} pada {when(evidence.ram?.peak?.peak_at)}. Warning {pct(evidence.thresholds?.ram_warning_pct)}</small></div>
            <div><span>Program perlu evaluasi</span><strong>{fmt(tuningCandidates.length,0)}</strong><small>Evaluasi berdasarkan CPU, PSS dan histori pemakaian resource.</small></div>
            <div><span>WP Error Evidence</span><strong>{errors.status==='ERROR_SOURCE_NOT_RETAINED'?'Not available':fmt(errors.error_code_count,0)+' codes'}</strong><small>{errors.status==='ERROR_SOURCE_NOT_RETAINED'
              ? 'Error fields are missing from retained workload history; inspect saved raw SPHERE archives.'
              : fmt(errors.error_program_count,0)+' identified programs, '+fmt(errors.timestamped_events,0)+' dated trace events. RABAX '+fmt(errors.rabax_wp_checks,0)+' WP checks.'}</small></div>
          </div>
        </div>
        <div className="sphereMonthlyPanel sphereMonthlyWide">
          <div className="sphereMonthlyTableHead">
            <div><h4>Tren Pemakaian Resource APP</h4><small>CPU dan RAM APP per tanggal, beserta batas warning monitoring</small></div>
            <div className="sphereMonthlyFilters">
              <select aria-label="Trend statistic" value={chartMode} onChange={event=>setChartMode(event.target.value)}>
                <option value="peak">Daily peak</option><option value="avg">Daily average</option>
              </select>
              <select aria-label="Select APP trend" value={chartHost} onChange={event=>setChartHost(event.target.value)}>
                <option value="ALL">All APP</option>
                {hosts.map(row=><option key={row.host} value={hostLabel(row.host)}>{hostLabel(row.host)}</option>)}
              </select>
            </div>
          </div>
          <div className="sphereMonthlyTrendDuo">
            <div><h4>CPU <small>{chartMode==='peak'?'Peak':'Average'}</small></h4>
              <HostTrend rows={evidence.daily_hosts||[]} month={month} metric="cpu" mode={chartMode} host={chartHost} threshold={evidence.thresholds?.cpu_warning_pct}/></div>
            <div><h4>RAM <small>{chartMode==='peak'?'Peak':'Average'}</small></h4>
              <HostTrend rows={evidence.daily_hosts||[]} month={month} metric="ram" mode={chartMode} host={chartHost} threshold={evidence.thresholds?.ram_warning_pct}/></div>
          </div>
        </div>
        <div className="sphereMonthlyPanel sphereMonthlyWide">
          <h4>APP1–APP5 Resource Summary</h4>
          <div className="sphereMonthlyTableScroll"><table><thead><tr>
            <th>APP</th><th>CPU Avg</th><th>CPU Peak</th><th>RAM Avg</th><th>RAM Peak</th>
            <th>CPU High Host-Checks</th><th>RAM High Host-Checks</th><th>Critical WP Host-Checks</th>
          </tr></thead><tbody>
            {hosts.map(row=><tr key={row.host}><td>{hostLabel(row.host)}</td>
              <td>{pct(row.avg_cpu_pct)}</td><td>{pct(row.peak_cpu_pct)}</td><td>{pct(row.avg_ram_pct)}</td><td>{pct(row.peak_ram_pct)}</td>
              <td>{fmt(row.cpu_warning_host_checks,0)}</td><td>{fmt(row.ram_warning_host_checks,0)}</td><td>{fmt(row.critical_wp_host_checks,0)}</td></tr>)}
            {!hosts.length&&<tr><td colSpan="8">No historical host samples available.</td></tr>}
          </tbody></table></div>
        </div>
      </div>}
      {tab==='jobs'&&<div className="sphereMonthlyPanel">
        <div className="sphereMonthlyTableHead">
          <div><h4>Job dan Program untuk Evaluasi</h4><small>{total} hasil. Halaman {page+1} dari {pages}</small></div>
          <div className="sphereMonthlyFilters">
            <input type="search" value={search} onChange={event=>{pdfGenerationRef.current+=1;setSearch(event.target.value);setPage(0)}}
              placeholder="Search full job / program name" aria-label="Search job and program"/>
            <select aria-label="Workload type" value={kind} onChange={event=>changeFilter(setKind,event.target.value)}>
              <option value="ALL">All types</option><option value="JOB">Jobs</option><option value="PROGRAM">Programs</option>
            </select>
            <select aria-label="Evaluation group" value={health} onChange={event=>changeFilter(setHealth,event.target.value)}>
              <option value="REVIEW">Review required</option><option value="ATTENTION">Watch</option>
              <option value="ALL">All evaluations</option><option value="NORMAL">Normal</option><option value="UNKNOWN">Limited/Unknown</option>
            </select>
            <select aria-label="Workload signal" value={signalFilter} onChange={event=>changeFilter(setSignalFilter,event.target.value)}>
              <option value="ALL">All signals</option>
              <option value="HIGH_CPU">High CPU</option>
              <option value="HIGH_MEMORY">High memory</option>
              <option value="RECURRING">Recurring</option>
            </select>
            <select aria-label="Resource pressure filter" value={pressureFilter} onChange={event=>changeFilter(setPressureFilter,event.target.value)}>
              {PRESSURE_FILTERS.map(([value,label])=><option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>
        <div className="sphereMonthlyTableScroll"><table><thead><tr>
          <th>Job / Program</th><th>APP teramati</th><th>Avg / Peak CPU</th><th>Avg / Peak PSS</th>
          <th>Pemeriksaan</th><th>CPU / RAM warning</th><th>Critical WP</th>
        </tr></thead><tbody>
          {items.map(row=><React.Fragment key={id(row)}>
            <tr><td className="sphereMonthlyName"><button type="button" className="sphereMonthlyJobDetailToggle" aria-expanded={expanded===id(row)}
                onClick={()=>setExpanded(value=>value===id(row)?null:id(row))}>{row.consumer_key}</button>
                <small>{row.consumer_type} · {row.assessment||'Observed'}</small></td>
              <td>{hostsFor(row)||'—'}</td><td>{pct(row.avg_cpu_pct)} / {pct(row.peak_cpu_pct)}</td>
              <td>{fmt(row.avg_pss_gb,2)} / {fmt(row.peak_pss_gb,2)} GB</td><td>{fmt(row.occurrences,0)}</td>
              <td>{fmt(row.pressure_overlap?.cpu_pressure_host_checks,0)} / {fmt(row.pressure_overlap?.ram_pressure_host_checks,0)}</td>
              <td>{fmt(row.pressure_overlap?.wp_host_checks,0)}</td>
            </tr>
            {expanded===id(row)&&<tr className="sphereMonthlyEvidenceDetail"><td colSpan="7"><div>
              <strong>Saved monthly workload evidence</strong>
              <span>First observed {when(row.first_seen)} · Last observed {when(row.last_seen)}</span>
              <span>Host observations {fmt(row.host_observations,0)} · Prev-month avg CPU {pct(row.previous?.avg_cpu_pct)} · Peak processes {fmt(row.peak_process_count,0)}</span>
              <span>Korelasi waktu: CPU {fmt(row.pressure_overlap?.cpu_pressure_host_checks,0)} pada {pressureHostsFor(row,'cpu')||'—'}; RAM {fmt(row.pressure_overlap?.ram_pressure_host_checks,0)} pada {pressureHostsFor(row,'ram')||'—'}; WP {fmt(row.pressure_overlap?.wp_host_checks,0)} pemeriksaan APP</span>
              <span>Collection counts are not SM37 executions. Same-host overlap does not prove causation.</span>
            </div></td></tr>}
          </React.Fragment>)}
          {!items.length&&<tr><td colSpan="7">Tidak ada job atau program sesuai filter bulan ini.</td></tr>}
        </tbody></table></div>
        <div className="sphereMonthlyPager"><small>Filter berdasarkan histori yang tersimpan di server</small>
          <button type="button" disabled={page===0} onClick={()=>setPage(n=>n-1)}>Previous</button>
          <button type="button" disabled={page+1>=pages} onClick={()=>setPage(n=>n+1)}>Next</button>
        </div>
      </div>}
      {tab==='impact'&&<div className="sphereMonthlyImpact">
        <div className="sphereMonthlyPanel sphereMonthlyWide"><h4>Pengamatan CPU dan RAM di atas warning</h4>
          <div className="sphereMonthlyStatStrip">
            <span>CPU warning ≥ {pct(evidence.thresholds?.cpu_warning_pct)}</span>
            <span>RAM warning ≥ {pct(evidence.thresholds?.ram_warning_pct)}</span>
            <span>CPU warning {fmt(evidence.cpu?.observed_pressure_host_checks,0)} pemeriksaan</span>
            <span>RAM warning {fmt(evidence.ram?.observed_pressure_host_checks,0)} pemeriksaan</span>
          </div>
          <p>Pengamatan berdasarkan histori APP. Hubungan dengan job atau program perlu dianalisis lebih lanjut sebelum dinyatakan sebagai penyebab.</p>
        </div>
        <PressureEpisodes metric="cpu" pressure={evidence}/>
        <PressureEpisodes metric="ram" pressure={evidence}/>
        <PressureRows label="Jobs / Programs During CPU Pressure" evidence={evidence} metric="cpu"/>
        <PressureRows label="Jobs / Programs During RAM Pressure" evidence={evidence} metric="ram"/>
        <MonthlyErrorAnalysis evidence={errors}/>
        <AbapTuningCandidates rows={tuningCandidates}/>
      </div>}
      {tab==='report'&&<div className="sphereMonthlyPanel sphereMonthlyReportPreview">
        <div className="sphereMonthlyTableHead">
          <div><h4>Laporan Kinerja SAP Bulanan</h4><small>Ringkasan APP, job, program, dan evidence error ABAP</small></div>
          <button type="button" className="is-primary" disabled={pdfBusy} onClick={previewPdf}>
            {pdfBusy?'Membuat laporan…':'Lihat PDF'}
          </button>
        </div>
        {pdfError&&<p className="sphereMonthlyWarning" role="alert">{pdfError}</p>}
        <div className="sphereMonthlyReportOverview">
          <div><strong>Periode laporan</strong><span>{month} · Asia/Jakarta</span></div>
          <div><strong>CPU dan RAM di atas warning</strong><span>CPU {fmt(evidence.cpu?.observed_pressure_host_checks,0)}, RAM {fmt(evidence.ram?.observed_pressure_host_checks,0)} pemeriksaan</span></div>
          <div><strong>Prioritas evaluasi</strong><span>{tuningCandidates.length} job dan program masuk daftar evaluasi. Data detail otomatis di PDF.</span></div>
          <div><strong>Cakupan data monitoring</strong><span>Estimasi {pct(quality.coverage_pct)} · {quality.confidence||'UNKNOWN'} · {fmt(quality.partial_or_incomplete_checks,0)} pemeriksaan belum lengkap</span></div>
          <div><strong>Error ABAP dan WP</strong><span>{errors.status==='ERROR_SOURCE_NOT_RETAINED'?'Histori tidak menyimpan field error WP. Jumlah program error dan RABAX belum tersedia.':<>{fmt(errors.error_program_count,0)} program dengan evidence error. {fmt(errors.error_code_count,0)} kode. {fmt(errors.timestamped_events,0)} kejadian berwaktu. RABAX {fmt(errors.rabax_wp_checks,0)} pemeriksaan WP.</>}</span></div>
        </div>
        {pdfUrl&&<div className="sphereMonthlyPdfFrame">
          <div className="sphereMonthlyPager"><small>Pratinjau PDF berdasarkan histori bulan terpilih</small>
            <a href={pdfUrl} download={'SPHERE-Monthly-Performance-'+month+'.pdf'}>Unduh PDF</a>
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">Buka layar penuh</a>
            <button type="button" onClick={()=>{if(pdfRef.current)URL.revokeObjectURL(pdfRef.current);pdfRef.current='';setPdfUrl('')}}>Close preview</button>
          </div>
          <iframe title="SPHERE monthly PDF preview" src={pdfUrl}/>
        </div>}
        <p className="sphereMonthlyReportDisclaimer">Histori resource digunakan untuk evaluasi. Status job dan dump ABAP perlu diverifikasi di SM37 dan ST22.</p>
      </div>}
    </>}
  </section>
}

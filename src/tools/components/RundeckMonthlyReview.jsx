import React from 'react'
import { monthOptions, weekOptions, customDateError as validateCustomDate } from './rundeckMonthlyPeriod.js'
import { fmt, pct, wpCoreEq, id, hostLabel, hostsFor, pressureHostsFor, when, relatedMonthlyErrorCodes } from './rundeckMonthlyEvidence.js'
import { buildMonthlyReportArtifact } from './rundeckMonthlyExport.js'
import MonthlyManagementDashboard from './RundeckMonthlyManagement.jsx'
import RundeckMonthlyReportHeader from './RundeckMonthlyReportHeader.jsx'
import { PressureRows, PressureObservations, MonthlyErrorAnalysis } from './RundeckMonthlyEvidencePanels.jsx'
import './RundeckMonthlyReview.css'
import './RundeckMonthlyFinal20261030.css'
import RundeckWorkspaceDrawer from './RundeckWorkspaceDrawer.jsx'
import './RundeckUnifiedExperience20261030.css'

const API = import.meta.env.BASE_URL + 'api'
const PAGE_SIZE = 8
const MONTHS = monthOptions()
const WEEKS = weekOptions()
const DEFAULT_CUSTOM_START=WEEKS[1]?.value||WEEKS[0].value
const DEFAULT_CUSTOM_END=new Date(Date.parse(DEFAULT_CUSTOM_START+'T00:00:00Z')+6*86400000).toISOString().slice(0,10)
const TODAY_WIB=(()=>{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
  const get=part=>parts.find(item=>item.type===part)?.value
  return get('year')+'-'+get('month')+'-'+get('day')
})()
const customDateError=(start,end)=>validateCustomDate(start,end,TODAY_WIB)
const PRESSURE_FILTERS = [
  ['ALL', 'All observations'], ['CPU', 'CPU Pressure'], ['RAM', 'RAM Pressure'], ['WP', 'Critical WP'],
]

export default function RundeckMonthlyReview({ showTitle = true }) {
  const [reportMode,setReportMode]=React.useState('month')
  const [selectedMonth,setMonth]=React.useState(MONTHS[1]?.value || MONTHS[0].value)
  const [weekStart,setWeekStart]=React.useState(WEEKS[1]?.value || WEEKS[0].value)
  const [customStart,setCustomStart]=React.useState(DEFAULT_CUSTOM_START)
  const [customEnd,setCustomEnd]=React.useState(DEFAULT_CUSTOM_END)
  const [draftStart,setDraftStart]=React.useState(DEFAULT_CUSTOM_START)
  const [draftEnd,setDraftEnd]=React.useState(DEFAULT_CUSTOM_END)
  const month=reportMode==='week'?weekStart.slice(0,7):reportMode==='custom'?customStart.slice(0,7):selectedMonth
  const requestedWeek=reportMode==='week'?weekStart:null
  const requestedStart=reportMode==='custom'?customStart:null
  const requestedEnd=reportMode==='custom'?customEnd:null
  // Include both ends and the calendar timezone in downloaded report filenames.
  // A weekly report is Monday through Sunday in WIB, even across month boundaries.
  const weeklyEnd=requestedWeek
    ?new Date(Date.parse(requestedWeek+'T00:00:00Z')+6*86400000).toISOString().slice(0,10)
    :null
  const exportStem=requestedStart
    ?'SPHERE-Custom-SAP-Performance-Report-'+requestedStart+'-to-'+requestedEnd+'-WIB'
    :requestedWeek
      ?'SPHERE-Weekly-SAP-Performance-Report-'+requestedWeek+'-to-'+weeklyEnd+'-WIB'
      :'SPHERE-Monthly-SAP-Performance-Report-'+month+'-WIB'
  const reportParams=React.useCallback(()=>new URLSearchParams({month,
    ...(requestedWeek?{week_start:requestedWeek}:{}),
    ...(requestedStart?{start_date:requestedStart,end_date:requestedEnd}:{})}),
    [month,requestedWeek,requestedStart,requestedEnd])
  const matchesScope=React.useCallback(payload=>payload?.month===month && payload?.period===reportMode &&
    (requestedWeek?payload.week_start===requestedWeek:!payload.week_start) &&
    (requestedStart?payload.start_date===requestedStart&&payload.end_date===requestedEnd:
      !payload.start_date&&!payload.end_date),
    [month,reportMode,requestedWeek,requestedStart,requestedEnd])
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
  const [evaluationRetry,setEvaluationRetry]=React.useState(0)
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
    fetch(API+'/infra/monthly-storage?'+reportParams(),{
      cache:'no-store',signal:controller.signal,
    }).then(async response=>{
      if(!response.ok)throw Error('Reporting period storage history unavailable (HTTP '+response.status+')')
      return response.json()
    }).then(payload=>{
      if(!controller.signal.aborted){
        if(!matchesScope(payload) || !Array.isArray(payload.items))throw Error('Invalid scoped storage evidence')
        setStorage(payload)
      }
    }).catch(failure=>{
      if(!controller.signal.aborted)setStorageError(failure.message||'Reporting period storage unavailable')
    })
    return ()=>controller.abort()
  },[reportParams,matchesScope])
  // Render retained monthly CPU/RAM/APP observations independently of the slower
  // full workload classification, correlation and WP error analysis.
  React.useEffect(()=>{
    const controller=new AbortController()
    let retryTimer=null
    setHostPreview(null)
    setHostPreviewError('')
    const waitBeforeHostRetry=()=>new Promise(resolve=>{
      if(controller.signal.aborted){resolve();return}
      const done=()=>{
        if(retryTimer!==null)window.clearTimeout(retryTimer)
        retryTimer=null
        controller.signal.removeEventListener('abort',done)
        resolve()
      }
      retryTimer=window.setTimeout(done,1500)
      controller.signal.addEventListener('abort',done,{once:true})
    })
    const loadHostPreview=async()=>{
      // A cold request may exceed the 20s browser deadline while the server
      // warms its DB cache. Retry one transient failure, not invalid data.
      for(let attempt=0;attempt<2&&!controller.signal.aborted;attempt++){
        const previewDeadline=AbortSignal.timeout(20_000)
        const started=window.performance.now()
        try{
          const response=await fetch(API+'/evaluation/workloads/monthly/hosts?'+reportParams(),{
            cache:'no-store',signal:AbortSignal.any([controller.signal,previewDeadline]),
          })
          if(!response.ok){
            const failure=Error('Reporting period host summary unavailable (HTTP '+response.status+')')
            failure.retryable=[502,503,504].includes(response.status)
            throw failure
          }
          const payload=await response.json()
          if(controller.signal.aborted)return
          if(previewDeadline.aborted)throw Error('Host summary request deadline exceeded')
          if(!matchesScope(payload)||payload.preview_only!==true||
              !payload.monthly_pressure||!payload.quality)
            throw Error('Reporting period host summary is not verified')
          const elapsedMs=Math.round(window.performance.now()-started)
          if(attempt>0||elapsedMs>=5000)
            console.info('SPHERE_HOST_PREVIEW', {attempt:attempt+1,duration_ms:elapsedMs})
          setHostPreview(payload)
          return
        }catch(failure){
          if(controller.signal.aborted)return
          const timedOut=previewDeadline.aborted
          const retryable=timedOut||failure instanceof TypeError||failure.retryable===true
          if(retryable&&attempt===0){
            console.warn('SPHERE_HOST_PREVIEW_RETRY',{
              attempt:attempt+1,duration_ms:Math.round(window.performance.now()-started),
              reason:timedOut?'timeout':failure.message,
            })
            await waitBeforeHostRetry()
            continue
          }
          setHostPreviewError(timedOut
            ? 'Host summary exceeded 20 seconds; check API and database'
            : failure.message||'Reporting period host summary unavailable')
          return
        }
      }
    }
    loadHostPreview()
    return ()=>{
      controller.abort()
      if(retryTimer!==null)window.clearTimeout(retryTimer)
    }
  },[reportParams,matchesScope,hostPreviewRetry])
  // A boolean dependency avoids re-requesting expensive evidence just because
  // the user switches between Summary, Detailed Evidence and PDF Report.
  const fullEvaluationReady = hostPreview?.month===month && matchesScope(hostPreview)
  React.useEffect(()=>{
    // Prioritize the host-only request on Summary. A failed host preview must
    // not trigger an even heavier fallback request or leave a permanent spinner.
    if(!fullEvaluationReady) {
      setLoading(!hostPreviewError)
      return
    }
    const controller=new AbortController()
    const params=new URLSearchParams({
      month,...(requestedWeek?{week_start:requestedWeek}:{}),
      ...(requestedStart?{start_date:requestedStart,end_date:requestedEnd}:{}),
      type:kind,health,pressure:pressureFilter,flag:signalFilter,q:appliedSearch,
      limit:String(PAGE_SIZE),offset:String(page*PAGE_SIZE),
    })
    pdfGenerationRef.current += 1
    if(pdfRef.current)URL.revokeObjectURL(pdfRef.current)
    pdfRef.current='';setPdfUrl('')
    setLoading(true);setError('');setData(null)
    // A cold evaluation can outlive the browser's first 35-second request and
    // populate the server-side cache. Retry once so the UI can consume that
    // verified result without demanding a manual refresh.
    let retryTimer=null
    const waitForCache=()=>new Promise(resolve=>{
      retryTimer=window.setTimeout(()=>{retryTimer=null;resolve()},1500)
      controller.signal.addEventListener('abort',()=>resolve(),{once:true})
    })
    const load=async()=>{
      for(let attempt=0;attempt<2&&!controller.signal.aborted;attempt++){
        const evaluationDeadline=AbortSignal.timeout(35_000)
        try{
          const response=await fetch(API+'/evaluation/workloads/monthly?'+params.toString(),{
            cache:'no-store',signal:AbortSignal.any([controller.signal,evaluationDeadline]),
          })
          if(!response.ok){
            const body=await response.json().catch(()=>({}))
            throw Error(body.detail||'Reporting period evidence unavailable (HTTP '+response.status+')')
          }
          const payload=await response.json()
          if(controller.signal.aborted)return
          if(!matchesScope(payload)||payload.page?.scope!=='FULL_EVALUATED_POPULATION')throw Error('Invalid reporting period evidence contract')
          if(!payload.monthly_pressure||!payload.monthly_errors)throw Error('Resource pressure or error evidence is unavailable on this backend')
          setData(payload)
          return
        }catch(failure){
          if(controller.signal.aborted)return
          if(evaluationDeadline.aborted && attempt===0){
            await waitForCache()
            continue
          }
          setError(evaluationDeadline.aborted
            ? 'Evaluation exceeded 35 seconds; inspect backend SQL timings'
            : failure.message||'Historical evidence unavailable')
          return
        }
      }
    }
    load().finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return ()=>{controller.abort();if(retryTimer!==null)window.clearTimeout(retryTimer)}
  },[month,requestedWeek,requestedStart,requestedEnd,kind,health,pressureFilter,signalFilter,appliedSearch,page,fullEvaluationReady,hostPreviewError,matchesScope,evaluationRetry])
  const changePeriod=(mode,value)=>{
    pdfGenerationRef.current += 1
    if(mode==='month')setMonth(value)
    if(mode==='week')setWeekStart(value)
    if(mode==='custom'){setDraftStart(customStart);setDraftEnd(customEnd)}
    setReportMode(mode);setEvidenceOpen(false);setPage(0);setKind('ALL');setHealth('REVIEW');setPressureFilter('ALL');setSignalFilter('ALL')
    setSearch('');setAppliedSearch('');setPdfError('')
    if(pdfRef.current)URL.revokeObjectURL(pdfRef.current)
    pdfRef.current='';setPdfUrl('')
  }
  const applyCustom=()=>{
    if(customDateError(draftStart,draftEnd))return
    if(draftStart===customStart&&draftEnd===customEnd)return
    pdfGenerationRef.current+=1
    if(pdfRef.current)URL.revokeObjectURL(pdfRef.current)
    pdfRef.current='';setPdfUrl('');setPdfError('')
    setEvidenceOpen(false);setPage(0);setCustomStart(draftStart);setCustomEnd(draftEnd)
  }
  const changeFilter=(setter,value)=>{pdfGenerationRef.current += 1;setter(value);setPage(0)}
  const preview=matchesScope(hostPreview) ? hostPreview : null
  const completedData=matchesScope(data) ? data : null
  const staleSnapshot=completedData?.snapshot?.status==='STALE'
  const items=completedData?.items||[]
  const evidence=(completedData||preview)?.monthly_pressure||{}
  const errors=completedData?.monthly_errors||{}
  const total=Number(completedData?.page?.total||0)
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE))
  const previewPdf=React.useCallback(async(reportType='management')=>{
    if(!data||data.snapshot?.status==='STALE'||loading||pdfBusy||pdfInFlightRef.current)return
    pdfInFlightRef.current=true
    const generation=pdfGenerationRef.current
    setPdfBusy(true);setPdfError('')
    try{
      // Reports must never depend on Detailed Evidence paging, search or filters.
      // Fetch a canonical period-scoped population before building either PDF.
      const params = new URLSearchParams({
        month, type:'ALL', health:'ALL', pressure:'ALL', flag:'ALL',
        ...(requestedWeek?{week_start:requestedWeek}:{}),
        ...(requestedStart?{start_date:requestedStart,end_date:requestedEnd}:{}),
        q:'', limit:String(PAGE_SIZE), offset:'0',
      })
      const response = await fetch(API+'/evaluation/workloads/monthly?'+params.toString(), {cache:'no-store'})
      if(!response.ok) throw Error('Reporting period PDF evidence unavailable (HTTP '+response.status+')')
      const reportData = await response.json()
      if(generation!==pdfGenerationRef.current) return
      if(reportData.month!==month || !matchesScope(reportData) ||
          reportData.page?.scope!=='FULL_EVALUATED_POPULATION' ||
          !reportData.monthly_pressure || !reportData.monthly_errors || !reportData.quality) {
        throw Error('PDF evidence does not match the selected reporting period')
      }
      let exportData=reportData
      if(reportType==='management' || reportType==='png' || reportType==='print-a3') {
        const storageResponse=await fetch(API+'/infra/monthly-storage?'+reportParams(),{cache:'no-store'})
        if(!storageResponse.ok)throw Error('Reporting period storage evidence unavailable (HTTP '+storageResponse.status+')')
        const monthlyStorage=await storageResponse.json()
        if(monthlyStorage.month!==month || !matchesScope(monthlyStorage) || !Array.isArray(monthlyStorage.items))throw Error('Storage evidence is not from selected reporting period')
        exportData={...reportData,monthly_storage:monthlyStorage}
      }
      // Load the large technical PDF exporter only when that export is requested.
      // Keep summary/report navigation free from this extra initial JS payload.
      const blob=await buildMonthlyReportArtifact({reportType,month,exportData})
      if(generation!==pdfGenerationRef.current)return
      const url=URL.createObjectURL(blob)
      if(pdfRef.current)URL.revokeObjectURL(pdfRef.current)
      pdfRef.current=url
      setPdfMode(reportType)
      setPdfUrl(url)
    }catch(failure){if(generation===pdfGenerationRef.current)setPdfError(failure.message||'PDF could not be generated')}
    finally{pdfInFlightRef.current=false;setPdfBusy(false)}
  },[data,loading,pdfBusy,month,requestedWeek,requestedStart,requestedEnd,reportParams,matchesScope])
  return <section className="sphereMonthlyReview is-v2 is-single-page container-fluid px-0" aria-label="SAP Performance Report and Job Impact">
    <RundeckMonthlyReportHeader
      showTitle={showTitle} month={month} requestedWeek={requestedWeek}
      requestedStart={requestedStart} requestedEnd={requestedEnd}
      reportMode={reportMode} weekStart={weekStart} selectedMonth={selectedMonth}
      draftStart={draftStart} draftEnd={draftEnd}
      setDraftStart={setDraftStart} setDraftEnd={setDraftEnd}
      changePeriod={changePeriod} applyCustom={applyCustom} customDateError={customDateError}
      MONTHS={MONTHS} WEEKS={WEEKS} TODAY_WIB={TODAY_WIB}
      completedData={completedData} staleSnapshot={staleSnapshot}
      pdfBusy={pdfBusy} pdfUrl={pdfUrl} pdfMode={pdfMode} exportStem={exportStem}
      setEvidenceOpen={setEvidenceOpen} previewPdf={previewPdf}
      loading={loading} preview={preview}/>
    {reportMode==='custom'&&customDateError(draftStart,draftEnd)&&
      <small className="sphereMonthlyWarning" role="alert">{customDateError(draftStart,draftEnd)}</small>}
    {staleSnapshot&&<p className="sphereMonthlyWarning" role="status">
      Showing last completed snapshot from {new Date(completedData.snapshot.generated_at).toLocaleString('en-GB',{timeZone:'Asia/Jakarta'})} WIB.
      Newer collected data is being prepared. Export is disabled until refreshed.
      <button type="button" className="btn btn-sm btn-outline-info ms-2"
        onClick={()=>setEvaluationRetry(value=>value+1)}>Check latest</button>
    </p>}
    {storageError&&<p className="sphereMonthlyWarning" role="alert">{storageError}</p>}
    {pdfError&&<p className="sphereMonthlyWarning" role="alert">{pdfError}</p>}
    {loading&&!preview&&<div className="sphereMonthlyState" role="status">Loading saved performance…</div>}
    {hostPreviewError&&!data&&!preview&&<div className="sphereMonthlyState is-error" role="alert">
      {hostPreviewError}
      <button type="button" className="btn btn-sm btn-outline-light ms-2"
        onClick={()=>{setHostPreviewError('');setHostPreviewRetry(count=>count+1)}}>Retry server data</button>
    </div>}
    {error&&<div className="sphereMonthlyState is-error" role="alert">{error}. No simulated values are substituted.
      <button type="button" className="btn btn-sm btn-outline-light ms-2"
        onClick={()=>{setError('');setEvaluationRetry(value=>value+1)}}>Retry evaluation</button>
    </div>}
    {(completedData || preview)&&<>
      <MonthlyManagementDashboard month={month} weekStart={requestedWeek} customStart={requestedStart} customEnd={requestedEnd} full={completedData} preview={preview} storage={storage} storageError={storageError} loading={loading} evaluationError={error}/>
      {evidenceOpen && <RundeckWorkspaceDrawer title={reportMode==='custom'?'Custom Evidence':reportMode==='week'?'Weekly Evidence':'Monthly Evidence'} subtitle={(requestedStart?requestedStart+' to '+requestedEnd:requestedWeek||month)+' · Jobs, programs, resource pressure and ABAP traces'} size="wide" onClose={()=>setEvidenceOpen(false)}>
      <div className="sphereMonthlyReview is-v2 is-evidence-modal">
      {reportMode==='month' && <div className="sphereMonthlyTechnicalAction"><button type="button" disabled={pdfBusy || !completedData || staleSnapshot}
        onClick={()=>previewPdf('technical')}>Generate Technical PDF</button></div>}
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
        <MonthlyErrorAnalysis key={requestedWeek||month} evidence={errors}/>
      </div></section></div> : <div className="sphereMonthlyState" role="status">Loading verified evidence…</div>}
      </div>
      </RundeckWorkspaceDrawer>}
    </>}
  </section>
}

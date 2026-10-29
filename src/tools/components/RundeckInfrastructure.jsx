import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { infrastructureTelemetryFreshness, infrastructureObservationStatus } from './infrastructureFreshness.js'
import { hostInfrastructureEvidence, splitInfrastructureHosts, matchedInfrastructureHost } from './rundeckUnifiedHost.js'
import { filesystemResourceState, OPERATOR_THRESHOLDS } from './rundeckStatusSemantics.js'
import { shortHost } from './sapUiFormat.js'
import './RundeckInfrastructure.css'

const API=`${import.meta.env.BASE_URL}api/infra`
const HOST_STORAGE_KEY='sphere.live.host'
const metric=(value,suffix='')=>value===null||value===undefined||value===''?'—':`${Number(value).toLocaleString('en-US',{maximumFractionDigits:1})}${suffix}`
const statusFs = filesystemResourceState
const severityRank={NORMAL:0,UNKNOWN:1,ATTENTION:2,CRITICAL:3}
const worst=(...states)=>states.reduce((a,b)=>(severityRank[b]||0)>(severityRank[a]||0)?b:a,'NORMAL')
const normalizeClock=(value)=>String(value||'').replace(/(\d{1,2})\.(\d{2})/g,'$1:$2')
const formatTime=(value)=>value?normalizeClock(new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short',hour12:false}).format(new Date(value))):'—'
const formatAxisTime=(value,range)=>{
  if(!value)return '—'
  const date=new Date(value)
  if(range==='1h'||range==='6h')return normalizeClock(new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false}).format(date))
  if(range==='24h')return normalizeClock(new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(date))
  return new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short'}).format(date)
}
const ageText=(value)=>{
  if(!value)return '—'
  const sec=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000))
  if(sec<60)return `${sec}s ago`
  if(sec<3600)return `${Math.floor(sec/60)}m ago`
  return `${Math.floor(sec/3600)}h ago`
}
const hasNumericSample=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value))&&Number(value)>=0
const signalNetwork=(m={})=>{
  if (!m) return 'UNKNOWN'
  const fields=['rx_dropped_delta','tx_dropped_delta','rx_errors_delta','tx_errors_delta']
  if (!fields.some(key=>hasNumericSample(m[key]))) return 'UNKNOWN'
  const drops=Number(hasNumericSample(m.rx_dropped_delta)?m.rx_dropped_delta:0)+Number(hasNumericSample(m.tx_dropped_delta)?m.tx_dropped_delta:0)
  const errors=Number(hasNumericSample(m.rx_errors_delta)?m.rx_errors_delta:0)+Number(hasNumericSample(m.tx_errors_delta)?m.tx_errors_delta:0)
  if(!Number.isFinite(drops+errors))return 'UNKNOWN'
  if(drops+errors>=10)return 'CRITICAL'
  if(drops+errors>0)return 'ATTENTION'
  return fields.every(key=>hasNumericSample(m[key]))?'NORMAL':'UNKNOWN'
}
const signalStorage=(m={})=>{
  if(!hasNumericSample(m?.util_pct))return 'UNKNOWN'
  const util=Number(m.util_pct)
  if(!Number.isFinite(util))return 'UNKNOWN'
  if(util>=95)return 'CRITICAL'
  if(util>=80)return 'ATTENTION'
  return 'NORMAL'
}

function SparkChart({items=[],metricType,selectedSeries='',incidentStart='',range='6h'}){
  const samples=React.useMemo(()=>items.filter(row=>hasNumericSample(row.value)&&Number.isFinite(Date.parse(row.collected_at||''))),[items])
  const groups=React.useMemo(()=>{
    const map=new Map()
    samples.forEach(row=>{const key=row.series_key||'series';if(!map.has(key))map.set(key,[]);map.get(key).push(row)})
    const ranked=[...map.entries()]
      .sort(([,left],[,right])=>Math.max(...right.map(row=>Number(row.value)||0))-Math.max(...left.map(row=>Number(row.value)||0)))
    const limit=metricType==='filesystem'?4:6
    const visible=ranked.slice(0,limit)
    if(selectedSeries&&map.has(selectedSeries)&&!visible.some(([key])=>key===selectedSeries)){
      visible[visible.length-1]=[selectedSeries,map.get(selectedSeries)]
    }
    return visible
  },[samples,metricType,selectedSeries])
  // Match the compact popup chart's rendered aspect ratio (no letterboxing).
  // Only SVG geometry changes; trend data, thresholds and timestamps do not.
  const width=920,height=250
  const pad={left:56,right:34,top:12,bottom:34}
  const values=samples.map(row=>Number(row.value))
  const rawMax=Math.max(1,...values)
  const min=0
  const max=metricType==='filesystem'?100:Math.max(1,rawMax*1.12)
  const ticks=metricType==='filesystem'
    ? [0,50,OPERATOR_THRESHOLDS.filesystem.warning,OPERATOR_THRESHOLDS.filesystem.critical,100]
    : [0,max/2,max]
  const times=samples.map(row=>Date.parse(row.collected_at))
  const t0=Math.min(...times),t1=Math.max(...times)
  const x=t=>pad.left+((new Date(t).getTime()-t0)/Math.max(1,t1-t0))*(width-pad.left-pad.right)
  const y=v=>height-pad.bottom-((Number(v)-min)/Math.max(1,max-min))*(height-pad.top-pad.bottom)
  if(!samples.length)return <div className="rundeckInfraEmpty">No verified numeric samples for selected range.</div>
  const issueTs=Date.parse(incidentStart||'')
  const issueInRange=Number.isFinite(issueTs)&&issueTs>=t0&&issueTs<=t1
  const tickCount=range==='30d'?7:range==='7d'?6:range==='24h'?6:5
  const xTicks=Array.from({length:tickCount},(_,index)=>t0+((t1-t0)*index/Math.max(1,tickCount-1)))
  return <div className="rundeckInfraChartWrap">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Infrastructure trend">
      <line x1={pad.left} y1={height-pad.bottom} x2={width-pad.right} y2={height-pad.bottom} className="axis"/>
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={height-pad.bottom} className="axis"/>
      {ticks.map((tick)=><g key={tick} className="yTick">
        <line x1={pad.left} y1={y(tick)} x2={width-pad.right} y2={y(tick)}/>
        <text x={pad.left-6} y={y(tick)+3}>{metricType==='filesystem'?Math.round(tick):Number(tick.toFixed(1))}{metricType==='filesystem'?'%':''}</text>
      </g>)}
      {metricType==='filesystem'&&<>
        <g className="threshold is-warning"><line x1={pad.left} y1={y(OPERATOR_THRESHOLDS.filesystem.warning)} x2={width-pad.right} y2={y(OPERATOR_THRESHOLDS.filesystem.warning)}/><text x={width-pad.right-4} y={y(OPERATOR_THRESHOLDS.filesystem.warning)-4}>Warn {OPERATOR_THRESHOLDS.filesystem.warning}%</text></g>
        <g className="threshold is-critical"><line x1={pad.left} y1={y(OPERATOR_THRESHOLDS.filesystem.critical)} x2={width-pad.right} y2={y(OPERATOR_THRESHOLDS.filesystem.critical)}/><text x={width-pad.right-4} y={y(OPERATOR_THRESHOLDS.filesystem.critical)-4}>Crit {OPERATOR_THRESHOLDS.filesystem.critical}%</text></g>
      </>}
      {issueInRange&&<g className="issueMarker"><line x1={x(incidentStart)} y1={pad.top} x2={x(incidentStart)} y2={height-pad.bottom}/><text x={x(incidentStart)+4} y={pad.top+10}>Critical WP first observed · {formatTime(incidentStart)} WIB</text></g>}
      {xTicks.map((tick,index)=><g key={tick} className="xTick">
        <line x1={x(tick)} y1={height-pad.bottom} x2={x(tick)} y2={height-pad.bottom+4} className="axis"/>
        <text x={x(tick)} y={height-12} textAnchor={index===0?'start':index===xTicks.length-1?'end':'middle'}>{formatAxisTime(tick,range)}</text>
      </g>)}
      {groups.map(([key,rows],index)=>{
        const cleanRows=[...rows].sort((a,b)=>Date.parse(a.collected_at)-Date.parse(b.collected_at))
        // A retained collection gap must not become a continuous trend line.
        // Use the actual stored cadence, not the live 5-second collector interval.
        const gaps=cleanRows.slice(1).map((row,i)=>Date.parse(row.collected_at)-Date.parse(cleanRows[i].collected_at))
          .filter(delta=>delta>0).sort((a,b)=>a-b)
        const typicalGap=gaps.length?gaps[Math.floor((gaps.length-1)/2)]:0
        const maxGap=Math.max(15*60*1000,typicalGap*3)
        const segments=[]
        let segment=[]
        cleanRows.forEach((row,i)=>{
          if(i>0&&Date.parse(row.collected_at)-Date.parse(cleanRows[i-1].collected_at)>maxGap){
            if(segment.length)segments.push(segment)
            segment=[]
          }
          segment.push(row)
        })
        if(segment.length)segments.push(segment)
        const selected=!selectedSeries||key===selectedSeries
        const latest=cleanRows.at(-1)
        if(cleanRows.length===1){
          const row=cleanRows[0]
          return <circle key={key} cx={x(row.collected_at)} cy={y(row.value)} r="4" className={`seriesPoint s${index%8} ${selected?'is-selected':'is-dimmed'}`}>
            <title>{key} - {metric(row.value,metricType==='network'?' Mbps':'%')} - {formatTime(row.collected_at)} WIB</title>
          </circle>
        }
        return <g key={key}>
          {segments.map((part,segmentIndex)=>part.length===1
            ? <circle key={segmentIndex} cx={x(part[0].collected_at)} cy={y(part[0].value)} r="2.5" className={`seriesPoint s${index%8} ${selected?'is-selected':'is-dimmed'}`}/>
            : <polyline key={segmentIndex} points={part.map(r=>`${x(r.collected_at)},${y(r.value)}`).join(' ')} className={`series s${index%8} ${selected?'is-selected':'is-dimmed'}`} fill="none"/>)}
          {selected&&latest&&<circle cx={x(latest.collected_at)} cy={y(latest.value)} r="4.2" className={`seriesPoint s${index%8} is-selected`}>
            <title>{key} - {metric(latest.value,metricType==='network'?' Mbps':'%')} - {formatTime(latest.collected_at)} WIB</title>
          </circle>}
        </g>
      })}
    </svg>
    <div className="rundeckInfraLegend">{groups.map(([key],index)=><span key={key} className={`s${index%8} ${selectedSeries===key?'is-selected':''}`}><i/> {key}</span>)}</div>
  </div>
}

export default function RundeckInfrastructure({incidentStart='',refreshToken='',compact=false,onOpen=null,initialContext=null,lockedHost=false,hideHostCards=false}){
  const [data,setData]=React.useState({host:'',hosts:[],fs:[],network:[],storage:[]})
  const [allHostFilesystems,setAllHostFilesystems]=React.useState([])
  const [error,setError]=React.useState('')
  const [sourcesLoading,setSourcesLoading]=React.useState(true)
  const [clockNow,setClockNow]=React.useState(()=>Date.now())
  const requestedSapHost = String(initialContext?.sapHost || '').trim()
  const contextHost = initialContext?.host || ''
  const contextMetric = initialContext?.metric || ''
  const contextSeries = initialContext?.series || ''
  const [selectedHost,setSelectedHost]=React.useState(()=>{if(lockedHost)return initialContext?.host||'';if(initialContext?.sapHost)return '';try{return window.localStorage.getItem(HOST_STORAGE_KEY)||''}catch{return ''}})
  const [range,setRange]=React.useState('6h')
  const [trendMetric,setTrendMetric]=React.useState('filesystem')
  const [trendData,setTrendData]=React.useState({scope:'',items:[],meta:null})
  const [selectedSeries,setSelectedSeries]=React.useState('')
  const [fsPage,setFsPage]=React.useState(0)
  const [storagePage,setStoragePage]=React.useState(0)
  React.useEffect(()=>{
    if(requestedSapHost)setSelectedHost('')
    else if(contextHost)setSelectedHost(contextHost)
    if(['filesystem','network','storage'].includes(contextMetric))setTrendMetric(contextMetric)
    if(contextSeries)setSelectedSeries(contextSeries)
  },[requestedSapHost,contextHost,contextMetric,contextSeries])
  const { primary: primaryHosts, others: otherHosts }=splitInfrastructureHosts(data.hosts)
  const hostRow=data.hosts.find(row=>row.host===selectedHost)||(lockedHost||requestedSapHost?null:data.hosts[0])
  const host=hostRow?.host||selectedHost||(requestedSapHost?'':'AOQ')
  const trendScope=[host,range,trendMetric].join(':')
  const trend=React.useMemo(()=>trendData.scope===trendScope?trendData.items:[],[trendData,trendScope])
  const trendMeta=trendData.scope===trendScope?trendData.meta:null
  const observedData=data.host===host?data:{fs:[],network:[],storage:[]}
  const fsPerPage=5
  const fsPageCount=Math.max(1,Math.ceil(observedData.fs.length/fsPerPage))
  const effectiveFsPage=Math.min(fsPage,fsPageCount-1)
  const fsRows=observedData.fs.slice(effectiveFsPage*fsPerPage,(effectiveFsPage+1)*fsPerPage)
  const storagePerPage=4
  const storagePageCount=Math.max(1,Math.ceil(observedData.storage.length/storagePerPage))
  const effectiveStoragePage=Math.min(storagePage,storagePageCount-1)
  const storageRows=observedData.storage.slice(effectiveStoragePage*storagePerPage,(effectiveStoragePage+1)*storagePerPage)
  const telemetryRows=[...observedData.fs,...observedData.network,...observedData.storage]
  const collectedAt=hostRow?.snapshot_ts||telemetryRows[0]?.collected_at
  const freshness=infrastructureTelemetryFreshness(collectedAt,hostRow?.collection_id,telemetryRows,clockNow)
  // Show the verified host snapshot time; the oldest individual metric is not
  // the 'last collected' host timestamp.
  const observedAt=(Number.isFinite(Date.parse(hostRow?.snapshot_ts||''))&&hostRow.snapshot_ts)
    ||telemetryRows.map(row=>row.collected_at)
      .filter(value=>Number.isFinite(Date.parse(value||'')))
      .sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)||collectedAt
  const stale=freshness!=='FRESH'
  const observedStatus=(state)=>infrastructureObservationStatus(state,freshness)

  const refresh=React.useCallback(async(signal)=>{
    if(signal.aborted)return
    setClockNow(Date.now())
    setSourcesLoading(true)
    try{
      const hr=await fetch(`${API}/hosts`,{cache:'no-store',signal})
      if(!hr.ok)throw new Error('Infrastructure API hosts unavailable')
      const hosts=(await hr.json()).items||[]
      if(signal.aborted)return
      const available=hosts.map(row=>row.host)
      const target=lockedHost ? selectedHost : (selectedHost&&available.includes(selectedHost)?selectedHost:(available[0]||''))
      const resolvedTarget=requestedSapHost ? (matchedInfrastructureHost({host:requestedSapHost}, hosts)?.host || '') : target
      if(resolvedTarget!==selectedHost){setSelectedHost(resolvedTarget);setFsPage(0);setStoragePage(0)}
      if(requestedSapHost&&!resolvedTarget){
        setData({host:'',hosts:[],fs:[],network:[],storage:[]})
        setAllHostFilesystems([])
        setError('No verified Infrastructure host mapping for SAP ' + shortHost(requestedSapHost))
        return
      }
      const q=resolvedTarget?`?host=${encodeURIComponent(resolvedTarget)}`:''
      const values=await Promise.all(['filesystems','network','storage','filesystems'].map(async (path,index)=>{
        const scope=index===3?'':q
        const response=await fetch(`${API}/${path}${scope}`,{cache:'no-store',signal})
        if(!response.ok)throw new Error(`Infrastructure API ${path} unavailable`)
        return response.json()
      }))
      if(signal.aborted)return
      const collection = hosts.find(row=>row.host===resolvedTarget)?.collection_id
      const belongsToSnapshot = row => row?.host === resolvedTarget && collection != null && String(row.collection_id || '') === String(collection)
      setData({host:resolvedTarget,hosts,fs:(values[0].items||[]).filter(belongsToSnapshot),network:(values[1].items||[]).filter(belongsToSnapshot),storage:(values[2].items||[]).filter(belongsToSnapshot)})
      setAllHostFilesystems(values[3].items||[])
      setError('')
    }catch(e){if(!signal.aborted&&e.name!=='AbortError'){setData({host:'',hosts:[],fs:[],network:[],storage:[]});setAllHostFilesystems([]);setError(e.message)}}
    finally { if(!signal.aborted) setSourcesLoading(false) }
  },[selectedHost,lockedHost,requestedSapHost])

  React.useEffect(()=>{
    const controller=new AbortController()
    refresh(controller.signal)
    const timer=window.setInterval(()=>refresh(controller.signal),60000)
    return()=>{window.clearInterval(timer);controller.abort()}
  },[refresh,refreshToken])
  React.useEffect(()=>{if(lockedHost||requestedSapHost||!selectedHost)return;try{window.localStorage.setItem(HOST_STORAGE_KEY,selectedHost)}catch{/* best-effort preference */}},[lockedHost,requestedSapHost,selectedHost])
  React.useEffect(()=>{let active=true;(async()=>{if(requestedSapHost && !host)return;try{const q=new URLSearchParams({range,metric:trendMetric});if(host&&host!=='AOQ')q.set('host',host);const r=await fetch(`${API}/trend?${q}`,{cache:'no-store'});if(!r.ok)throw new Error('Infrastructure trend unavailable');const body=await r.json();if(active){setTrendData({scope:[host,range,trendMetric].join(':'),items:body.items||[],meta:body})}}catch(e){if(active){setTrendData({scope:[host,range,trendMetric].join(':'),items:[],meta:null});setError(e.message)}}})();return()=>{active=false}},[range,trendMetric,host,collectedAt,requestedSapHost])

  const fsState=observedData.fs.length?observedStatus(observedData.fs.reduce((state,row)=>worst(state,statusFs(row.used_pct)),'NORMAL')):'UNKNOWN'
  const netState=observedData.network.length?observedStatus(observedData.network.reduce((state,row)=>worst(state,signalNetwork(row.metrics)),'NORMAL')):'UNKNOWN'
  const storageState=observedData.storage.length?observedStatus(observedData.storage.reduce((state,row)=>worst(state,signalStorage(row.metrics)),'NORMAL')):'UNKNOWN'
  const overall=stale?freshness:[fsState,netState,storageState].includes('UNKNOWN')?'UNKNOWN':worst(fsState,netState,storageState)
  const topFilesystem=[...observedData.fs].filter(row=>row.used_pct != null && String(row.used_pct).trim() !== '' && Number.isFinite(Number(row.used_pct))).sort((a,b)=>Number(b.used_pct)-Number(a.used_pct))[0]
  const compactSignal=topFilesystem
    ? `${stale?'Last ':''}${topFilesystem.mount_point||'Filesystem'} ${metric(topFilesystem.used_pct,'%')}`
    : observedData.storage[0]
      ? `${observedData.storage[0].metrics?.mount||observedData.storage[0].sample_key||'Storage'} ${metric(observedData.storage[0].metrics?.util_pct,'%')}`
      : observedData.network[0]
        ? `${observedData.network[0].sample_key||'Network'}`
        : 'No current infrastructure sample'
  const selectedTrendRows=selectedSeries?trend.filter(row=>(row.series_key||'series')===selectedSeries&&Number.isFinite(Date.parse(row.collected_at||''))).sort((a,b)=>Date.parse(a.collected_at)-Date.parse(b.collected_at)):[]
  const selectedValues=selectedTrendRows.filter(row=>hasNumericSample(row.value)).map(row=>Number(row.value))
  const selectedValues2=selectedTrendRows.filter(row=>hasNumericSample(row.value2)).map(row=>Number(row.value2))
  const selectedWriteMbps=selectedTrendRows.filter(row=>hasNumericSample(row.write_mbps)).map(row=>Number(row.write_mbps))
  const selectedDrops=selectedTrendRows.filter(row=>hasNumericSample(row.drop_delta)).map(row=>Number(row.drop_delta))
  const trendCurrent=selectedValues.length?selectedValues.at(-1):null
  const trendMin=selectedValues.length?Math.min(...selectedValues):null
  const trendMax=selectedValues.length?Math.max(...selectedValues):null
  const trendChange=selectedValues.length>1?selectedValues.at(-1)-selectedValues[0]:null
  const storageSourceOver100=trendMetric==='storage'&&selectedTrendRows.some(row=>row.quality_flag==='SOURCE_OVER_100'||Number(row.value)>100)
  const coverageStart=trendMeta?.first_observed_at||''
  const requestedStart=trendMeta?.since||''
  const coverageDelayed=coverageStart&&requestedStart&&(new Date(coverageStart).getTime()-new Date(requestedStart).getTime()>15*60*1000)
  React.useEffect(()=>{
    if(!trend.length)return
    if(selectedSeries&&trend.some((row)=>(row.series_key||'series')===selectedSeries))return
    const grouped=new Map()
    for(const row of trend){
      const key=row.series_key||'series'
      if(!hasNumericSample(row.value))continue
      const value=Number(row.value)
      grouped.set(key,Math.max(grouped.get(key)??Number.NEGATIVE_INFINITY,value))
    }
    const top=[...grouped.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||''
    if(top)setSelectedSeries(top)
  },[selectedSeries,trend,trendMetric])

  const openTrend=(metricType,series='')=>{setTrendMetric(metricType);setSelectedSeries(series)}

  if(compact){
    return <button type="button" className="rundeckEvidenceCard rundeckInfrastructureCard" onClick={onOpen} aria-label="Open Infrastructure Analysis">
      <span className="rundeckEvidenceCardTitle"><SphereIcon name="server" /> Server Health</span>
      <strong>{error ? 'No Data' : `${shortHost(host || 'Server')} · ${overall} · ${compactSignal}`}</strong>
      <em aria-hidden="true">›</em>
    </button>
  }

  return <section className="rundeckInfra" aria-label="Infrastructure monitoring">
    <header className="rundeckInfraCompactHead">
      <div><p title={'Host evidence · ' + (stale ? 'last retained sample' : 'latest collected sample') + ' · ' + freshness}>{stale?'Historical sample':'Host readings'}</p></div>
      <div className="rundeckInfraIdentity"><span className={`state is-${overall.toLowerCase()}`}>{shortHost(host)} · {overall}</span></div>
    </header>
    {!hideHostCards && <div className="rundeckInfraHostCards" role="group" aria-label="Select Infrastructure APP">
      {primaryHosts.map(row=>{
        const evidence=hostInfrastructureEvidence({host:row.host},data.hosts,allHostFilesystems,clockNow)
        const selected=host===row.host
        return <button key={row.host} type="button"
          className={'rundeckInfraHostCard'+(selected?' is-active':'')}
          title={`${row.host} · ${evidence.topFs?.mount_point || 'No matched mount'} · collection ${row.collection_id || 'unknown'} · sample ${evidence.topFs?.collected_at || 'unavailable'}`}
          aria-pressed={selected} onClick={()=>setSelectedHost(row.host)}>
          <b>{shortHost(row.host)}</b>
          <small title={row.source || row.host} className={'is-'+evidence.freshness.toLowerCase()}>{row.source || evidence.freshness}</small>
          <span>FS <strong className={'is-'+evidence.state.toLowerCase()}>
            {evidence.topFs ? (evidence.freshness==='FRESH'?'':'Last ')+metric(evidence.topFs.used_pct,'%') : '—'}
          </strong></span>
        </button>
      })}
      {!data.hosts.length && <span className="rundeckInfraHostMissing" role="status">{sourcesLoading ? 'Loading infrastructure hosts…' : error ? 'Infrastructure host source unavailable; retry on next refresh.' : 'No verified infrastructure hosts.'}</span>}
    </div>}
    {!hideHostCards&&otherHosts.length>0&&<details className="rundeckInfraOtherHosts" defaultOpen={otherHosts.some(row=>row.host===host)}>
      <summary>Other Infrastructure Sources ({otherHosts.length})</summary>
      <div className="rundeckInfraHostCards">
        {otherHosts.map(row=>{
          const evidence=hostInfrastructureEvidence({host:row.host},data.hosts,allHostFilesystems,clockNow)
          return <button key={row.host} type="button"
            className={'rundeckInfraHostCard'+(host===row.host?' is-active':'')}
            aria-pressed={host===row.host} onClick={()=>setSelectedHost(row.host)}>
            <b>{shortHost(row.host)}</b><small>{row.source||'Other source'}</small>
            <span>FS <strong className={'is-'+evidence.state.toLowerCase()}>{evidence.topFs?metric(evidence.topFs.used_pct,'%'):'—'}</strong></span>
          </button>
        })}
      </div>
    </details>}

    <div className="rundeckInfraFreshness"
      title={'Host ' + host + ' · Snapshot ' + (hostRow?.snapshot_ts || 'unknown') + ' · Collection ' + (hostRow?.collection_id || 'unverified') + ' · Collector interval ' + metric(hostRow?.sample_seconds,'s') + ' · State ' + overall}>
      <span><b>Observed</b> {formatTime(observedAt)} WIB</span>
      <span><b>Freshness</b> {freshness==='UNKNOWN'?'UNKNOWN':`${ageText(observedAt)} · ${freshness}`}</span>
      <span><strong className={`is-${overall.toLowerCase()}`}>{overall}</strong></span>
    </div>

    {error&&<div className="rundeckInfraError">{error}</div>}
    {stale&&<div className="rundeckInfraHistoricalNote" role="status" title={'Host ' + host + ' · Collection ' + (hostRow?.collection_id || 'unverified') + ' · sample ' + (observedAt || 'unknown')}>Historical data · {freshness}</div>}
    <div className="rundeckInfraWorkspace">
      <div className="rundeckInfraCurrent">
        <div className="rundeckInfraCurrentLabel">{stale?'Last retained readings':'Latest collected readings'}</div>
        <div className="rundeckInfraGrid">
      <article><div className="cardHead"><div><h4>Filesystem</h4><small>Capacity · {observedData.fs.length} mount(s)</small></div><div className="rundeckInfraFsPager"><button type="button" aria-label="Previous filesystem mounts" disabled={effectiveFsPage===0} onClick={()=>setFsPage(n=>Math.max(0,n-1))}>‹</button><small title={`Filesystem page ${effectiveFsPage+1} of ${fsPageCount}`}>{fsRows.length ? effectiveFsPage*fsPerPage+1 : 0}–{Math.min(observedData.fs.length,(effectiveFsPage+1)*fsPerPage)} / {observedData.fs.length}</small><button type="button" aria-label="Next filesystem mounts" disabled={effectiveFsPage>=fsPageCount-1} onClick={()=>setFsPage(n=>Math.min(fsPageCount-1,n+1))}>›</button><span className={`is-${fsState.toLowerCase()}`}>{fsState}</span></div></div><table><thead><tr><th>Mount</th><th>Used</th><th>State</th></tr></thead><tbody>{fsRows.map(row=><tr key={row.mount_point} className={`is-clickable ${trendMetric==='filesystem'&&selectedSeries===row.mount_point?'is-history-selected':''}`} tabIndex={0} onClick={()=>openTrend('filesystem',row.mount_point)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openTrend('filesystem',row.mount_point)}}}><td title={`${row.host} · ${row.device || 'device unknown'} · collection ${row.collection_id || 'unknown'} · ${row.collected_at || 'time unknown'}`}>{row.mount_point}</td><td>{metric(row.used_pct,'%')}</td><td><b className={`is-${observedStatus(statusFs(row.used_pct)).toLowerCase()}`}>{observedStatus(statusFs(row.used_pct))}</b></td></tr>)}{!observedData.fs.length&&<tr><td colSpan="3">No filesystem sample.</td></tr>}</tbody></table></article>
      <article>
        <div className="cardHead"><h4>Network</h4><span className={`is-${netState.toLowerCase()}`}>{netState}</span></div>
        <table>
          <thead><tr><th>Interface</th><th>RX</th><th>TX</th><th>Drop Δ</th></tr></thead>
          <tbody>
            {observedData.network.map((row) => {
              const m = row.metrics || {}
              const open = () => openTrend('network', row.sample_key)
              return <tr
                key={row.sample_key}
                className={`is-clickable ${trendMetric==='network'&&selectedSeries===row.sample_key?'is-history-selected':''}`}
                tabIndex={0}
                onClick={open}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  open()
                }}
              >
                <td>{row.sample_key}</td>
                <td>{metric(m.rx_mbps, ' Mbps')}</td>
                <td>{metric(m.tx_mbps, ' Mbps')}</td>
                <td className={`is-${observedStatus(signalNetwork(m)).toLowerCase()}`}>{m.rx_dropped_delta == null && m.tx_dropped_delta == null ? '—' : metric(Number(m.rx_dropped_delta || 0) + Number(m.tx_dropped_delta || 0))}</td>
              </tr>
            })}
            {!observedData.network.length && <tr><td colSpan="4">No network sample.</td></tr>}
          </tbody>
        </table>
      </article>
      <article>
        <div className="cardHead"><div><h4>Storage I/O</h4><small>{observedData.storage.length} device(s)</small></div><div className="rundeckInfraFsPager"><button type="button" aria-label="Previous storage devices" disabled={effectiveStoragePage===0} onClick={()=>setStoragePage(n=>Math.max(0,n-1))}>‹</button><small title={`Storage page ${effectiveStoragePage+1} of ${storagePageCount}`}>{storageRows.length ? effectiveStoragePage*storagePerPage+1 : 0}–{Math.min(observedData.storage.length,(effectiveStoragePage+1)*storagePerPage)} / {observedData.storage.length}</small><button type="button" aria-label="Next storage devices" disabled={effectiveStoragePage>=storagePageCount-1} onClick={()=>setStoragePage(n=>Math.min(storagePageCount-1,n+1))}>›</button><span className={`is-${storageState.toLowerCase()}`}>{storageState}</span></div></div>
        <table>
          <thead><tr><th>Mount</th><th>Util</th><th>Write IOPS</th><th>Write</th></tr></thead>
          <tbody>
            {storageRows.map((row) => {
              const m = row.metrics || {}
              const series = m.mount || row.sample_key
              const open = () => openTrend('storage', series)
              return <tr
                key={row.sample_key}
                className={`is-clickable ${trendMetric==='storage'&&selectedSeries===series?'is-history-selected':''}`}
                tabIndex={0}
                onClick={open}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  open()
                }}
              >
                <td>{series}</td>
                <td className={`is-${observedStatus(signalStorage(m)).toLowerCase()}`}>{metric(m.util_pct, '%')}</td>
                <td>{metric(m.write_iops)}</td>
                <td>{metric(m.write_mbps, ' MB/s')}</td>
              </tr>
            })}
            {!observedData.storage.length && <tr><td colSpan="4">No storage sample.</td></tr>}
          </tbody>
        </table>
      </article>
        </div>
      </div>

      <section className="rundeckInfraTrend rundeckInfraTrendWorkspace">
        <div className="rundeckInfraTrendWorkspaceHead">
          <div><b>Infrastructure History</b><small>{host} · historical measurements</small></div>
        </div>
        <header><div/><div className="controls">
        <div>{['1h','6h','24h','7d','30d'].map(v=><button key={v} type="button" className={range===v?'is-active':''} onClick={()=>setRange(v)}>{v.toUpperCase()}</button>)}</div>
        <div>{[['filesystem','Filesystem'],['network','Network'],['storage','Storage I/O']].map(([v,label])=><button key={v} type="button" className={trendMetric===v?'is-active':''} onClick={()=>{setTrendMetric(v);setSelectedSeries('')}}>{label}</button>)}</div>
      </div></header>
      {selectedSeries&&selectedValues.length>0&&<div className="rundeckInfraTrendSummary">
        <strong>Selected: {selectedSeries}</strong>
        <div className="rundeckInfraTrendStats">
          <span><b>Last sample in range</b>{metric(trendCurrent,trendMetric==='network'?' Mbps':'%')}</span>
          <span><b>Min</b>{metric(trendMin,trendMetric==='network'?' Mbps':'%')}</span>
          <span><b>{storageSourceOver100?'Reported Max':'Max'}</b>{metric(trendMax,trendMetric==='network'?' Mbps':'%')}</span>
          {trendChange!==null&&<span><b>Change from range start</b>{trendChange>0?'+':''}{metric(trendChange,trendMetric==='network'?' Mbps':' pp')}</span>}
          {trendMetric==='network'&&selectedValues2.length>0&&<span><b>Peak TX</b>{metric(Math.max(...selectedValues2),' Mbps')}</span>}
          {trendMetric==='network'&&selectedDrops.length>0&&<span title="Maximum combined RX + TX dropped-counter delta reported in one retained sample."><b>Peak Drop Delta</b>{metric(Math.max(...selectedDrops))}</span>}
          {trendMetric==='storage'&&selectedValues2.length>0&&<span><b>Peak Write IOPS</b>{metric(Math.max(...selectedValues2),' IOPS')}</span>}
          {trendMetric==='storage'&&selectedWriteMbps.length>0&&<span><b>Peak Write MB/s</b>{metric(Math.max(...selectedWriteMbps),' MB/s')}</span>}
          {storageSourceOver100&&<span className="is-attention" title="The collector stored a storage util_pct source value above 100. SPHERE keeps the raw value visible instead of silently clamping it. Verify collector/device mapping before treating it as a physical utilization percentage."><b>Source Quality</b>util &gt;100% - verify</span>}
        </div>
      </div>}
      {coverageDelayed&&<div className="rundeckInfraCoverageNote">Retained history starts {formatTime(coverageStart)} WIB; earlier time in this range has no retained collection.</div>}
      <SparkChart items={trend} metricType={trendMetric} selectedSeries={selectedSeries} incidentStart={incidentStart} range={range}/>
        <small>{trendMetric==='filesystem'?'Filesystem Capacity':trendMetric==='network'?'RX Throughput History - TX peak and drop delta shown above':'Storage I/O Activity - write peaks shown above'} - {range.toUpperCase()} · {selectedTrendRows.length} retained samples for selected series</small>
      </section>
    </div>
  </section>
}

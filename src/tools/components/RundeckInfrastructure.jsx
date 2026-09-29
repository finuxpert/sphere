import React from 'react'
import './RundeckInfrastructure.css'

const API=`${import.meta.env.BASE_URL}api/infra`
const HOST_STORAGE_KEY='sphere.live.host'
const metric=(value,suffix='')=>value===null||value===undefined||value===''?'—':`${Number(value).toLocaleString('en-US',{maximumFractionDigits:1})}${suffix}`
const statusFs=(value)=>Number(value)>=90?'CRITICAL':Number(value)>=80?'ATTENTION':'NORMAL'
const severityRank={NORMAL:0,ATTENTION:1,CRITICAL:2}
const worst=(...states)=>states.reduce((a,b)=>(severityRank[b]||0)>(severityRank[a]||0)?b:a,'NORMAL')
const formatTime=(value)=>value?new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short',hour12:false}).format(new Date(value)):'—'
const ageText=(value)=>{
  if(!value)return '—'
  const sec=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000))
  if(sec<60)return `${sec}s ago`
  if(sec<3600)return `${Math.floor(sec/60)}m ago`
  return `${Math.floor(sec/3600)}h ago`
}
const signalNetwork=(m={})=>{
  const drops=Number(m.rx_dropped_delta||0)+Number(m.tx_dropped_delta||0)
  const errors=Number(m.rx_errors_delta||0)+Number(m.tx_errors_delta||0)
  if(drops+errors>=10)return 'CRITICAL'
  if(drops+errors>0)return 'ATTENTION'
  return 'NORMAL'
}
const signalStorage=(m={})=>{
  const util=Number(m.util_pct||0)
  if(util>=95)return 'CRITICAL'
  if(util>=80)return 'ATTENTION'
  return 'NORMAL'
}

function SparkChart({items=[],metricType,selectedSeries='',incidentStart=''}){
  const groups=React.useMemo(()=>{
    const map=new Map()
    items.forEach(row=>{const key=row.series_key||'series';if(!map.has(key))map.set(key,[]);map.get(key).push(row)})
    const ranked=[...map.entries()]
      .sort(([,left],[,right])=>Math.max(...right.map(row=>Number(row.value)||0))-Math.max(...left.map(row=>Number(row.value)||0)))
    const limit=metricType==='filesystem'?4:6
    const visible=ranked.slice(0,limit)
    if(selectedSeries&&map.has(selectedSeries)&&!visible.some(([key])=>key===selectedSeries)){
      visible[visible.length-1]=[selectedSeries,map.get(selectedSeries)]
    }
    return visible
  },[items,metricType,selectedSeries])
  const width=920,height=210,pad=34
  const values=items.map(row=>Number(row.value)).filter(Number.isFinite)
  const rawMax=Math.max(1,...values)
  const min=0
  const max=metricType==='filesystem'?100:Math.max(1,rawMax*1.12)
  const ticks=metricType==='filesystem'
    ? [0,50,75,90,100]
    : [0,max/2,max]
  const times=items.map(row=>new Date(row.collected_at).getTime()).filter(Number.isFinite)
  const t0=Math.min(...times),t1=Math.max(...times)
  const x=t=>pad+((new Date(t).getTime()-t0)/Math.max(1,t1-t0))*(width-pad*2)
  const y=v=>height-pad-((Number(v)-min)/Math.max(1,max-min))*(height-pad*2)
  if(!items.length)return <div className="rundeckInfraEmpty">No history for selected range.</div>
  const issueTs=Date.parse(incidentStart||'')
  const issueInRange=Number.isFinite(issueTs)&&issueTs>=t0&&issueTs<=t1
  const midTs=t0+((t1-t0)/2)
  const xTicks=[t0,midTs,t1]
  return <div className="rundeckInfraChartWrap">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Infrastructure trend">
      <line x1={pad} y1={height-pad} x2={width-pad} y2={height-pad} className="axis"/>
      <line x1={pad} y1={pad} x2={pad} y2={height-pad} className="axis"/>
      {ticks.map((tick)=><g key={tick} className="yTick">
        <line x1={pad} y1={y(tick)} x2={width-pad} y2={y(tick)}/>
        <text x={pad-6} y={y(tick)+3}>{metricType==='filesystem'?Math.round(tick):Number(tick.toFixed(1))}{metricType==='filesystem'?'%':''}</text>
      </g>)}
      {metricType==='filesystem'&&<>
        <g className="threshold is-warning"><line x1={pad} y1={y(75)} x2={width-pad} y2={y(75)}/><text x={width-pad-4} y={y(75)-4}>Warn 75%</text></g>
        <g className="threshold is-critical"><line x1={pad} y1={y(90)} x2={width-pad} y2={y(90)}/><text x={width-pad-4} y={y(90)-4}>Crit 90%</text></g>
      </>}
      {issueInRange&&<g className="issueMarker"><line x1={x(incidentStart)} y1={pad} x2={x(incidentStart)} y2={height-pad}/><text x={x(incidentStart)+4} y={pad+10}>Critical WP Started · {formatTime(incidentStart)} WIB</text></g>}
      {xTicks.map((tick,index)=><g key={tick} className="xTick">
        <line x1={x(tick)} y1={height-pad} x2={x(tick)} y2={height-pad+4} className="axis"/>
        <text x={x(tick)} y={height-7} textAnchor={index===0?'start':index===xTicks.length-1?'end':'middle'}>{formatTime(tick)} WIB</text>
      </g>)}
      {groups.map(([key,rows],index)=>{
        const points=rows.map(r=>`${x(r.collected_at)},${y(r.value)}`).join(' ')
        const selected=!selectedSeries||key===selectedSeries
        if(rows.length===1){
          const row=rows[0]
          return <circle key={key} cx={x(row.collected_at)} cy={y(row.value)} r="3.5" className={`seriesPoint s${index%8} ${selected?'is-selected':'is-dimmed'}`}/>
        }
        return <polyline key={key} points={points} className={`series s${index%8} ${selected?'is-selected':'is-dimmed'}`} fill="none"/>
      })}
    </svg>
    <div className="rundeckInfraLegend">{groups.map(([key],index)=><span key={key} className={`s${index%8} ${selectedSeries===key?'is-selected':''}`}><i/> {key}</span>)}</div>
  </div>
}

export default function RundeckInfrastructure({incidentStart=''}){
  const [data,setData]=React.useState({hosts:[],fs:[],network:[],storage:[]})
  const [error,setError]=React.useState('')
  const [selectedHost,setSelectedHost]=React.useState(()=>{try{return window.localStorage.getItem(HOST_STORAGE_KEY)||''}catch{return ''}})
  const [range,setRange]=React.useState('6h')
  const [trendMetric,setTrendMetric]=React.useState('filesystem')
  const [trend,setTrend]=React.useState([])
  const [selectedSeries,setSelectedSeries]=React.useState('')
  const hostRow=data.hosts.find(row=>row.host===selectedHost)||data.hosts[0]
  const host=hostRow?.host||selectedHost||'AOQ'
  const collectedAt=hostRow?.snapshot_ts||data.fs[0]?.collected_at||data.network[0]?.collected_at||data.storage[0]?.collected_at
  const stale=collectedAt?Date.now()-new Date(collectedAt).getTime()>15*60*1000:true

  const refresh=React.useCallback(async()=>{
    try{
      const hr=await fetch(`${API}/hosts`,{cache:'no-store'})
      if(!hr.ok)throw new Error('Infrastructure API hosts unavailable')
      const hosts=(await hr.json()).items||[]
      const available=hosts.map(row=>row.host)
      const target=selectedHost&&available.includes(selectedHost)?selectedHost:(available[0]||'')
      if(target&&!selectedHost)setSelectedHost(target)
      const q=target?`?host=${encodeURIComponent(target)}`:''
      const values=await Promise.all(['filesystems','network','storage'].map(async p=>{const r=await fetch(`${API}/${p}${q}`,{cache:'no-store'});if(!r.ok)throw new Error(`Infrastructure API ${p} unavailable`);return r.json()}))
      setData({hosts,fs:values[0].items||[],network:values[1].items||[],storage:values[2].items||[]})
      setError('')
    }catch(e){setError(e.message)}
  },[selectedHost])

  React.useEffect(()=>{refresh();const t=setInterval(refresh,60000);return()=>clearInterval(t)},[refresh])
  React.useEffect(()=>{if(!selectedHost)return;try{window.localStorage.setItem(HOST_STORAGE_KEY,selectedHost)}catch{/* best-effort preference */}},[selectedHost])
  React.useEffect(()=>{let active=true;(async()=>{try{const q=new URLSearchParams({range,metric:trendMetric});if(host&&host!=='AOQ')q.set('host',host);const r=await fetch(`${API}/trend?${q}`,{cache:'no-store'});if(!r.ok)throw new Error('Infrastructure trend unavailable');const body=await r.json();if(active)setTrend(body.items||[])}catch(e){if(active)setError(e.message)}})();return()=>{active=false}},[range,trendMetric,host,collectedAt])

  const fsState=data.fs.reduce((state,row)=>worst(state,statusFs(row.used_pct)),'NORMAL')
  const netState=data.network.reduce((state,row)=>worst(state,signalNetwork(row.metrics)),'NORMAL')
  const storageState=data.storage.reduce((state,row)=>worst(state,signalStorage(row.metrics)),'NORMAL')
  const overall=stale?'ATTENTION':worst(fsState,netState,storageState)
  const selectedTrendRows=selectedSeries?trend.filter(row=>(row.series_key||'series')===selectedSeries):[]
  const selectedValues=selectedTrendRows.map(row=>Number(row.value)).filter(Number.isFinite)
  const selectedValues2=selectedTrendRows.map(row=>Number(row.value2)).filter(Number.isFinite)
  const selectedWriteMbps=selectedTrendRows.map(row=>Number(row.write_mbps)).filter(Number.isFinite)
  const selectedDrops=selectedTrendRows.map(row=>Number(row.drop_delta)).filter(Number.isFinite)
  const trendCurrent=selectedValues.length?selectedValues.at(-1):null
  const trendMin=selectedValues.length?Math.min(...selectedValues):null
  const trendMax=selectedValues.length?Math.max(...selectedValues):null
  const trendChange=selectedValues.length>1?selectedValues.at(-1)-selectedValues[0]:null
  React.useEffect(()=>{
    if(!trend.length)return
    if(selectedSeries&&trend.some((row)=>(row.series_key||'series')===selectedSeries))return
    const grouped=new Map()
    for(const row of trend){
      const key=row.series_key||'series'
      const value=Number(row.value)
      if(!Number.isFinite(value))continue
      grouped.set(key,Math.max(grouped.get(key)??Number.NEGATIVE_INFINITY,value))
    }
    const top=[...grouped.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||''
    if(top)setSelectedSeries(top)
  },[selectedSeries,trend,trendMetric])

  const openTrend=(metricType,series='')=>{setTrendMetric(metricType);setSelectedSeries(series)}

  return <section className="rundeckInfra" aria-label="Infrastructure monitoring">
    <header className="rundeckInfraCompactHead">
      <div><p>Filesystem, network and storage for this server.</p></div>
      <div className="rundeckInfraIdentity"><select aria-label="Infrastructure host" value={host==='AOQ'?'':host} onChange={e=>setSelectedHost(e.target.value)}>{data.hosts.map(row=><option key={row.host} value={row.host}>{row.source?`${row.source} · `:''}{row.host}</option>)}</select><span className={`state is-${overall.toLowerCase()}`}>{overall}</span></div>
    </header>

    <div className="rundeckInfraFreshness">
      <span><b>Last collected</b> {formatTime(collectedAt)} WIB</span>
      <span><b>Freshness</b> {ageText(collectedAt)} · {stale?'STALE':'FRESH'}</span>
      <span><b>Sampling</b> {metric(hostRow?.sample_seconds,'s')}</span>
      <span><b>State</b> infrastructure</span>
    </div>

    {error&&<div className="rundeckInfraError">{error}</div>}
    <div className="rundeckInfraWorkspace">
      <div className="rundeckInfraCurrent">
        <div className="rundeckInfraCurrentLabel">Current Snapshot</div>
        <div className="rundeckInfraGrid">
      <article><div className="cardHead"><h4>Filesystem</h4><span className={`is-${fsState.toLowerCase()}`}>{fsState}</span></div><table><thead><tr><th>Mount</th><th>Used</th><th>State</th></tr></thead><tbody>{data.fs.map(row=><tr key={row.mount_point} className={`is-clickable ${trendMetric==='filesystem'&&selectedSeries===row.mount_point?'is-history-selected':''}`} tabIndex={0} onClick={()=>openTrend('filesystem',row.mount_point)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openTrend('filesystem',row.mount_point)}}}><td>{row.mount_point}</td><td>{metric(row.used_pct,'%')}</td><td><b className={`is-${statusFs(row.used_pct).toLowerCase()}`}>{statusFs(row.used_pct)}</b></td></tr>)}{!data.fs.length&&<tr><td colSpan="3">No filesystem sample.</td></tr>}</tbody></table></article>
      <article>
        <div className="cardHead"><h4>Network</h4><span className={`is-${netState.toLowerCase()}`}>{netState}</span></div>
        <table>
          <thead><tr><th>Interface</th><th>RX</th><th>TX</th><th>Drop Δ</th></tr></thead>
          <tbody>
            {data.network.map((row) => {
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
                <td className={`is-${signalNetwork(m).toLowerCase()}`}>{metric(Number(m.rx_dropped_delta || 0) + Number(m.tx_dropped_delta || 0))}</td>
              </tr>
            })}
            {!data.network.length && <tr><td colSpan="4">No network sample.</td></tr>}
          </tbody>
        </table>
      </article>
      <article>
        <div className="cardHead"><h4>Storage I/O</h4><span className={`is-${storageState.toLowerCase()}`}>{storageState}</span></div>
        <table>
          <thead><tr><th>Mount</th><th>Util</th><th>Write IOPS</th><th>Write</th></tr></thead>
          <tbody>
            {data.storage.map((row) => {
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
                <td className={`is-${signalStorage(m).toLowerCase()}`}>{metric(m.util_pct, '%')}</td>
                <td>{metric(m.write_iops)}</td>
                <td>{metric(m.write_mbps, ' MB/s')}</td>
              </tr>
            })}
            {!data.storage.length && <tr><td colSpan="4">No storage sample.</td></tr>}
          </tbody>
        </table>
      </article>
        </div>
      </div>

      <section className="rundeckInfraTrend rundeckInfraTrendWorkspace">
        <div className="rundeckInfraTrendWorkspaceHead">
          <div><b>Infrastructure History</b><small>Usage history for {host}</small></div>
          <em>{selectedSeries||'Selecting…'} · {range.toUpperCase()}</em>
        </div>
        <header><div><p>History for the selected server.</p></div><div className="controls">
        <div>{['1h','6h','24h','7d','30d'].map(v=><button key={v} type="button" className={range===v?'is-active':''} onClick={()=>setRange(v)}>{v.toUpperCase()}</button>)}</div>
        <div>{[['filesystem','Filesystem'],['network','Network'],['storage','Storage I/O']].map(([v,label])=><button key={v} type="button" className={trendMetric===v?'is-active':''} onClick={()=>{setTrend([]);setTrendMetric(v);setSelectedSeries('')}}>{label}</button>)}</div>
      </div></header>
      {selectedSeries&&selectedValues.length>0&&<div className="rundeckInfraTrendSummary">
        <strong>Selected: {selectedSeries}</strong>
        <span>Current {metric(trendCurrent,trendMetric==='network'?' Mbps':'%')}</span>
        <span>Min {metric(trendMin,trendMetric==='network'?' Mbps':'%')}</span>
        <span>Max {metric(trendMax,trendMetric==='network'?' Mbps':'%')}</span>
        {trendChange!==null&&<span>Change {trendChange>0?'+':''}{metric(trendChange,trendMetric==='network'?' Mbps':' pp')}</span>}
        {trendMetric==='network'&&selectedValues2.length>0&&<span>Peak TX {metric(Math.max(...selectedValues2),' Mbps')}</span>}
        {trendMetric==='network'&&selectedDrops.length>0&&<span>Drops {metric(Math.max(...selectedDrops))}</span>}
        {trendMetric==='storage'&&selectedValues2.length>0&&<span>Peak write {metric(Math.max(...selectedValues2),' IOPS')}</span>}
        {trendMetric==='storage'&&selectedWriteMbps.length>0&&<span>Peak write {metric(Math.max(...selectedWriteMbps),' MB/s')}</span>}
      </div>}
      <SparkChart items={trend} metricType={trendMetric} selectedSeries={selectedSeries} incidentStart={incidentStart}/>
        <small>{trendMetric==='filesystem'?'Filesystem usage':trendMetric==='network'?'Network RX history with TX peak and drops':'Storage utilization with write peaks'} · {range.toUpperCase()}</small>
      </section>
    </div>
  </section>
}

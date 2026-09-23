import React from 'react'
import './RundeckInfrastructure.css'

const API=`${import.meta.env.BASE_URL}api/infra`
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

function SparkChart({items=[],metricType}){
  const groups=React.useMemo(()=>{
    const map=new Map()
    items.forEach(row=>{const key=row.series_key||'series';if(!map.has(key))map.set(key,[]);map.get(key).push(row)})
    return [...map.entries()].slice(0,8)
  },[items])
  const width=920,height=210,pad=28
  const values=items.flatMap(row=>[Number(row.value),Number(row.value2)]).filter(Number.isFinite)
  const max=Math.max(1,...values)
  const min=metricType==='network'?0:Math.min(0,...values)
  const times=items.map(row=>new Date(row.collected_at).getTime()).filter(Number.isFinite)
  const t0=Math.min(...times),t1=Math.max(...times)
  const x=t=>pad+((new Date(t).getTime()-t0)/Math.max(1,t1-t0))*(width-pad*2)
  const y=v=>height-pad-((Number(v)-min)/Math.max(1,max-min))*(height-pad*2)
  if(!items.length)return <div className="rundeckInfraEmpty">No history for selected range.</div>
  return <div className="rundeckInfraChartWrap">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Infrastructure trend">
      <line x1={pad} y1={height-pad} x2={width-pad} y2={height-pad} className="axis"/>
      <line x1={pad} y1={pad} x2={pad} y2={height-pad} className="axis"/>
      {groups.map(([key,rows],index)=>{
        const points=rows.map(r=>`${x(r.collected_at)},${y(r.value)}`).join(' ')
        return <polyline key={key} points={points} className={`series s${index%8}`} fill="none"/>
      })}
    </svg>
    <div className="rundeckInfraLegend">{groups.map(([key],index)=><span key={key} className={`s${index%8}`}><i/> {key}</span>)}</div>
  </div>
}

export default function RundeckInfrastructure(){
  const [data,setData]=React.useState({hosts:[],fs:[],network:[],storage:[]})
  const [error,setError]=React.useState('')
  const [range,setRange]=React.useState('6h')
  const [trendMetric,setTrendMetric]=React.useState('filesystem')
  const [trend,setTrend]=React.useState([])
  const host=data.hosts[0]?.host||'AOQ'
  const collectedAt=data.hosts[0]?.snapshot_ts||data.fs[0]?.collected_at||data.network[0]?.collected_at||data.storage[0]?.collected_at
  const stale=collectedAt?Date.now()-new Date(collectedAt).getTime()>15*60*1000:true

  const refresh=React.useCallback(async()=>{
    try{
      const paths=['hosts','filesystems','network','storage']
      const values=await Promise.all(paths.map(async p=>{const r=await fetch(`${API}/${p}`,{cache:'no-store'});if(!r.ok)throw new Error(`Infrastructure API ${p} unavailable`);return r.json()}))
      setData({hosts:values[0].items||[],fs:values[1].items||[],network:values[2].items||[],storage:values[3].items||[]})
      setError('')
    }catch(e){setError(e.message)}
  },[])

  React.useEffect(()=>{refresh();const t=setInterval(refresh,60000);return()=>clearInterval(t)},[refresh])
  React.useEffect(()=>{let active=true;(async()=>{try{const q=new URLSearchParams({range,metric:trendMetric});if(host&&host!=='AOQ')q.set('host',host);const r=await fetch(`${API}/trend?${q}`,{cache:'no-store'});if(!r.ok)throw new Error('Infrastructure trend unavailable');const body=await r.json();if(active)setTrend(body.items||[])}catch(e){if(active)setError(e.message)}})();return()=>{active=false}},[range,trendMetric,host,collectedAt])

  const fsState=data.fs.reduce((state,row)=>worst(state,statusFs(row.used_pct)),'NORMAL')
  const netState=data.network.reduce((state,row)=>worst(state,signalNetwork(row.metrics)),'NORMAL')
  const storageState=data.storage.reduce((state,row)=>worst(state,signalStorage(row.metrics)),'NORMAL')
  const overall=stale?'ATTENTION':worst(fsState,netState,storageState)

  return <section className="rundeckInfra" aria-label="Infrastructure monitoring">
    <header>
      <div><h3>Infrastructure</h3><p>Filesystem, network and storage I/O supporting evidence. Signals are not automatic root-cause conclusions.</p></div>
      <div className="rundeckInfraIdentity"><strong>{host}</strong><span className={`state is-${overall.toLowerCase()}`}>{overall}</span></div>
    </header>

    <div className="rundeckInfraFreshness">
      <span><b>Last collected</b> {formatTime(collectedAt)} WIB</span>
      <span><b>Freshness</b> {ageText(collectedAt)} · {stale?'STALE':'FRESH'}</span>
      <span><b>Sampling</b> {metric(data.hosts[0]?.sample_seconds,'s')}</span>
      <span><b>State</b> supporting infrastructure signal</span>
    </div>

    {error&&<div className="rundeckInfraError">{error}</div>}
    <div className="rundeckInfraGrid">
      <article><div className="cardHead"><h4>Filesystem</h4><span className={`is-${fsState.toLowerCase()}`}>{fsState}</span></div><table><thead><tr><th>Mount</th><th>Used</th><th>State</th></tr></thead><tbody>{data.fs.map(row=><tr key={row.mount_point}><td>{row.mount_point}</td><td>{metric(row.used_pct,'%')}</td><td><b className={`is-${statusFs(row.used_pct).toLowerCase()}`}>{statusFs(row.used_pct)}</b></td></tr>)}{!data.fs.length&&<tr><td colSpan="3">No filesystem sample.</td></tr>}</tbody></table></article>
      <article><div className="cardHead"><h4>Network</h4><span className={`is-${netState.toLowerCase()}`}>{netState}</span></div><table><thead><tr><th>Interface</th><th>RX</th><th>TX</th><th>Drop Δ</th></tr></thead><tbody>{data.network.map(row=>{const m=row.metrics||{};return <tr key={row.sample_key}><td>{row.sample_key}</td><td>{metric(m.rx_mbps,' Mbps')}</td><td>{metric(m.tx_mbps,' Mbps')}</td><td className={`is-${signalNetwork(m).toLowerCase()}`}>{metric(Number(m.rx_dropped_delta||0)+Number(m.tx_dropped_delta||0))}</td></tr>})}{!data.network.length&&<tr><td colSpan="4">No network sample.</td></tr>}</tbody></table></article>
      <article><div className="cardHead"><h4>Storage I/O</h4><span className={`is-${storageState.toLowerCase()}`}>{storageState}</span></div><table><thead><tr><th>Mount</th><th>Util</th><th>Write IOPS</th><th>Write</th></tr></thead><tbody>{data.storage.map(row=>{const m=row.metrics||{};return <tr key={row.sample_key}><td>{m.mount||row.sample_key}</td><td className={`is-${signalStorage(m).toLowerCase()}`}>{metric(m.util_pct,'%')}</td><td>{metric(m.write_iops)}</td><td>{metric(m.write_mbps,' MB/s')}</td></tr>})}{!data.storage.length&&<tr><td colSpan="4">No storage sample.</td></tr>}</tbody></table></article>
    </div>

    <section className="rundeckInfraTrend">
      <header><div><h4>Infrastructure Trend</h4><p>Historical supporting evidence for the selected host.</p></div><div className="controls">
        <div>{['1h','6h','24h','7d'].map(v=><button key={v} type="button" className={range===v?'is-active':''} onClick={()=>setRange(v)}>{v.toUpperCase()}</button>)}</div>
        <div>{[['filesystem','Filesystem'],['network','Network'],['storage','Storage I/O']].map(([v,label])=><button key={v} type="button" className={trendMetric===v?'is-active':''} onClick={()=>setTrendMetric(v)}>{label}</button>)}</div>
      </div></header>
      <SparkChart items={trend} metricType={trendMetric}/>
      <small>{trendMetric==='filesystem'?'Used % by primary filesystem':trendMetric==='network'?'RX Mbps by interface; TX remains available in API':'Disk util % by mapped mount'} · {range.toUpperCase()} · correlation evidence only</small>
    </section>
  </section>
}

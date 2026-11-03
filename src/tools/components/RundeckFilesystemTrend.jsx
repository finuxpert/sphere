import React from 'react'
import { formatWib, shortHost } from './sapUiFormat.js'
import './RundeckFilesystemTrend.css'

const API=import.meta.env.BASE_URL+'api/infra'
const VALID_RANGES=new Set(['1h','6h','24h','7d','30d'])
const validNumber=value=>value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
async function get(url,signal){
  const response=await fetch(url,{cache:'no-store',signal})
  if(!response.ok)throw new Error('Filesystem history unavailable ('+response.status+')')
  return response.json()
}
const W=400,H=140,L=30,R=10,T=9,B=25
const colors=['#67a9e8','#67c8a0','#e7b65d','#dba4b6','#9c9ce3']
export default function RundeckFilesystemTrend({ mount='/',range='6h',refreshToken='',focusedHost='' }){
  const isRoot=mount==='/'
  const [hostChoice,setHostChoice]=React.useState(()=>/^APP[1-5]$/.test(shortHost(focusedHost))?shortHost(focusedHost):'APP1')
  React.useEffect(()=>{
    // Root summary represents the highest fresh APP. Follow that host when
    // its source changes; non-root mounts remain explicitly sourced from APP1.
    const host=shortHost(focusedHost)
    if(isRoot && /^APP[1-5]$/.test(host))setHostChoice(host)
  },[isRoot,focusedHost])
  const [state,setState]=React.useState({data:[],error:'',loading:true,scope:''})
  const accepted=VALID_RANGES.has(range)
  React.useEffect(()=>{
    if(!accepted){setState({data:[],error:'Range not available for filesystem. Select 1H, 6H, 1D, 7D or 30D.',loading:false,scope:''});return}
    const controller=new AbortController()
    setState(old=>({...old,loading:true,error:''}))
    Promise.all([get(API+'/hosts',controller.signal)]).then(async([available])=>{
      const hosts=(available.items||[]).filter(x=>/^APP[1-5]$/i.test(shortHost(x.host)))
      const selected=isRoot ? (hostChoice==='ALL'?hosts:hosts.filter(x=>shortHost(x.host)===hostChoice))
        : hosts.filter(x=>shortHost(x.host)==='APP1')
      const result=await Promise.allSettled(selected.map(row=>get(API+'/trend?range='+encodeURIComponent(range)+'&metric=filesystem&host='+encodeURIComponent(row.host)+'&mount='+encodeURIComponent(mount)+'&resolution=hourly_peak',controller.signal)))
      if(controller.signal.aborted)return
      const rows=result.flatMap((item,i)=>item.status==='fulfilled'
        ? (item.value.items||[]).filter(point=>String(point.series_key||'').toUpperCase()===mount.toUpperCase()&&validNumber(point.value))
          .map(point=>({...point,displayHost:shortHost(selected[i].host)})) : [])
      setState({data:rows,error:result.some(x=>x.status==='rejected')?'Some APP history sources unavailable':'',loading:false,scope:range+':'+mount})
    }).catch(e=>{if(!controller.signal.aborted)setState({data:[],error:e.message||'No filesystem history',loading:false,scope:''})})
    return()=>controller.abort()
  },[accepted,range,mount,hostChoice,isRoot,refreshToken])
  // Never plot samples outside the selected WIB history window. Keep real
  // observed spikes, but reject invalid percentages and out-of-range dates.
  const maxTs=Date.now()
  const rangeHours=range==='1h'?1:range==='6h'?6:range==='24h'?24:range==='7d'?168:720
  const minTs=maxTs-rangeHours*3600_000
  const records=(state.scope===range+':'+mount ? state.data : []).filter(item=>{
    const at=Date.parse(item.collected_at||'')
    const value=Number(item.value)
    return validNumber(item.value) && Number.isFinite(at) &&
      at>=minTs && at<=maxTs && value>=0 && value<=100
  })
  const values=records.map(item=>Number(item.value))
  const max=values.length?Math.max(...values):null
  const peakRecord=records.reduce((best,item)=>!best||Number(item.value)>Number(best.value)?item:best,null)
  // The full 0–100% axis can flatten 7D/30D filesystem changes into a single
  // unreadable line. Keep the axis explicitly labelled; never modify samples.
  const axisMin=values.length?Math.max(0,Math.floor((Math.min(...values)-5)/10)*10):0
  const axisMax=values.length?Math.min(100,Math.max(axisMin+10,Math.ceil((max+5)/10)*10)):100
  const ticks=[0,1,2,3,4].map(index=>axisMin+(axisMax-axisMin)*index/4)
  const chartX=at=>L+(at-minTs)/Math.max(1,maxTs-minTs)*(W-L-R)
  const chartY=percent=>T+(axisMax-Math.max(axisMin,Math.min(axisMax,percent)))/(axisMax-axisMin)*(H-T-B)
  const grouped=new Map()
  for(const point of records){
    const key=point.displayHost
    if(!grouped.has(key))grouped.set(key,[])
    grouped.get(key).push(point)
  }
  const newest=[...records].sort((a,b)=>Date.parse(b.collected_at)-Date.parse(a.collected_at))[0]
  const peakSource=peakRecord ? (peakRecord.displayHost||'APP1')+' · '+mount+' · '+formatWib(peakRecord.collected_at,true)+' WIB' : 'Not observed'
  const peakVsLatest=peakRecord&&newest?Number(peakRecord.value)-Number(newest.value):null
  const oldest=[...records].sort((a,b)=>Date.parse(a.collected_at)-Date.parse(b.collected_at))[0]
  // A selected root 'All APPs' plot contains independent hosts; subtracting
  // samples from different hosts would fabricate a growth figure.
  const delta=isRoot && hostChoice==='ALL' ? null :
    newest&&oldest&&newest.collected_at!==oldest.collected_at ? Number(newest.value)-Number(oldest.value) : null
  const splitGaps=points=>{
    const sorted=[...points].sort((a,b)=>Date.parse(a.collected_at)-Date.parse(b.collected_at))
    const intervals=sorted.slice(1).map((point,index)=>Date.parse(point.collected_at)-Date.parse(sorted[index].collected_at)).filter(ms=>ms>0)
    const sample=intervals.length?[...intervals].sort((a,b)=>a-b)[Math.floor(intervals.length/2)]:0
    const threshold=Math.min(Math.max(sample*2.6, 90*60_000), 3*3600_000)
    const segments=[]
    for(const point of sorted){
      const segment=segments[segments.length-1]
      if(!segment || Date.parse(point.collected_at)-Date.parse(segment[segment.length-1].collected_at)>threshold) segments.push([point])
      else segment.push(point)
    }
    return segments
  }
  return <div className="sphereFilesystemTrend" aria-label={'Filesystem usage history '+mount}>
    <div className="sphereFilesystemTrendTop">
      <span title={isRoot?'Root is measured independently on each APP':'APP1 is the selected representative; verify shared mount mapping separately'}>
        {mount} · {isRoot ? 'APP root' : 'APP1'} · hourly peak · Y {axisMin}–{axisMax}%
      </span>
      {isRoot && <select value={hostChoice} onChange={e=>setHostChoice(e.target.value)}
        aria-label="Root filesystem APP selection">
        {['ALL','APP1','APP2','APP3','APP4','APP5'].map(s=><option key={s} value={s}>{s==='ALL'?'All APPs':s}</option>)}
      </select>}
    </div>
    {state.loading && <p role="status">Loading filesystem history…</p>}
    {!state.loading && state.error && <p role="status" className="sphereFilesystemWarn">{state.error}</p>}
    {!state.loading && !records.length && !state.error && <p role="status">Not Collected · no observations in selected window.</p>}
    {!!records.length && <svg viewBox={'0 0 '+W+' '+H} role="img" aria-label={'Filesystem hourly peak usage over '+range+', axis '+axisMin+' to '+axisMax+' percent'}>
      {ticks.map(v=><g key={v}>
        <line x1={L} y1={chartY(v)} x2={W-R} y2={chartY(v)} stroke="currentColor" opacity=".16"/>
        <text x={L-5} y={chartY(v)+3} textAnchor="end" fontSize="10" fill="currentColor">{Number.isInteger(v)?v:v.toFixed(1)}%</text>
      </g>)}
      {[...grouped].map(([name,points],i)=>{
        points.sort((a,b)=>Date.parse(a.collected_at)-Date.parse(b.collected_at))
        const color=colors[i%colors.length]
        return <g key={name}>
          {splitGaps(points).map((segment,j)=>segment.length>1 && <polyline key={j}
            fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"
            points={segment.map(point=>chartX(Date.parse(point.collected_at))+','+chartY(Number(point.value))).join(' ')}/>)}
          {points.map((point,index)=><circle key={index} cx={chartX(Date.parse(point.collected_at))}
            cy={chartY(Number(point.value))} r="1.6" fill={color}>
            <title>{name} · {mount} · {Number(point.value).toFixed(1)}% · {formatWib(point.collected_at,true)} WIB</title>
          </circle>)}
        </g>
      })}
      <text x={L} y={H-5} fontSize="9" fill="currentColor">{formatWib(minTs,true)} WIB</text>
      <text x={W-R} y={H-5} textAnchor="end" fontSize="9" fill="currentColor">{formatWib(maxTs,true)} WIB</text>
    </svg>}
    {!!records.length && <div className="sphereFilesystemTrendFooter">
      <span title="Latest saved hourly-peak sample (not current filesystem utilization)">Latest Observed <strong>{Number(newest.value).toFixed(1)}%</strong></span>
      <span title={'Highest saved hourly peak · '+peakSource+(peakVsLatest===null?'':' · '+peakVsLatest.toFixed(1)+' pp above latest')}>Highest in Range <strong>{max.toFixed(1)}%</strong><small>{formatWib(peakRecord.collected_at,true)} WIB</small></span>
      <span title={delta===null ? 'Select a single APP with at least two different observation times' :
        'Net difference between first and last hourly-peak samples. Intermediate spikes remain visible as Window max.'}>
        {delta===null ? 'Observed change —' : 'Net Change '+(delta>=0?'+':'')+delta.toFixed(1)+' pp'}
      </span>
      <span title={'Latest saved sample '+(newest.displayHost||'APP1')+' '+mount}>Last Sample {formatWib(newest.collected_at,true)} WIB</span>
    </div>}
  </div>
}

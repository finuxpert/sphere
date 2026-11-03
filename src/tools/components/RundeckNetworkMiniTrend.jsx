import React from 'react'
import { formatWib, shortHost } from './sapUiFormat.js'
import { observedNumber, splitObservedPoints } from './rundeckResourceMiniCharts.js'

const API = import.meta.env.BASE_URL + 'api/infra'
const WIDTH=360, HEIGHT=108, LEFT=37, RIGHT=8, TOP=9, BOTTOM=24
async function read(url, signal) {
  const response=await fetch(url,{cache:'no-store',signal})
  if(!response.ok)throw new Error('Network history unavailable ('+response.status+')')
  return response.json()
}

/** Source-backed, single-host / single-interface RX-TX trend.
 * No NIC summing, zero-filling or cross-host synthetic throughput. */
export default function RundeckNetworkMiniTrend({refreshToken='',focusedHost=''}) {
  const [app,setApp]=React.useState('APP1')
  const [range,setRange]=React.useState('6h')
  const [interfaceChoice,setInterfaceChoice]=React.useState('')
  const [state,setState]=React.useState({scope:'',rows:[],error:'',loading:true})
  React.useEffect(()=>{
    const label=shortHost(focusedHost)
    if(/^APP[1-5]$/.test(label))setApp(label)
  },[focusedHost])
  const scope=app+':'+range
  React.useEffect(()=>{
    const controller=new AbortController()
    setState({scope,rows:[],error:'',loading:true})
    ;(async()=>{
      try {
        const inventory=await read(API+'/hosts',controller.signal)
        const host=(inventory.items||[]).find(item=>shortHost(item.host)===app)
        if(!host?.host)throw new Error('Network APP host not collected')
        const query=new URLSearchParams({metric:'network',range,host:host.host})
        const response=await read(API+'/trend?'+query,controller.signal)
        if(controller.signal.aborted)return
        const rows=(response.items||[]).filter(row=>
          String(row.host||'').toUpperCase()===String(host.host).toUpperCase() &&
          String(row.series_key||'').trim() &&
          Number.isFinite(Date.parse(row.collected_at||'')) &&
          (observedNumber(row.value)!==null || observedNumber(row.value2)!==null))
        setState({scope,host:host.host,rows,error:'',loading:false})
      } catch(error) {
        if(!controller.signal.aborted)
          setState({scope,rows:[],error:error?.message||'Network unavailable',loading:false})
      }
    })()
    return()=>controller.abort()
  },[scope,refreshToken,app,range])
  const ready=state.scope===scope&&!state.loading&&!state.error
  const interfaces=ready?[...new Set(state.rows.map(row=>String(row.series_key).trim()))].sort():[]
  const selectedInterface=interfaces.includes(interfaceChoice)?interfaceChoice:interfaces[0]||''
  const points=ready&&selectedInterface?state.rows
    .filter(row=>String(row.series_key).trim()===selectedInterface)
    .map(row=>({
      collected_at:row.collected_at,
      rx_mbps:observedNumber(row.value),
      tx_mbps:observedNumber(row.value2),
    }))
    .sort((a,b)=>Date.parse(a.collected_at)-Date.parse(b.collected_at)):[]
  const maxValue=Math.max(1,...points.flatMap(row=>[row.rx_mbps,row.tx_mbps].filter(value=>value!==null)))
  const newest=points.at(-1)
  const spanMs=range==='24h'?86400_000:6*3600_000
  const end=Date.now(),start=end-spanMs
  const x=at=>LEFT+Math.max(0,Math.min(1,(Date.parse(at)-start)/spanMs))*(WIDTH-LEFT-RIGHT)
  const y=v=>TOP+(1-Math.max(0,Math.min(1,v/maxValue)))*(HEIGHT-TOP-BOTTOM)
  const series=[
    {key:'rx_mbps',label:'RX',color:'#67a9e8'},
    {key:'tx_mbps',label:'TX',color:'#67c8a0'},
  ]
  return <div className="sphereNetworkMiniTrend" aria-label="Network RX TX throughput">
    <div className="sphereNetworkMiniHead">
      <strong title="Readings for one recorded APP network interface, Mbps; not summed across NICs">Network Throughput</strong>
      <div className="sphereNetworkMiniActions">
        <div role="group" aria-label="Network range">
          {['6h','24h'].map(value=><button key={value} type="button"
            aria-pressed={range===value} onClick={()=>setRange(value)}>{value.toUpperCase()}</button>)}
        </div>
        <select aria-label="Network APP host" value={app} onChange={event=>setApp(event.target.value)}>
          {['APP1','APP2','APP3','APP4','APP5'].map(value=><option key={value} value={value}>{value}</option>)}
        </select>
      </div>
    </div>
    <div className="sphereNetworkMiniMeta">
      <span>Interface · Mbps</span>
      {interfaces.length>0 && <select aria-label="Network interface" value={selectedInterface}
        onChange={event=>setInterfaceChoice(event.target.value)}>
        {interfaces.map(item=><option key={item} value={item}>{item}</option>)}
      </select>}
      <span className="sphereNetworkMiniLegend"><i className="rx"/>RX <i className="tx"/>TX</span>
    </div>
    {state.loading||state.scope!==scope ?
      <p className="sphereNetworkMiniEmpty" role="status">Checking network…</p> :
    state.error ?
      <p className="sphereNetworkMiniEmpty" role="status" title={state.error}>Network data unavailable</p> :
    !points.length ?
      <p className="sphereNetworkMiniEmpty" role="status">Not Collected · no network history</p> :
    <svg viewBox={'0 0 '+WIDTH+' '+HEIGHT} role="img"
      aria-label={app+' '+selectedInterface+' Network RX TX Mbps'}>
      {[0,.5,1].map(fraction=><g key={fraction}>
        <line x1={LEFT} x2={WIDTH-RIGHT} y1={y(maxValue*fraction)} y2={y(maxValue*fraction)}
          stroke="currentColor" opacity=".14"/>
        <text x={LEFT-5} y={y(maxValue*fraction)+3} fill="currentColor" textAnchor="end" fontSize="9">
          {(maxValue*fraction).toFixed(maxValue<10?1:0)}
        </text>
      </g>)}
      {series.map(item=><g key={item.key}>
        {splitObservedPoints(points,item.key,40*60_000).map((segment,index)=>
          segment.length>1&&<polyline key={index} fill="none" stroke={item.color}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            points={segment.map(row=>x(row.collected_at)+','+y(Number(row[item.key]))).join(' ')}/>)}
        {points.filter(row=>row[item.key]!==null).map((row,index)=>
          <circle key={index} r="1.5" cx={x(row.collected_at)} cy={y(row[item.key])} fill={item.color}>
            <title>{app+' · '+selectedInterface+' · '+item.label+' '+row[item.key].toFixed(2)+' Mbps · '+formatWib(row.collected_at,true)+' WIB'}</title>
          </circle>)}
      </g>)}
      <text x={LEFT} y={HEIGHT-4} fontSize="9" fill="currentColor">{formatWib(start,true)} WIB</text>
      <text x={WIDTH-RIGHT} y={HEIGHT-4} fontSize="9" textAnchor="end" fill="currentColor">{formatWib(end,true)} WIB</text>
    </svg>}
    {newest&&<small className="sphereNetworkMiniFooter" title={app+' · NIC '+selectedInterface+' · '+formatWib(newest.collected_at,true)+' WIB'}>
      {selectedInterface+' · Last '+formatWib(newest.collected_at,true)+' WIB'}
    </small>}
  </div>
}

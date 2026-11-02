import React from 'react'
import { formatWib, shortHost } from './sapUiFormat.js'
import { observedNumber, storageDevices, storageDevicePoints, splitObservedPoints } from './rundeckResourceMiniCharts.js'
import './RundeckDiskIoTrend.css'

const API = import.meta.env.BASE_URL + 'api/infra'
const W=500,H=180,L=43,R=12,T=12,B=28
async function load(url,signal){
  const result=await fetch(url,{cache:'no-store',signal})
  if(!result.ok)throw new Error('Device I/O history unavailable ('+result.status+')')
  return result.json()
}

export default function RundeckDiskIoTrend({refreshToken=''}) {
  const [app,setApp]=React.useState('APP1')
  const [range,setRange]=React.useState('6h')
  const [selectedDevice,setSelectedDevice]=React.useState('')
  const [data,setData]=React.useState({scope:'',rows:[],error:'',loading:true})
  const scope=app+':'+range
  React.useEffect(()=>{
    const controller=new AbortController()
    setData({scope,rows:[],error:'',loading:true})
    ;(async()=>{
      try{
        const list=await load(API+'/hosts',controller.signal)
        const host=(list.items||[]).find(item=>shortHost(item.host)===app)
        if(!host?.host)throw new Error('APP host collection unavailable')
        const q=new URLSearchParams({
          metric:'storage',range,host:host.host,resolution:'quarter_hour_peak',
        })
        const result=await load(API+'/trend?'+q,controller.signal)
        if(controller.signal.aborted)return
        // Scope strictly to the recorded host; never merge other APP devices.
        const rows=(result.items||[]).filter(item=>
          String(item.host||'').toUpperCase()===String(host.host).toUpperCase())
        setData({scope,host:host.host,rows,error:'',loading:false})
      }catch(error){
        if(!controller.signal.aborted)
          setData({scope,rows:[],error:error?.message||'Device I/O unavailable',loading:false})
      }
    })()
    return()=>controller.abort()
  },[scope,app,range,refreshToken])

  const ready=data.scope===scope&&!data.loading&&!data.error
  const devices=ready?storageDevices(data.rows):[]
  const device=devices.includes(selectedDevice)?selectedDevice:devices[0]||''
  const points=ready&&device?storageDevicePoints(data.rows,device,data.host):[]
  const maxValue=Math.max(1,...points.flatMap(item=>[observedNumber(item.read_mbps),observedNumber(item.write_mbps)]
    .filter(value=>value!==null)))
  const newest=points.at(-1)
  const spanMs=range==='24h'?86400_000:6*3600_000
  const maxTs=Date.now()
  const minTs=maxTs-spanMs
  const x=timestamp=>L+Math.max(0,Math.min(1,(Date.parse(timestamp)-minTs)/spanMs))*(W-L-R)
  const y=value=>T+(1-Math.max(0,Math.min(1,value/maxValue)))*(H-T-B)
  const series=[
    {key:'read_mbps',name:'Read',color:'#67a9e8'},
    {key:'write_mbps',name:'Write',color:'#67c8a0'},
  ]
  return <section className="sphereDiskIoTrend" aria-label="Disk I/O Read and Write history">
    <div className="sphereDiskIoHead">
      <strong title="Read/Write MB/s from a single recorded storage device, not filesystem growth">
        Disk I/O Activity
      </strong>
      <div className="sphereDiskIoActions">
        <div role="group" aria-label="Disk I/O range">
          {['6h','24h'].map(value=><button type="button" key={value}
            onClick={()=>setRange(value)} aria-pressed={range===value}>{value.toUpperCase()}</button>)}
        </div>
        <select value={app} onChange={event=>setApp(event.target.value)}
          aria-label="Disk I/O APP host">
          {['APP1','APP2','APP3','APP4','APP5'].map(value=><option value={value} key={value}>{value}</option>)}
        </select>
      </div>
    </div>
    <div className="sphereDiskIoMeta">
      <span title="Series identity from storage collector; may refer to a device or mapped mount">Device / mount · MB/s</span>
      {devices.length>0 && <select value={device}
        onChange={event=>setSelectedDevice(event.target.value)}
        aria-label="Disk I/O device">
        {devices.map(value=><option value={value} key={value}>{value}</option>)}
      </select>}
      <span className="sphereDiskIoLegend"><i className="is-read"/>Read <i className="is-write"/>Write</span>
    </div>
    {data.loading || data.scope!==scope ?
      <span className="sphereDiskIoEmpty" role="status">Checking device I/O…</span> :
    data.error ?
      <span className="sphereDiskIoEmpty" role="status" title={data.error}>I/O data unavailable</span> :
    !points.length ?
      <span className="sphereDiskIoEmpty" role="status">Not Collected · no device I/O history</span> :
    <svg viewBox={'0 0 '+W+' '+H} role="img" aria-label={app+' '+device+' disk Read and Write throughput MB/s'}>
      {[0,.5,1].map(fraction=><g key={fraction}>
        <line x1={L} x2={W-R} y1={y(maxValue*fraction)} y2={y(maxValue*fraction)}
          stroke="currentColor" opacity=".15"/>
        <text x={L-4} y={y(maxValue*fraction)+3} textAnchor="end" fill="currentColor" fontSize="8">
          {(maxValue*fraction).toFixed(maxValue<10?1:0)}
        </text>
      </g>)}
      {series.map(item=><g key={item.key}>
        {splitObservedPoints(points,item.key,40*60_000).map((segment,index)=>
          segment.length>1&&<polyline key={index} fill="none" stroke={item.color}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            points={segment.map(point=>x(point.collected_at)+','+y(Number(point[item.key]))).join(' ')}/>)}
        {points.filter(point=>observedNumber(point[item.key])!==null).map((point,index)=>
          <circle key={index} cx={x(point.collected_at)} cy={y(Number(point[item.key]))}
            r="1.5" fill={item.color}>
            <title>{app} · {device} · {item.name} {Number(point[item.key]).toFixed(2)} MB/s · {formatWib(point.collected_at,true)} WIB</title>
          </circle>)}
      </g>)}
      <text x={L} y={H-4} fontSize="8" fill="currentColor">{formatWib(minTs,true)} WIB</text>
      <text x={W-R} y={H-4} textAnchor="end" fontSize="8" fill="currentColor">{formatWib(maxTs,true)} WIB</text>
    </svg>}
    {newest && <small className="sphereDiskIoFooter" title={app+' · '+device+' · observation '+formatWib(newest.collected_at,true)+' WIB'}>
      {device} · Last {formatWib(newest.collected_at,true)} WIB
    </small>}
  </section>
}

import React from 'react'
import RundeckFleetMiniChart from './RundeckFleetMiniChart.jsx'
import { shortHost } from './sapUiFormat.js'
import { observedNumber } from './rundeckResourceMiniCharts.js'
const API=import.meta.env.BASE_URL+'api/infra/trend'
const APPS=new Set(['APP1','APP2','APP3','APP4','APP5'])
// Always compare the same recorded mount on all APPs; never substitute another device.
const MOUNT='/'
export default function RundeckDiskIoTrend({refreshToken='',focusedHost='',range='24h',onRange}) {
  const [data,setData]=React.useState({range:'',items:[],loading:true,error:''})
  React.useEffect(()=>{
    const controller=new AbortController()
    setData({range,items:[],loading:true,error:''})
    const query=new URLSearchParams({metric:'storage',range,resolution:'quarter_hour_peak'})
    fetch(API+'?'+query,{cache:'no-store',signal:controller.signal})
      .then(res=>{if(!res.ok)throw new Error('Disk I/O historical samples unavailable ('+res.status+')');return res.json()})
      .then(result=>{
        if(controller.signal.aborted)return
        if(result.metric!=='storage'||!Array.isArray(result.items))throw new Error('Disk I/O source not verified')
        const items=result.items.filter(row=>String(row.series_key||'')===MOUNT &&
          APPS.has(shortHost(row.host))).flatMap(row=>{
          const read=observedNumber(row.read_mbps)
          const write=observedNumber(row.write_mbps)
          // A missing channel is unknown, not zero: only paired readings are added.
          if(read===null||write===null||!Number.isFinite(Date.parse(row.collected_at||'')))return []
          return [{
            app:shortHost(row.host),collected_at:row.collected_at,
            observed_at:row.collected_at,value:read+write,
            description:'OS Root '+MOUNT+' · Read '+read.toFixed(2)+' + Write '+write.toFixed(2)+' MB/s',
          }]
        })
        setData({range,items,loading:false,error:''})
      })
      .catch(error=>{if(!controller.signal.aborted)setData({range,items:[],loading:false,error:error.message})})
    return()=>controller.abort()
  },[range,refreshToken])
  return <RundeckFleetMiniChart title="Disk I/O Activity" unit="MB/s" context="OS Root Read + Write"
    sourceLabel="OS Root '/' recorded read + write MB/s, same mount across APP1–APP5; incomplete channels remain unknown"
    range={range} onRange={onRange} focusedHost={shortHost(focusedHost)}
    rows={data.range===range?data.items:[]} loading={data.loading||data.range!==range} error={data.error}/>
}

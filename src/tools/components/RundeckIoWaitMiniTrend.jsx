import React from 'react'
import RundeckFleetMiniChart from './RundeckFleetMiniChart.jsx'
import { shortHost } from './sapUiFormat.js'
const API=import.meta.env.BASE_URL+'api/history/trend'
const APPS=new Set(['APP1','APP2','APP3','APP4','APP5'])
const observed=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))||Number(value)<0?null:Number(value)
export default function RundeckIoWaitMiniTrend({refreshToken='',focusedHost='',onFocusHost}) {
  const [range,setRange]=React.useState('6h')
  const [data,setData]=React.useState({range:'',items:[],loading:true,error:'',warning:null,critical:null})
  React.useEffect(()=>{
    const controller=new AbortController()
    setData({range,items:[],loading:true,error:'',warning:null,critical:null})
    const query=new URLSearchParams({metric:'iowait',range,bucket:'auto'})
    fetch(API+'?'+query,{cache:'no-store',signal:controller.signal})
      .then(res=>{if(!res.ok)throw new Error('SAP I/O Wait history unavailable ('+res.status+')');return res.json()})
      .then(result=>{
        if(controller.signal.aborted)return
        if(result.metric!=='iowait'||!Array.isArray(result.items))throw new Error('I/O Wait source not verified')
        const items=result.items.map(row=>({
          app:shortHost(row.host),collected_at:row.bucket,
          value:observed(row.max_value),observed_at:row.peak_at||row.bucket,
          description:'Highest observed I/O Wait in collection bucket',
        })).filter(row=>APPS.has(row.app)&&row.value!==null)
        setData({range,items,loading:false,error:'',warning:observed(result.warning),critical:observed(result.critical)})
      })
      .catch(error=>{if(!controller.signal.aborted)setData({range,items:[],loading:false,error:error.message,warning:null,critical:null})})
    return()=>controller.abort()
  },[refreshToken,range])
  return <RundeckFleetMiniChart title="I/O Wait Trend" unit="%" context="Host I/O Wait"
    sourceLabel="SAP host CPU I/O Wait from saved collection buckets; maximum observed percent for each APP"
    range={range} onRange={setRange} focusedHost={shortHost(focusedHost)} onFocusHost={onFocusHost}
    rows={data.range===range?data.items:[]} loading={data.loading||data.range!==range} error={data.error}
    thresholds={[
      {label:'Warning',value:data.warning,color:'#d7b368'},
      {label:'Critical',value:data.critical,color:'#dd7b85'},
    ]}/>
}

import React from 'react'
import { OPERATOR_THRESHOLDS } from './rundeckStatusSemantics.js'
import { metric, formatTime, formatAxisTime, hasNumericSample } from './rundeckInfrastructureFormatting.js'

export default function SparkChart({items=[],metricType,selectedSeries='',incidentStart='',range='6h'}){
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

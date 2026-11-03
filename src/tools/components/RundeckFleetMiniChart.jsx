import React from 'react'
import { formatWib } from './sapUiFormat.js'
import { splitObservedPoints } from './rundeckResourceMiniCharts.js'

const APPS=['APP1','APP2','APP3','APP4','APP5']
const COLORS={APP1:'#72a9e8',APP2:'#8cc985',APP3:'#aaa0df',APP4:'#e1a16c',APP5:'#5dcbd1'}
const WIDTH=360,HEIGHT=108,LEFT=37,RIGHT=8,TOP=9,BOTTOM=24

/** Comparisons use exactly one observed source metric per APP.
 * Rows: {app, collected_at, value, description, observed_at}.
 * No interpolation, estimated data, or cross-host rollups. */
export default function RundeckFleetMiniChart({
  title,unit='%',context='',range='6h',onRange,rows=[],error='',
  loading=false,focusedHost='',onFocusHost,sourceLabel='',thresholds=[],
}) {
  const spanMs=(range==='24h'?24:6)*3600_000
  const end=Date.now(),start=end-spanMs
  const points=rows.filter(row=>APPS.includes(row.app) &&
    Number.isFinite(Date.parse(row.collected_at)) &&
    Number.isFinite(Number(row.value)) &&
    Number(row.value)>=0 &&
    Date.parse(row.collected_at)>=start-10*60_000 &&
    Date.parse(row.collected_at)<=end+10*60_000)
  const highest=points.reduce((best,row)=>!best||Number(row.value)>Number(best.value)?row:best,null)
  const upper=Math.max(unit==='%'?5:0.5,
    Math.ceil(((highest?.value||0)*1.12)/ (unit==='%'?5:0.5))*(unit==='%'?5:0.5))
  const x=t=>LEFT+Math.max(0,Math.min(1,(Date.parse(t)-start)/spanMs))*(WIDTH-LEFT-RIGHT)
  const y=v=>TOP+(1-Math.max(0,Math.min(1,Number(v)/upper)))*(HEIGHT-TOP-BOTTOM)
  const active=/^APP[1-5]$/.test(focusedHost)?focusedHost:''
  const gaps=range==='24h'?75*60_000:45*60_000
  const fmt=value=>Number(value).toFixed(unit==='%'?1:2)
  const viewEnd=formatWib(end,true)
  const viewStart=formatWib(start,true)
  const any=points.length>0
  return <div className="sphereFleetMiniTrend" aria-label={title+' APP1 to APP5'}>
    <div className="sphereFleetMiniHead">
      <strong title={sourceLabel}>{title}</strong>
      <div className="sphereFleetMiniActions" role="group" aria-label={title+' time range'}>
        {['6h','24h'].map(item=><button type="button" key={item} aria-pressed={range===item}
          onClick={()=>onRange?.(item)}>{item.toUpperCase()}</button>)}
      </div>
    </div>
    <div className="sphereFleetMiniLegend" role="group" aria-label={title+' APP selection'}>
      {APPS.map(app=><button type="button" key={app}
        className={'sphereFleetMiniHost'+(active===app?' is-focused':'')}
        aria-pressed={active===app} title={app+' · highlight this APP in all Monitoring charts'}
        onClick={()=>onFocusHost?.(app)}>
        <i style={{background:COLORS[app]}}/>{app}
      </button>)}
    </div>
    <div className="sphereFleetMiniMeta">{context} · {unit}</div>
    {loading ? <p className="sphereFleetMiniEmpty" role="status">Checking observations…</p> :
      error ? <p className="sphereFleetMiniEmpty" role="status" title={error}>Data unavailable</p> :
      !any ? <p className="sphereFleetMiniEmpty" role="status">Not Collected · no recorded data</p> :
      <svg viewBox={'0 0 '+WIDTH+' '+HEIGHT} role="img" aria-label={title+' actual observations for APP1 to APP5'}>
        {[0,.5,1].map(fraction=><g key={fraction}>
          <line x1={LEFT} y1={y(upper*fraction)} x2={WIDTH-RIGHT} y2={y(upper*fraction)}
            stroke="currentColor" opacity=".14"/>
          <text x={LEFT-5} y={y(upper*fraction)+3} fill="currentColor" textAnchor="end" fontSize="9">
            {fmt(upper*fraction)}
          </text>
        </g>)}
        {thresholds.filter(row=>Number(row.value)>0 && Number(row.value)<=upper).map(row=>
          <line key={row.label} x1={LEFT} x2={WIDTH-RIGHT}
            y1={y(row.value)} y2={y(row.value)} stroke={row.color||'#d7a45c'}
            strokeDasharray="3,3" opacity=".35"><title>{row.label+' '+row.value+unit}</title></line>)}
        {APPS.map(app=>{
          const series=points.filter(row=>row.app===app).sort((a,b)=>Date.parse(a.collected_at)-Date.parse(b.collected_at))
          const focused=active===app
          return <g key={app} opacity={active&&!focused?.28:1}>
            {splitObservedPoints(series,'value',gaps).map((segment,index)=>
              segment.length>1&&<polyline key={index} fill="none" stroke={COLORS[app]}
                strokeWidth={focused?2.5:1.45} strokeLinecap="round" strokeLinejoin="round"
                points={segment.map(row=>x(row.collected_at)+','+y(row.value)).join(' ')}/>)}
            {series.map((row,index)=><circle key={index} r={focused?1.9:1.15}
              cx={x(row.collected_at)} cy={y(row.value)} fill={COLORS[app]}>
              <title>{app+' · '+fmt(row.value)+' '+unit+' · '+(row.description||context)+' · '+formatWib(row.observed_at||row.collected_at,true)+' WIB'}</title>
            </circle>)}
          </g>
        })}
        <text x={LEFT} y={HEIGHT-4} fill="currentColor" fontSize="9">{viewStart} WIB</text>
        <text x={WIDTH-RIGHT} y={HEIGHT-4} textAnchor="end" fill="currentColor" fontSize="9">{viewEnd} WIB</text>
      </svg>}
    <small className="sphereFleetMiniFooter" title={highest
      ? highest.app+' · '+fmt(highest.value)+unit+' · '+formatWib(highest.observed_at||highest.collected_at,true)+' WIB · '+(highest.description||'Recorded sample')
      : 'No saved source sample'}>
      {highest ? 'Peak '+fmt(highest.value)+unit+' · '+highest.app+' · '+formatWib(highest.observed_at||highest.collected_at,true)+' WIB' : 'No verified peak'}
    </small>
  </div>
}

import React from 'react'
import { monthlyReportPeriod } from './rundeckMonthlyPeriod.js'
import { hostLabel, when, pct } from './rundeckMonthlyEvidence.js'

const CHART_COLORS = ['#3dd6dc', '#839af4', '#af90e7', '#e7a364', '#7ac59c']

export default function TimeHostTrend({rows=[],bucketMinutes,month,weekStart=null,customStart=null,customEnd=null,metric,threshold=null}) {
  const window=monthlyReportPeriod(month,{weekStart,customStart,customEnd})
  const from=Date.parse(window.startUtc), to=Date.parse(window.exclusiveEndUtc)
  const intervalMs=Number(bucketMinutes)*60000
  const validWindow=Number.isFinite(from)&&Number.isFinite(to)&&to>from&&intervalMs>0
  const hours=validWindow?(to-from)/3600000:0
  const tickHours=hours<=24?6:hours<=48?12:hours<=168?24:hours<=336?72:168
  const width=620,left=36,plotW=566,top=12,plotH=124
  const xFor=at=>left+(at-from)*plotW/(to-from)
  const yFor=value=>top+plotH*(1-Math.max(0,Math.min(100,Number(value)))/100)
  const names=['APP1','APP2','APP3','APP4','APP5']
  const field='peak_'+metric+'_pct'
  const warningField=metric+'_warning_checks'
  const plotted=names.map(name=>rows.filter(row=>hostLabel(row.host)===name&&
    row[field]!==null&&row[field]!==undefined&&Number.isFinite(Number(row[field])))
    .map(row=>({at:Date.parse(row.bucket_start),value:Number(row[field]),
      peakAt:row['peak_'+metric+'_at'],warningChecks:Number(row[warningField]||0)}))
    .filter(point=>Number.isFinite(point.at)&&point.at>=from&&point.at<to)
    .sort((a,b)=>a.at-b.at))
  const ticks=[]
  if(validWindow)for(let at=from;at<to;at+=tickHours*3600000)ticks.push(at)
  // Weekly/monthly axis uses compact WIB dates, matching the saved 16:9 PDF.
  // Keep precise intraday timestamps in individual sample tooltips.
  const axisLabel=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',
    day:'2-digit',month:'short',...(hours<=48?{hour:'2-digit',minute:'2-digit',hour12:false}:{})})
  const tooltipLabel=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',
    day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false})
  const hasPoints=plotted.some(points=>points.length>0)
  const showThreshold=threshold!=null&&Number.isFinite(Number(threshold))
  return <div className="sphereMonthlyTrend" role="group" aria-label={metric.toUpperCase()+' time-of-day APP peak trend'}>
    <svg viewBox={'0 0 '+width+' 164'} preserveAspectRatio="xMidYMid meet" role="img"
      aria-label={'Saved time-bucket APP '+metric.toUpperCase()+' peaks in WIB; missing buckets are not zero'}>
      {[0,25,50,75,100].map(level=><g key={level}>
        <line x1={left} x2={left+plotW} y1={yFor(level)} y2={yFor(level)}
          stroke="currentColor" strokeOpacity=".11" strokeDasharray="3 4"/>
        <text x="5" y={yFor(level)+3} fontSize="9" fill="currentColor" opacity=".6">{level}%</text>
      </g>)}
      {ticks.map(at=><text key={at} x={xFor(at)} y="155" fontSize="9" fontWeight="600"
        fill="currentColor" opacity=".92" textAnchor={at===from?'start':'middle'}>
        {axisLabel.format(new Date(at))}
      </text>)}
      {showThreshold&&<g>
        <line x1={left} x2={left+plotW} y1={yFor(threshold)} y2={yFor(threshold)}
          stroke="#e2b56a" strokeWidth="1.5" strokeDasharray="6 4"/>
        <rect x={left+plotW-115} y={yFor(threshold)-15} width="114" height="13" rx="2" fill="#253642"/>
        <text x={left+plotW-4} y={yFor(threshold)-5} fontSize="10" fill="#ffd39a" textAnchor="end">
          Warning {pct(threshold)}
        </text>
      </g>}
      {plotted.map((points,i)=><g key={names[i]}>
        {points.map((point,k)=><g key={point.at}>
          {k>0 && point.at-points[k-1].at<=intervalMs*1.05 && point.at>points[k-1].at &&
            <line x1={xFor(points[k-1].at)} y1={yFor(points[k-1].value)}
              x2={xFor(point.at)} y2={yFor(point.value)}
              stroke={CHART_COLORS[i]} strokeWidth="2.5" strokeLinecap="round"/>}
          {point.warningChecks>0&&<circle cx={xFor(point.at)} cy={yFor(point.value)}
            r="5.5" fill="none" stroke="#e6ad67" strokeWidth="1.3"/>}
          <circle cx={xFor(point.at)} cy={yFor(point.value)} r="2.9" fill={CHART_COLORS[i]}>
            <title>{names[i]} · {tooltipLabel.format(new Date(point.at))} WIB · peak {pct(point.value)} {metric.toUpperCase()} · {point.warningChecks} warning host-checks{point.peakAt?' · Actual peak '+when(point.peakAt):''}</title>
          </circle>
        </g>)}
      </g>)}
      {!hasPoints&&<text x={left+plotW/2} y={top+plotH/2} textAnchor="middle" fontSize="11" fill="currentColor">No retained readings</text>}
    </svg>
    <div className="sphereMonthlyTrendLegend">
      {names.map((name,i)=><span key={name}><i style={{background:CHART_COLORS[i]}}/>{name}</span>)}
    </div>
    <small>{bucketMinutes>=1440?'Daily':bucketMinutes>=60?bucketMinutes/60+'-hour':bucketMinutes+'-minute'} APP peaks (WIB). Gaps indicate buckets without samples, not zero utilization.</small>
  </div>
}

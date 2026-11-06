// Calendar-window SAP service-check evidence; independent of performance SQL snapshots.
// Check success ratio is never represented as duration-based uptime.
import { monthlyReportPeriod } from './rundeckMonthlyPeriod.js'

export const REPORT_APPS = Object.freeze(['APP1','APP2','APP3','APP4','APP5'])
export const AVAILABILITY_SOURCE = 'Rundeck Service Availability / SPHERE retained execution history'

const stamp = value => {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : null
}
const iso = date => new Date(date).toISOString()
const isApp = value => REPORT_APPS.includes(value)

export function reportAvailabilityWindow(month, options={}, now=new Date()) {
  const period=monthlyReportPeriod(month,options)
  const start=stamp(period.startUtc), fullEnd=stamp(period.exclusiveEndUtc)
  const nowMs=now.getTime()
  if(start===null || fullEnd===null || !Number.isFinite(nowMs))throw Error('Invalid availability window')
  // Current calendar periods are partial: never request or evaluate future checks.
  const end=Math.min(fullEnd,nowMs)
  if(end<=start)throw Error('No elapsed availability reporting window')
  const params=new URLSearchParams({
    range:'custom',category:'SAP_APP',from_at:iso(start),to_at:iso(end),
  })
  return {startUtc:iso(start),endUtc:iso(end),periodEndUtc:iso(fullEnd),
    partial:end<fullEnd,params}
}

export function unavailableReportAvailability(window,reason='Availability evidence endpoint unavailable') {
  return {
    source:AVAILABILITY_SOURCE,sourceStatus:'ERROR',
    startUtc:window.startUtc,endUtc:window.endUtc,partial:window.partial,
    rows:REPORT_APPS.map(name=>({name,status:'UNKNOWN',up:0,down:0,checks:0,
      checkRatePct:null,lastAt:null})),
    totalChecks:0,firstAt:null,lastAt:null,
    gapCount:0,expectedCadenceSeconds:null,coverageLimited:true,
    reason:String(reason).slice(0,180),
    note:'Source unavailable; SAP availability cannot be verified.',
  }
}

export function summarizeReportAvailability(payload,window) {
  if(!payload || payload.range!=='custom' || payload.category!=='SAP_APP' ||
      payload.observation_semantics!=='OBSERVED_AVAILABILITY' ||
      stamp(payload.range_started_at)!==stamp(window.startUtc) ||
      stamp(payload.window_end)!==stamp(window.endUtc) ||
      !Array.isArray(payload.items)) {
    throw Error('Availability response does not match report period or evidence contract')
  }
  const start=stamp(window.startUtc),end=stamp(window.endUtc)
  const cadence=Number(payload.expected_cadence_seconds)
  const gap=Number(payload.gap_threshold_seconds)
  const expectedCadenceSeconds=Number.isFinite(cadence)&&cadence>=60?cadence:null
  // Do not trust sparse historical data to establish a multi-day 'healthy' cadence.
  const threshold=Number.isFinite(gap)&&gap>=60?Math.min(gap,3600)*1000:null
  const groups=new Map(REPORT_APPS.map(name=>[name,[]]))
  const seen=new Set()
  for(const item of payload.items){
    const name=String(item.host||'').toUpperCase()
    const checkedAt=stamp(item.bucket)
    const status=String(item.status||'').toUpperCase()
    if(!isApp(name)||checkedAt===null||checkedAt<start||checkedAt>=end||
       !['UP','DOWN'].includes(status))continue
    const key=String(item.execution_id||item.bucket)+'|'+name
    if(seen.has(key))continue
    seen.add(key)
    groups.get(name).push({checkedAt,status})
  }
  let totalChecks=0
  const allDates=[]
  const rows=REPORT_APPS.map(name=>{
    const checks=groups.get(name).sort((a,b)=>a.checkedAt-b.checkedAt)
    const up=checks.filter(row=>row.status==='UP').length
    const down=checks.length-up
    const last=checks.at(-1)
    const status=!last?'UNKNOWN':threshold===null||end-last.checkedAt>threshold
      ?'STALE':last.status==='UP'?'AVAILABLE':'UNAVAILABLE'
    totalChecks+=checks.length
    allDates.push(...checks.map(check=>check.checkedAt))
    return {name,status,up,down,checks:checks.length,
      checkRatePct:checks.length?Math.round(up/checks.length*10000)/100:null,
      lastAt:last?iso(last.checkedAt):null}
  })
  const gapCount=Array.isArray(payload.observation_gaps)
    ?payload.observation_gaps.filter(item=>item.kind==='NO_OBSERVATION').length:0
  const firstAtMs=allDates.length?Math.min(...allDates):null
  const lastAtMs=allDates.length?Math.max(...allDates):null
  const leadingGapSeconds=firstAtMs===null?null:Math.round((firstAtMs-start)/1000)
  const trailingGapSeconds=lastAtMs===null?null:Math.round((end-lastAtMs)/1000)
  // Re-check boundaries in the browser too: an older backend could omit
  // trailing-coverage warnings, but no report may quietly imply full coverage.
  const limited=Boolean(payload.coverage_limited)||!allDates.length||
    threshold===null||[leadingGapSeconds,trailingGapSeconds].some(
      seconds=>seconds!==null&&seconds*1000>threshold)
  return {
    source:AVAILABILITY_SOURCE,sourceStatus:'OK',
    startUtc:window.startUtc,endUtc:window.endUtc,partial:window.partial,
    rows,totalChecks,firstAt:firstAtMs===null?null:iso(firstAtMs),
    lastAt:lastAtMs===null?null:iso(lastAtMs),
    gapCount,expectedCadenceSeconds,coverageLimited:limited,
    leadingGapSeconds,trailingGapSeconds,
    reason:null,
    note:'Historical port-check observations. UP check rate is not duration uptime. Missing checks never mean SAP DOWN.',
  }
}

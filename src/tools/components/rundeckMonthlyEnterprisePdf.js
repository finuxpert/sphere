/* SPHERE monthly enterprise PDF. 16:9 slide or A3 print, backed by saved evidence.
 * Workload checks are not SM37 executions. WP CPU is core-equivalent, not host CPU.
 * Missing dates are gaps; absent values are never replaced with simulated data.
 */
import { wpCpuCoreEquivalent } from './monthlyCpuMetrics.js'
import { monthlyReportPeriod, reportPeakEvidenceWib } from './rundeckMonthlyPeriod.js'

const COLOR = {
  navy: [16,42,67], ink: [28,51,71], muted: [98,118,137],
  blue: [21,90,155], bluefill: [219,234,248], light: [246,249,252],
  rule: [220,229,236], red: [194,59,56], amber: [185,109,22],
  green: [23,109,87], violet: [126,91,170], slate: [115,137,158],
  teal: [34,149,144], white: [255,255,255], header: [238,244,248],
  // APP colors mirror the React monitoring trend on both light and dark UIs.
  app1: [38,165,175], app2: [85,112,211], app3: [155,115,203],
  app4: [207,126,64], app5: [83,157,113],
}
const value = input => input === null || input === undefined || input === ''
  ? null : Number.isFinite(Number(input)) ? Number(input) : null
const number = (input, digits=1) => {
  const n=value(input)
  return n===null ? 'N/A' : n.toLocaleString('en-US',{maximumFractionDigits:digits})
}
const pct = input => value(input)===null ? 'N/A' : number(input)+'%'
const app = input => {
  const raw=String(input||'').toUpperCase().split('.')[0]
  const match=raw.match(/(?:AOPH([1-5])PAPPDC|^APP([1-5])$)/)
  return match ? 'APP'+(match[1]||match[2]) : raw||'N/A'
}
const monthName = month => {
  const [year,mon]=String(month).split('-').map(Number)
  if(!year || !mon || mon<1 || mon>12) throw Error('Invalid monthly reporting period')
  return new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'})
    .format(new Date(Date.UTC(year,mon-1,1)))
}
const wib = (input, includeYear=false) => {
  if(!input)return 'N/A'
  const d=new Date(input)
  if(Number.isNaN(d.getTime()))return 'N/A'
  return new Intl.DateTimeFormat('en-GB',{
    timeZone:'Asia/Jakarta',day:'2-digit',month:'short',
    ...(includeYear?{year:'numeric'}:{}),hour:'2-digit',minute:'2-digit',hour12:false,
  }).format(d)
}
const candidateAction = row => row.signals?.high_memory ? 'Review memory use'
  : row.signals?.sustained_high_cpu || row.signals?.cpu_spike ? 'Review processing'
    : row.signals?.baseline_anomaly ? 'Check workload change' : 'Review in SAP'

export function monthlyEnterpriseReportModel(month,data) {
  if(!data?.monthly_pressure || !data?.quality || !data?.monthly_errors) {
    throw Error('Saved monthly pressure, coverage and error evidence is required')
  }
  monthName(month)
  if(data.month && data.month!==month)throw Error('Monthly evidence does not match selected month')
  const weekStart=data?.week_start||null
  const customStart=data?.start_date||null
  const customEnd=data?.end_date||null
  if(customStart||customEnd){
    const validDate=date=>/^20\d{2}-\d{2}-\d{2}$/.test(String(date||'')) &&
      !Number.isNaN(Date.parse(date+'T00:00:00Z')) &&
      new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date
    const duration=validDate(customStart)&&validDate(customEnd)
      ? Math.round((Date.parse(customEnd+'T00:00:00Z')-Date.parse(customStart+'T00:00:00Z'))/86400000)+1 : 0
    if(data.period!=='custom'||weekStart||!customStart?.startsWith(month+'-')||
       duration<1||duration>31)throw Error('Invalid custom reporting period')
  }
  if(weekStart){
    const start=new Date(weekStart+'T00:00:00Z')
    if(Number.isNaN(start.getTime()) || start.getUTCDay()!==1 ||
        start.toISOString().slice(0,10)!==weekStart || !weekStart.startsWith(month+'-') ||
        data.period!=='week'){
      throw Error('Invalid weekly reporting period')
    }
  }
  const period=monthlyReportPeriod(month,{weekStart,customStart,customEnd})
  const pressure=data.monthly_pressure
  const quality=data.quality
  const summary=data.summary||{}
  if(data.monthly_storage?.month!==month || !Array.isArray(data.monthly_storage?.items) ||
      (weekStart ? data.monthly_storage?.week_start!==weekStart :
        Boolean(data.monthly_storage?.week_start)) ||
      (customStart ? data.monthly_storage?.start_date!==customStart ||
        data.monthly_storage?.end_date!==customEnd :
        Boolean(data.monthly_storage?.start_date||data.monthly_storage?.end_date))) {
    throw Error('Period-scoped infrastructure storage evidence is required')
  }
  if(!Array.isArray(data.monthly_top_wp_cpu) || !Array.isArray(data.monthly_top_wp_pss)){
    throw Error('Full-population WP rankings are required for monthly export')
  }
  const raw=Array.isArray(data.monthly_abap_candidates)?data.monthly_abap_candidates:[]
  const seen=new Set()
  const candidates=raw.filter(row=>{
    const name=String(row?.consumer_key||'').trim()
    const key=String(row?.consumer_type||'PROGRAM')+':'+name
    if(!name||seen.has(key))return false
    seen.add(key)
    return true
  }).slice(0,5)
  const hosts=Array.from({length:5},(_,i)=>{
    const name='APP'+(i+1)
    const row=(pressure.hosts||[]).find(v=>app(v.host)===name)
    return {...(row||{}),host:name}
  })
  const windowStart=customStart||weekStart
  const [year,mon]=month.split('-').map(Number)
  const days=customStart
    ? Math.round((Date.parse(customEnd+'T00:00:00Z')-Date.parse(customStart+'T00:00:00Z'))/86400000)+1
    :weekStart?7:new Date(Date.UTC(year,mon,0)).getUTCDate()
  const dates=Array.from({length:days},(_,i)=>windowStart
    ? new Date(Date.parse(windowStart+'T00:00:00Z')+i*86400000).toISOString().slice(0,10)
    : month+'-'+String(i+1).padStart(2,'0'))
  const allowedDates=new Set(dates)
  // Retain one point per APP and calendar day; absent dates remain null.
  // CPU/RAM line series must never join peaks from different hosts.
  const dailySource=new Map()
  for(const row of pressure.daily_hosts||[]) {
    const date=String(row.day||'').slice(0,10)
    const host=app(row.host)
    if(!/^APP[1-5]$/.test(host) || !allowedDates.has(date))continue
    const byHost=dailySource.get(date)||{}
    byHost[host]=row
    dailySource.set(date,byHost)
  }
  const series=hosts.map(row=>({
    host:row.host,
    days:Array.from({length:days},(_,i)=>{
      const date=dates[i]
      const sample=dailySource.get(date)?.[row.host]
      return {
        day:i+1,host:row.host,
        cpu:value(sample?.peak_cpu_pct),ram:value(sample?.peak_ram_pct),
        cpuAt:sample?.peak_cpu_at||null,ramAt:sample?.peak_ram_at||null,
      }
    }),
  }))
  const daily=Array.from({length:days},(_,index)=>{
    const date=dates[index]
    const rows=dailySource.get(date)||{}
    const peak=metric=>{
      const field='peak_'+metric+'_pct'
      const timed='peak_'+metric+'_at'
      const observed=Object.entries(rows).map(([host,row])=>({
        host,value:value(row[field]),at:row[timed]||null,
      })).filter(item=>item.value!==null)
        .sort((a,b)=>b.value-a.value)
      return observed[0]||null
    }
    return {day:index+1,cpu:peak('cpu'),ram:peak('ram')}
  })
  const maximum=metric=>daily.map(row=>row[metric]).filter(Boolean)
    .sort((a,b)=>b.value-a.value)[0]||null
  const ranking=(rows,metric)=>rows.filter(row=>String(row?.consumer_key||'').trim() && value(row?.[metric])!==null)
    .sort((a,b)=>value(b[metric])-value(a[metric]) ||
      String(a.consumer_key).localeCompare(String(b.consumer_key))).slice(0,5)
  const observedDays=dates.filter(date=>dailySource.has(date)).length
  // Timestamped buckets are independent of the daily evidence retained for
  // summary statistics. An older backend can still export daily charts.
  const timeIntervalMs=Number(pressure.trend_bucket_minutes)*60000
  const timeStart=Date.parse(period.startUtc),timeEnd=Date.parse(period.exclusiveEndUtc)
  const timeSeries=Array.isArray(pressure.trend_hosts)&&timeIntervalMs>0&&timeEnd>timeStart
    ? hosts.map(row=>({
      host:row.host,
      points:pressure.trend_hosts.filter(item=>app(item.host)===row.host)
        .map(item=>({
          at:Date.parse(item.bucket_start),cpu:value(item.peak_cpu_pct),ram:value(item.peak_ram_pct),
          cpuAt:item.peak_cpu_at||null,ramAt:item.peak_ram_at||null,
        }))
        .filter(item=>Number.isFinite(item.at)&&item.at>=timeStart&&item.at<timeEnd)
        .sort((a,b)=>a.at-b.at),
    }))
    : null
  return {
    month,weekStart,customStart,customEnd,period,dates,quality,summary,pressure,candidates,hosts,daily,days,series,
    timeSeries,timeStart,timeEnd,timeIntervalMs,
    observedDays,storage:data.monthly_storage.items,snapshot:data.snapshot||null,
    cpuPeak:maximum('cpu'),ramPeak:maximum('ram'),
    sortedCpu:ranking(data.monthly_top_wp_cpu,'peak_cpu_pct'),
    sortedPss:ranking(data.monthly_top_wp_pss,'peak_pss_gb'),
  }
}

export function enterpriseTrendTicks(start, end) {
  const hours = (end - start) / 3600000
  if (!Number.isFinite(hours) || hours <= 0) return []
  // Keep sub-two-day time detail, but use compact dates for week/month charts.
  const stepHours = hours <= 24 ? 6 : hours <= 48 ? 12 : hours <= 168 ? 24 : hours <= 336 ? 72 : 168
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short',
    ...(hours <= 48 ? {hour: '2-digit', minute: '2-digit', hour12: false} : {}),
  })
  const ticks = []
  for (let at = start; at < end; at += stepHours * 3600000) {
    ticks.push({at, label: formatter.format(new Date(at))})
  }
  return ticks
}

export async function buildManagementMonthlyPdf({month,data,returnInstance=false,format=null}) {
  const outputFormat=format||'16:9'
  if(!['16:9','a3'].includes(outputFormat))throw Error('Unsupported management PDF format')
  const m=monthlyEnterpriseReportModel(month,data)
  const {jsPDF}=await import('jspdf')
  const pdf=new jsPDF({orientation:'landscape',unit:'pt',
    format:outputFormat==='16:9'?[960,540]:'a3',compress:true})
  const W=pdf.internal.pageSize.getWidth(),H=pdf.internal.pageSize.getHeight()
  const isSlide=outputFormat==='16:9'
  const M=isSlide?20:32,CW=W-2*M
  const rgb=key=>COLOR[key]
  function font(weight='normal',size=8) {
    pdf.setFont('helvetica',weight);pdf.setFontSize(size)
  }
  function text(x,y,input,size=8,weight='normal',color='ink',align='left',maxW=null) {
    let s=String(input??'N/A')
    font(weight,size)
    if(maxW){
      while(s.length>1 && pdf.getTextWidth(s)>maxW)s=s.slice(0,-2)+'…'
    }
    pdf.setTextColor(...rgb(color))
    pdf.text(s,x,H-y,{align})
  }
  function line(x1,y1,x2,y2,color='rule',width=.65) {
    pdf.setDrawColor(...rgb(color));pdf.setLineWidth(width)
    pdf.line(x1,H-y1,x2,H-y2)
  }
  function rect(x,y,w,h,fill='white',radius=0,stroke='rule') {
    pdf.setFillColor(...rgb(fill));pdf.setDrawColor(...rgb(stroke));pdf.setLineWidth(.55)
    if(radius)pdf.roundedRect(x,H-y-h,w,h,radius,radius,'FD')
    else pdf.rect(x,H-y-h,w,h,'FD')
  }
  function fillRect(x,y,w,h,fill='header',radius=0) {
    pdf.setFillColor(...rgb(fill))
    if(radius)pdf.roundedRect(x,H-y-h,w,h,radius,radius,'F')
    else pdf.rect(x,H-y-h,w,h,'F')
  }
  function section(x,y,title) {text(x,y,title,isSlide?10.1:12,'bold','navy')}
  function fitText(x,y,s,width,align='left',base=8.0,color='ink',weight='normal') {
    const label=String(s??'N/A')
    let sz=base
    font(weight,sz)
    while(pdf.getTextWidth(label)>width-9 && sz>5.5){sz-=.2;font(weight,sz)}
    if(pdf.getTextWidth(label)<=width-9) {
      text(x,y,label,sz,weight,color,align)
      return
    }
    // SAP names are often unbroken ABAP identifiers (including underscores).
    // jsPDF splitTextToSize can exceed the cell on those tokens; wrap by the
    // actual rendered glyph width so no line enters an adjacent column.
    const lineWidth=Math.max(10,width-17)
    const wrap=(size)=>{
      font(weight,size)
      const parts=[]
      let current=''
      for(const glyph of label) {
        if(current && pdf.getTextWidth(current+glyph)>lineWidth) {
          parts.push(current)
          current=glyph
        } else current+=glyph
      }
      if(current)parts.push(current)
      return parts
    }
    for(let size=6.2;size>=5.4;size-=.2) {
      const parts=wrap(size)
      if(parts.length<=2) {
        parts.forEach((part,i)=>text(x,y+(parts.length===2?3:0)-i*7,part,size,weight,color,align))
        return
      }
    }
    throw Error('Program name exceeds two-line report cell: '+label)
  }
  // Preserve the original logo's native aspect ratio; the previous fixed
  // 106x30 pt box squeezed a wide 1255x266 image horizontally.
  if(typeof document!=='undefined' && typeof window!=='undefined'){
    const base=import.meta.env?.BASE_URL||'/'
    const brandUrl=new URL(base+'branding/logo/sphere-logo-horizontal-light.png',window.location.origin)
    const brand=await fetch(brandUrl,{cache:'force-cache'})
    if(!brand.ok)throw Error('Original SPHERE logo is unavailable (HTTP '+brand.status+')')
    const logoBytes=new Uint8Array(await brand.arrayBuffer())
    const dimensions=pdf.getImageProperties(logoBytes)
    const scale=Math.min((isSlide?115:138)/dimensions.width,(isSlide?25:32)/dimensions.height)
    pdf.addImage(logoBytes,'PNG',M,isSlide?9:14,dimensions.width*scale,dimensions.height*scale)
  }
  const reportTitle=m.customStart?'SAP Custom Performance Report':
    m.weekStart?'SAP Weekly Performance Report':'SAP Monthly Performance Report'
  const readableDate=date=>new Intl.DateTimeFormat('en-GB',{
    timeZone:'UTC',day:'2-digit',month:'short',year:'numeric',
  }).format(new Date(date+'T00:00:00Z'))
  const periodLabel=m.customStart||m.weekStart
    ? 'Period: '+readableDate(m.dates[0])+' - '+readableDate(m.dates[m.dates.length-1])+' (WIB)'
    : m.period.label
  // Period bounds are calendar dates in Asia/Jakarta (exclusive UTC end in the model).
  text(M+(isSlide?129:158),H-(isSlide?22:28),reportTitle,isSlide?14:16,'bold','navy')
  text(M+(isSlide?129:158),H-(isSlide?40:46),periodLabel,isSlide?9.1:9.4,'normal','muted')
  // Report preparation time and snapshot provenance are separate facts.
  // Do not label a plain API/fixture response FRESH without snapshot evidence.
  const snapshotLabel=m.snapshot?.generated_at
    ?'Snapshot: '+String(m.snapshot.status||'UNKNOWN')+' · '+wib(m.snapshot.generated_at,true)+' WIB'
    :'Evidence: retained reporting-period records'
  text(W-M,H-(isSlide?22:28),snapshotLabel,isSlide?7.1:8.0,'normal','muted','right',isSlide?310:400)
  text(W-M,H-(isSlide?40:46),'Prepared: '+wib(new Date().toISOString(),true)+' WIB',
    isSlide?7.1:8.0,'normal','muted','right')
  // Five stable APP-specific series; missing days cause real gaps in each line.
  // Peak values and timestamps are in the header, never floating above the plot.
  // 16:9 panel bands (PDF bottom-up): storage [8,112], APP/tuning [120,264],
  // rankings [272,358], trends [366,490]. Each adjacent gap is 8 pt.
  const panelY=isSlide?366:H-247,panelH=isSlide?124:180,gap=isSlide?10:12,panelW=(CW-gap)/2
  const seriesColors=['app1','app2','app3','app4','app5']
  function trend(x,title,metric,threshold) {
    rect(x,panelY,panelW,panelH,'white',7)
    section(x+(isSlide?11:16),panelY+panelH-(isSlide?18:23),title)
    const best=metric==='cpu'?m.cpuPeak:m.ramPeak
    if(best){
      text(x+panelW-10,panelY+panelH-(isSlide?18:22),
        'Peak '+pct(best.value)+'  '+best.host,isSlide?8.8:9.5,'bold','red','right')
      text(x+panelW-10,panelY+panelH-(isSlide?32:37),
        reportPeakEvidenceWib(best.at),isSlide?8.1:8.6,'bold','ink','right')
    }
    const px=x+(isSlide?34:43),py=panelY+(isSlide?31:49),pw=panelW-(isSlide?54:68),ph=isSlide?54:90
    const xFor=day=>px+(day-1)*pw/Math.max(1,m.days-1)
    const timeBased=Array.isArray(m.timeSeries)
    const xForTime=at=>px+(at-m.timeStart)*pw/(m.timeEnd-m.timeStart)
    const yFor=n=>py+ph*Math.max(0,Math.min(100,n))/100
    for(const level of [0,25,50,75,100]) {
      const yy=yFor(level)
      line(px,yy,px+pw,yy,'rule',.48)
      text(px-10,yy-2,String(level)+'%',7,'normal','muted','right')
    }
    if(timeBased) {
      for (const tick of enterpriseTrendTicks(m.timeStart, m.timeEnd)) {
        text(xForTime(tick.at),py-15,tick.label,isSlide?7.3:8.0,'bold','ink',
          tick.at===m.timeStart?'left':'center')
      }
    } else {
      for(const tick of new Set(m.customStart
        ? [1,Math.max(1,Math.round(m.days/2)),m.days]
        :m.weekStart?[1,4,m.days]:[1,10,20,m.days])) {
        const label=new Intl.DateTimeFormat('en-GB',{
          timeZone:'UTC',day:'2-digit',month:'short',
        }).format(new Date(m.dates[tick-1]+'T00:00:00Z'))
        text(xFor(tick),py-15,label,isSlide?8.0:8.4,'bold','ink','center')
      }
    }
    if(value(threshold)!==null){
      const ty=yFor(value(threshold))
      pdf.setLineDashPattern([3,3],0)
      line(px,ty,px+pw,ty,'amber',.8)
      pdf.setLineDashPattern([],0)
      const label='Warning '+pct(threshold)
      font('normal',7.1)
      const width=pdf.getTextWidth(label)+9
      fillRect(px+pw-width-3,ty-4,width,13,'white',2)
      text(px+pw-7,ty,label,7.1,'normal','amber','right')
    }
    let observed=false
    const plotSeries=timeBased?m.timeSeries:m.series
    plotSeries.forEach((hostSeries,i)=>{
      const color=seriesColors[i]
      let previous=null
      const points=timeBased?hostSeries.points:hostSeries.days
      points.forEach(point=>{
        const reading=point[metric]
        if(reading===null){previous=null;return}
        observed=true
        const current={x:timeBased?xForTime(point.at):xFor(point.day),
          y:yFor(reading),at:point.at}
        if(previous&&(!timeBased||current.at-previous.at<=m.timeIntervalMs*1.05))
          line(previous.x,previous.y,current.x,current.y,color,1.35)
        previous=current
      })
    })
    if(best){
      const winner=plotSeries.find(row=>row.host===best.host)
      const points=timeBased?winner?.points:winner?.days
      const point=points?.find(point=>point[metric]===best.value &&
        point[metric+'At']===best.at)
        ||points?.find(point=>point[metric]===best.value)
      if(point){
        pdf.setFillColor(...rgb('red'))
        pdf.circle(timeBased?xForTime(point.at):xFor(point.day),H-yFor(best.value),3.5,'F')
      }
    }
    if(!observed)text(x+panelW/2,py+ph/2,'No retained readings',9,'normal','muted','center')
    // Keep the same legend colors for CPU and RAM across both charts.
    m.series.forEach((item,i)=>{
      const lx=x+(isSlide?34:65)+i*(isSlide?82:90),ly=panelY+(isSlide?9:12)
      fillRect(lx,ly,10,2.3,seriesColors[i])
      text(lx+15,ly-1,item.host,7.4,'normal','muted')
    })
  }
  trend(M,'APP CPU Utilization','cpu',m.pressure.thresholds?.cpu_warning_pct)
  trend(M+panelW+gap,'APP Memory Utilization','ram',m.pressure.thresholds?.ram_warning_pct)
  // Independent five-entry rankings from the full evaluated population.
  const barY=isSlide?272:H-413,barH=isSlide?86:154
  function bars(x,title,rows,metric,labelSuffix) {
    rect(x,barY,panelW,barH,'white',7)
    section(x+(isSlide?11:16),barY+barH-(isSlide?18:22),title)
    const start=barY+barH-(isSlide?33:43),dy=isSlide?10.6:11.1
    const bx=x+(isSlide?245:279),bw=panelW-(isSlide?245:279)-(isSlide?58:68)
    const values=rows.map(metric)
    const max=Math.max(0,...values.filter(n=>n!==null))
    rows.slice(0,5).forEach((row,i)=>{
      const yy=start-i*dy
      fitText(x+(isSlide?11:16),yy,row.consumer_key,isSlide?223:259,'left',isSlide?7.3:7.25)
      fillRect(bx,yy-2,bw,7.2,'header',2)
      const n=metric(row)
      if(n!==null && max>0)fillRect(bx,yy-2,bw*n/max,7.2,'blue',2)
      text(x+panelW-10,yy,n===null?'N/A':number(n,2)+labelSuffix,isSlide?7.6:7.7,'normal','ink','right')
    })
    if(!rows.length)text(x+panelW/2,barY+barH/2,'No workloads recorded',9,'normal','muted','center')
  }
  bars(M,'Top 5 Workloads - Peak WP CPU',m.sortedCpu,
    row=>value(wpCpuCoreEquivalent(row.peak_cpu_pct)),' cores')
  bars(M+panelW+gap,'Top 5 Workloads - Peak PSS',m.sortedPss,
    row=>value(row.peak_pss_gb),' GB')
  // Bottom server + program evaluation tables.
  const lowY=isSlide?120:172,lowH=isSlide?144:H-427-lowY
  const serverW=isSlide?338:376,jobX=M+serverW+(isSlide?10:12)
  const jobW=CW-serverW-(isSlide?10:12)
  rect(M,lowY,serverW,lowH,'white',7)
  rect(jobX,lowY,jobW,lowH,'white',7)
  section(M+15,lowY+lowH-(isSlide?20:23),'Application Server Utilization')
  section(jobX+15,lowY+lowH-(isSlide?20:23),'Top 5 Workloads for Review')
  text(jobX+jobW-15,lowY+lowH-(isSlide?20:23),'Signal-based · verify in SAP',
    isSlide?7:8,'normal','muted','right')
  function table(x,top,width,spec,head,rows,headH,rowH,size) {
    fillRect(x,top-headH,width,headH,'header',3)
    rows.forEach((_,i)=>{
      const yy=top-headH-(i+1)*rowH
      if(i%2===1)fillRect(x,yy,width,rowH,'light')
      line(x,yy,x+width,yy,'rule',.33)
    })
    let offset=x
    spec.forEach(([cw,align],i)=>{
      const xx=align==='left'?offset+5:align==='right'?offset+cw-5:offset+cw/2
      const parts=Array.isArray(head[i])?head[i]:[head[i]]
      if(parts.length>2)throw Error('Report table header exceeds two lines')
      parts.forEach((label,index)=>{
        const yy=parts.length===2?top-(index===0?11:20):top-(headH>=22?15:13)
        fitText(xx,yy,label,cw,align,isSlide?7.7:7.1,'muted','bold')
      })
      offset+=cw
    })
    rows.forEach((row,i)=>{
      const yy=top-headH-(i+.65)*rowH
      let ox=x
      row.forEach((v,j)=>{
        const [cw,align]=spec[j]
        const xx=align==='left'?ox+5:align==='right'?ox+cw-5:ox+cw/2
        fitText(xx,yy,String(v??'N/A'),cw,align,size,j===0?'navy':'ink',j===0?'bold':'normal')
        ox+=cw
      })
    })
  }
  const srvRows=m.hosts.map(row=>[
    row.host,pct(row.avg_cpu_pct),pct(row.peak_cpu_pct),
    pct(row.avg_ram_pct),pct(row.peak_ram_pct),
    number(row.cpu_warning_host_checks,0),number(row.ram_warning_host_checks,0),
  ])
  const srvSpec=isSlide?[[30,'left'],[40,'right'],[40,'right'],[40,'right'],[40,'right'],[64,'right'],[64,'right']]:[[40,'left'],[45,'right'],[45,'right'],[45,'right'],[45,'right'],[68,'right'],[68,'right']]
  table(M+10,lowY+lowH-(isSlide?30:36),serverW-20,srvSpec,
    ['APP','CPU Avg','CPU Peak','RAM Avg','RAM Peak',
      isSlide?['CPU Warning','Checks']:'CPU Warning Checks',
      isSlide?['RAM Warning','Checks']:'RAM Warning Checks'],
    srvRows,isSlide?23:25,isSlide?17.4:32,isSlide?8.0:8)
  const jobRows=m.candidates.map((row,i)=>{
    const hostList=(row.hosts||[]).map(app)
    return [
      String(i+1).padStart(2,'0'),
      row.consumer_key,
      hostList.length===1?hostList[0]:hostList.length>1?'Multi':'N/A',
      number(row.observations,0),
      value(row.peak_cpu_pct)===null?'N/A':number(wpCpuCoreEquivalent(row.peak_cpu_pct),2),
      number(row.peak_pss_gb,2),
      wib(row.last_seen),
      candidateAction(row),
    ]
  })
  const jobSpec=isSlide
    ?[[18,'center'],[195,'left'],[32,'center'],[52,'right'],[48,'right'],[45,'right'],[85,'center'],[77,'left']]
    :[[24,'center'],[238,'left'],[40,'center'],[62,'right'],[70,'right'],[58,'right'],[92,'center'],[134,'left']]
  const fixedWidth=jobW-20
  jobSpec[jobSpec.length-1][0]+=fixedWidth-jobSpec.reduce((sum,c)=>sum+c[0],0)
  table(jobX+10,lowY+lowH-(isSlide?30:36),jobW-20,jobSpec,
    ['No','Program / Job','APP','Observations',
      isSlide?['WP CPU','cores']:'WP CPU cores',isSlide?['PSS','GB']:'PSS GB',
      isSlide?['Last Seen','(WIB)']:'Last Seen (WIB)',
      isSlide?['Suggested','Review']:'Suggested Review'],
    jobRows,isSlide?23:25,isSlide?17.4:17.8,isSlide?7.6:7.5)

  // Four verified mount-category rows. Absence of a correctly mapped READY
  // historical filesystem sample remains "Not Collected", never zero/NORMAL.
  const fsY=isSlide?8:25,fsH=isSlide?104:132
  rect(M,fsY,CW,fsH,'white',7)
  const scopedStorageHosts=[...new Set(m.storage.map(row=>app(row.host))
    .filter(host=>/^APP[1-5]$/.test(host)))]
  const storageTitle='Filesystem Capacity'+(scopedStorageHosts.length===1
    ? ' · '+scopedStorageHosts[0] : '')
  section(M+15,fsY+fsH-(isSlide?17:22),storageTitle)
  // Present the highest source-backed storage utilization without inventing
  // a filesystem threshold or declaring missing mounts healthy.
  const highestStorage=m.storage.filter(row=>
    row.status==='COLLECTED' && value(row.used_pct)!==null &&
    Number.isFinite(Date.parse(row.sample_at)) &&
    Date.parse(row.sample_at)>=Date.parse(m.period.startUtc) &&
    Date.parse(row.sample_at)<Date.parse(m.period.exclusiveEndUtc))
    .sort((a,b)=>Number(b.used_pct)-Number(a.used_pct))[0]
  if(highestStorage) {
    const storageLabel='Highest use: '+(highestStorage.mount_point||highestStorage.category)+
      ' · '+app(highestStorage.host)+' '+pct(highestStorage.used_pct)
    text(M+CW-15,fsY+fsH-(isSlide?17:22),storageLabel,isSlide?8:9,'bold',
      'muted','right',isSlide?325:430)
  }
  const fsSpec=isSlide?[[150,'left'],[205,'left'],[110,'right'],[110,'right'],[110,'right'],[70,'right'],[145,'right']]:[[150,'left'],[250,'left'],[128,'right'],[128,'right'],[128,'right'],[93,'right'],[CW-20-877,'right']]
  const bytes=n=>{
    if(value(n)===null)return 'Not Collected'
    const u=Number(n)>=1e12?'TB':'GB'
    return number(Number(n)/(u==='TB'?1e12:1e9),2)+' '+u
  }
  const fsItems=m.storage
  const fsOrder=['File System OS','FS SAP Archive','Archive INTF','INTF']
  const fsRows=fsOrder.map(label=>{
    const row=fsItems.find(item=>item.category===label)
    if(!row||row.status!=='COLLECTED'||!row.sample_at ||
        Number.isNaN(Date.parse(row.sample_at)) ||
        Date.parse(row.sample_at)<Date.parse(m.period.startUtc) ||
        Date.parse(row.sample_at)>=Date.parse(m.period.exclusiveEndUtc))return [label,'Not Collected','—','—','—','—','—']
    return [
      label,(row.mount_point||'—')+' · '+app(row.host),
      bytes(row.total_bytes),bytes(row.used_bytes),
      row.availability_source==='EXPLICIT' && value(row.free_bytes)!==null
        ?bytes(row.free_bytes):'—',
      pct(row.used_pct),wib(row.sample_at)+' WIB',
    ]
  })
  table(M+10,fsY+fsH-(isSlide?27:32),CW-20,fsSpec,
    ['Filesystem','Mounted On / Host','Total','Used',
     'Available (df)','Used (%)','Last Sample (WIB)'],
    fsRows,isSlide?18:23,isSlide?14.4:17.4,isSlide?8.5:7.8)
  if(isSlide){
    const close=(a,b)=>Math.abs(a-b)<.02
    const columnWidth=spec=>spec.reduce((sum,[width])=>sum+width,0)
    if(!close(columnWidth(srvSpec),serverW-20) ||
       !close(columnWidth(jobSpec),jobW-20) ||
       !close(columnWidth(fsSpec),CW-20) ||
       !(fsY+fsH<lowY && lowY+lowH<barY && barY+barH<panelY &&
         panelY+panelH<=H-48)){
      throw Error('Slide report layout geometry is inconsistent')
    }
  }
  // All report content stays on this single page.
  if(pdf.internal.getNumberOfPages()!==1)throw Error('Enterprise report must fit one landscape page')
  return returnInstance?pdf:pdf.output('blob')
}

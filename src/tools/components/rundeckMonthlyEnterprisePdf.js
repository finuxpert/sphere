/* SPHERE monthly enterprise PDF. One fixed A3 landscape page, backed by saved evidence.
 * Workload checks are not SM37 executions. WP CPU is core-equivalent, not host CPU.
 * Missing dates are gaps; absent values are never replaced with simulated data.
 */
import { wpCpuCoreEquivalent } from './monthlyCpuMetrics.js'

const COLOR = {
  navy: [16,42,67], ink: [28,51,71], muted: [98,118,137],
  blue: [21,90,155], bluefill: [219,234,248], light: [246,249,252],
  rule: [220,229,236], red: [194,59,56], amber: [185,109,22],
  green: [23,109,87], violet: [126,91,170], slate: [115,137,158],
  teal: [34,149,144], white: [255,255,255], header: [238,244,248],
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
const candidateFinding = row => row.signals?.high_memory ? 'High WP memory'
  : row.signals?.sustained_high_cpu ? 'High WP CPU'
    : row.signals?.cpu_spike ? 'WP CPU spike'
      : row.signals?.baseline_anomaly ? 'Above baseline' : 'Performance review'
const candidateAction = row => row.signals?.high_memory ? 'Review memory use'
  : row.signals?.sustained_high_cpu || row.signals?.cpu_spike ? 'Review processing'
    : row.signals?.baseline_anomaly ? 'Check workload change' : 'Review in SAP'

export function monthlyEnterpriseReportModel(month,data) {
  if(!data?.monthly_pressure || !data?.quality || !data?.monthly_errors) {
    throw Error('Saved monthly pressure, coverage and error evidence is required')
  }
  monthName(month)
  const pressure=data.monthly_pressure
  const quality=data.quality
  const summary=data.summary||{}
  if(data.monthly_storage?.month!==month || !Array.isArray(data.monthly_storage?.items)) {
    throw Error('Month-scoped infrastructure storage evidence is required')
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
  }).slice(0,10)
  const hosts=Array.from({length:5},(_,i)=>{
    const name='APP'+(i+1)
    const row=(pressure.hosts||[]).find(v=>app(v.host)===name)
    return {...(row||{}),host:name}
  })
  const [year,mon]=month.split('-').map(Number)
  const days=new Date(Date.UTC(year,mon,0)).getUTCDate()
  // Retain one point per APP and calendar day; absent dates remain null.
  // CPU/RAM line series must never join peaks from different hosts.
  const dailySource=new Map()
  for(const row of pressure.daily_hosts||[]) {
    const date=String(row.day||'').slice(0,10)
    const host=app(row.host)
    if(!/^APP[1-5]$/.test(host) || !date.startsWith(month+'-'))continue
    const byHost=dailySource.get(date)||{}
    byHost[host]=row
    dailySource.set(date,byHost)
  }
  const series=hosts.map(row=>({
    host:row.host,
    days:Array.from({length:days},(_,i)=>{
      const date=month+'-'+String(i+1).padStart(2,'0')
      const sample=dailySource.get(date)?.[row.host]
      return {
        day:i+1,host:row.host,
        cpu:value(sample?.peak_cpu_pct),ram:value(sample?.peak_ram_pct),
        cpuAt:sample?.peak_cpu_at||null,ramAt:sample?.peak_ram_at||null,
      }
    }),
  }))
  const daily=Array.from({length:days},(_,index)=>{
    const date=month+'-'+String(index+1).padStart(2,'0')
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
  return {
    month,quality,summary,pressure,candidates,hosts,daily,days,series,
    storage:data.monthly_storage.items,
    cpuPeak:maximum('cpu'),ramPeak:maximum('ram'),
    sortedCpu:data.monthly_top_wp_cpu.slice(0,10).filter(row=>value(row.peak_cpu_pct)!==null),
    sortedPss:data.monthly_top_wp_pss.slice(0,10).filter(row=>value(row.peak_pss_gb)!==null),
  }
}

export async function buildManagementMonthlyPdf({month,data,returnInstance=false}) {
  const m=monthlyEnterpriseReportModel(month,data)
  const {jsPDF}=await import('jspdf')
  const pdf=new jsPDF({orientation:'landscape',unit:'pt',format:'a3',compress:true})
  const W=pdf.internal.pageSize.getWidth(),H=pdf.internal.pageSize.getHeight()
  const M=32,CW=W-2*M
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
  function section(x,y,title) {text(x,y,title,12,'bold','navy')}
  function fitText(x,y,s,width,align='left',base=8.0,color='ink',weight='normal') {
    const label=String(s??'N/A')
    let sz=base
    font(weight,sz)
    while(pdf.getTextWidth(label)>width-9 && sz>5.5){sz-=.2;font(weight,sz)}
    if(pdf.getTextWidth(label)<=width-9) {
      text(x,y,label,sz,weight,color,align)
      return
    }
    // Preserve complete SAP program identities: wrap rather than truncate.
    const parts=pdf.splitTextToSize(label,width-10)
    if(parts.length>2)throw Error('Program name exceeds two-line A3 cell: '+label)
    parts.forEach((part,i)=>text(x,y+3-i*7,part,6.2,weight,color,align))
  }
  // Use the original repository brand asset; never synthesize a logo.
  if(typeof document!=='undefined' && typeof window!=='undefined'){
    const base=import.meta.env?.BASE_URL||'/'
    const brandUrl=new URL(base+'branding/logo/sphere-logo-horizontal-light.png',window.location.origin)
    const brand=await fetch(brandUrl,{cache:'force-cache'})
    if(!brand.ok)throw Error('Original SPHERE logo is unavailable (HTTP '+brand.status+')')
    pdf.addImage(new Uint8Array(await brand.arrayBuffer()),'PNG',M,13,106,30)
  }
  text(M+123,H-37,'SAP Monthly Performance Report',19,'bold','navy')
  text(W-M,H-37,monthName(month),10,'bold','muted','right')
  line(M,H-53,W-M,H-53,'rule',.7)
  // Five stable APP-specific series; missing days cause real gaps in each line.
  // Peak values and timestamps are in the header, never floating above the plot.
  const panelY=H-247,panelH=180,gap=12,panelW=(CW-gap)/2
  const seriesColors=['blue','green','amber','violet','slate']
  const shortMonth=new Intl.DateTimeFormat('en-GB',{
    month:'short',timeZone:'UTC',
  }).format(new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7))-1,1)))
  function trend(x,title,metric,threshold) {
    rect(x,panelY,panelW,panelH,'white',7)
    section(x+16,panelY+panelH-23,title)
    const best=metric==='cpu'?m.cpuPeak:m.ramPeak
    if(best){
      text(x+panelW-16,panelY+panelH-22,
        'Peak '+pct(best.value)+'  '+best.host,9,'bold','red','right')
      text(x+panelW-16,panelY+panelH-37,
        wib(best.at)+' WIB',7.3,'normal','muted','right')
    }
    const px=x+43,py=panelY+49,pw=panelW-68,ph=90
    const xFor=day=>px+(day-1)*pw/(m.days-1)
    const yFor=n=>py+ph*Math.max(0,Math.min(100,n))/100
    for(const level of [0,25,50,75,100]) {
      const yy=yFor(level)
      line(px,yy,px+pw,yy,'rule',.48)
      text(px-10,yy-2,String(level)+'%',7,'normal','muted','right')
    }
    for(const tick of new Set([1,10,20,m.days])) {
      const label=tick===m.days?String(tick).padStart(2,'0')+' '+shortMonth
        :String(tick).padStart(2,'0')
      text(xFor(tick),py-15,label,7.3,'normal','muted','center')
    }
    if(value(threshold)!==null){
      const ty=yFor(value(threshold))
      pdf.setLineDashPattern([3,3],0)
      line(px,ty,px+pw,ty,'amber',.8)
      pdf.setLineDashPattern([],0)
      const label='Limit '+pct(threshold)
      font('normal',7.1)
      const width=pdf.getTextWidth(label)+9
      fillRect(px+pw-width-3,ty-4,width,13,'white',2)
      text(px+pw-7,ty,label,7.1,'normal','amber','right')
    }
    let observed=false
    m.series.forEach((hostSeries,i)=>{
      const color=seriesColors[i]
      let previous=null
      hostSeries.days.forEach(point=>{
        const reading=point[metric]
        if(reading===null){previous=null;return}
        observed=true
        const current={x:xFor(point.day),y:yFor(reading)}
        if(previous)line(previous.x,previous.y,current.x,current.y,color,1.35)
        previous=current
      })
    })
    if(best){
      const winner=m.series.find(row=>row.host===best.host)
      const point=winner?.days.find(point=>
        point[metric]===best.value &&
        point[metric+'At']===best.at)
        || winner?.days.find(point=>point[metric]===best.value)
      if(point){
        pdf.setFillColor(...rgb('red'))
        pdf.circle(xFor(point.day),H-yFor(best.value),3.5,'F')
      }
    }
    if(!observed)text(x+panelW/2,py+ph/2,'No retained readings',9,'normal','muted','center')
    // Keep the same legend colors for CPU and RAM across both charts.
    m.series.forEach((item,i)=>{
      const lx=x+65+i*90,ly=panelY+12
      fillRect(lx,ly,10,2.3,seriesColors[i])
      text(lx+15,ly-1,item.host,7.4,'normal','muted')
    })
  }
  trend(M,'CPU Utilization Trend','cpu',m.pressure.thresholds?.cpu_warning_pct)
  trend(M+panelW+gap,'Memory Utilization Trend','ram',m.pressure.thresholds?.ram_warning_pct)
  // Two rankings show the same ten candidates, sorted independently.
  const barY=H-413,barH=154
  function bars(x,title,rows,metric,labelSuffix) {
    rect(x,barY,panelW,barH,'white',7)
    section(x+16,barY+barH-22,title)
    const start=barY+barH-43,dy=11.1,bx=x+279,bw=panelW-279-68
    const values=rows.map(metric)
    const max=Math.max(0,...values.filter(n=>n!==null))
    rows.slice(0,10).forEach((row,i)=>{
      const yy=start-i*dy
      fitText(x+16,yy,row.consumer_key,259,'left',7.25)
      fillRect(bx,yy-2,bw,7.2,'header',2)
      const n=metric(row)
      if(n!==null && max>0)fillRect(bx,yy-2,bw*n/max,7.2,i===0?'red':'blue',2)
      text(x+panelW-15,yy,n===null?'N/A':number(n,2)+labelSuffix,7.7,'normal','ink','right')
    })
    if(!rows.length)text(x+panelW/2,barY+75,'No tuning candidates recorded',9,'normal','muted','center')
  }
  bars(M,'Top 10 Jobs by Peak WP CPU',m.sortedCpu,
    row=>value(wpCpuCoreEquivalent(row.peak_cpu_pct)),' cores')
  bars(M+panelW+gap,'Top 10 Jobs by Peak WP Memory',m.sortedPss,
    row=>value(row.peak_pss_gb),' GB')
  // Bottom server + program evaluation tables.
  const lowY=172,lowH=H-427-lowY,serverW=376,jobX=M+serverW+12,jobW=CW-serverW-12
  rect(M,lowY,serverW,lowH,'white',7)
  rect(jobX,lowY,jobW,lowH,'white',7)
  section(M+15,lowY+lowH-23,'Application Server Performance')
  section(jobX+15,lowY+lowH-23,'Top 10 Jobs for Tuning Review')
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
      fitText(xx,top-16,head[i],cw,align,7.1,'muted','bold')
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
  const srvSpec=[[43,'left'],[50,'right'],[50,'right'],[52,'right'],[52,'right'],[60,'right'],[62,'right']]
  table(M+10,lowY+lowH-36,serverW-20,srvSpec,
    ['APP','CPU Avg','CPU Max','RAM Avg','RAM Max','CPU High Reads','RAM High Reads'],
    srvRows,25,32,8)
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
      candidateFinding(row),
      candidateAction(row),
    ]
  })
  const jobSpec=[[24,'center'],[174,'left'],[36,'center'],[43,'right'],[67,'right'],[57,'right'],[79,'center'],[109,'left'],[116.55,'left']]
  const fixedWidth=jobW-20
  jobSpec[8][0]+=fixedWidth-jobSpec.reduce((sum,c)=>sum+c[0],0)
  table(jobX+10,lowY+lowH-36,jobW-20,jobSpec,
    ['No','Program / Job','APP','Samples','CPU cores','PSS GB','Evidence (WIB)','Review finding','Tuning action'],
    jobRows,25,17.8,7.2)

  // Four verified mount-category rows. Absence of a correctly mapped READY
  // historical filesystem sample remains "Not Collected", never zero/NORMAL.
  const fsY=25,fsH=132
  rect(M,fsY,CW,fsH,'white',7)
  section(M+15,fsY+fsH-22,'Storage Capacity')
  const fsSpec=[[150,'left'],[250,'left'],[128,'right'],[128,'right'],[128,'right'],[93,'right'],[CW-20-877,'right']]
  const bytes=n=>{
    if(value(n)===null)return 'Not Collected'
    const u=Number(n)>=1e12?'TB':'GB'
    return number(Number(n)/(u==='TB'?1e12:1e9),2)+' '+u
  }
  const fsItems=m.storage
  const fsOrder=['File System OS','FS SAP Archive','Archive INTF','INTF']
  const fsRows=fsOrder.map(label=>{
    const row=fsItems.find(item=>item.category===label)
    if(!row||row.status!=='COLLECTED')return [label,'Not Collected','—','—','—','—','—']
    return [
      label,(row.mount_point||'—')+' · '+app(row.host),
      bytes(row.total_bytes),bytes(row.used_bytes),bytes(row.free_bytes),
      pct(row.used_pct),wib(row.sample_at)+' WIB',
    ]
  })
  table(M+10,fsY+fsH-32,CW-20,fsSpec,
    ['File System','Mounted On / Host','Total Capacity','Used Capacity',
     'Free Capacity','Usage %','Sample WIB'],
    fsRows,23,17.4,7.8)
  // All report content stays on this single page.
  if(pdf.internal.getNumberOfPages()!==1)throw Error('Enterprise report must fit one A3 landscape page')
  return returnInstance?pdf:pdf.output('blob')
}

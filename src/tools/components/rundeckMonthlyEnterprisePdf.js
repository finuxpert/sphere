/* SPHERE monthly enterprise PDF. One fixed A3 landscape page, backed by saved evidence.
 * Workload checks are not SM37 executions. WP CPU is core-equivalent, not host CPU.
 * Missing dates are gaps; absent values are never replaced with simulated data.
 */
import { wpCpuCoreEquivalent } from './monthlyCpuMetrics.js'

const COLOR = {
  navy: [16,42,67], ink: [28,51,71], muted: [98,118,137],
  blue: [21,90,155], bluefill: [219,234,248], light: [246,249,252],
  rule: [220,229,236], red: [194,59,56], amber: [185,109,22],
  green: [23,109,87], white: [255,255,255], header: [238,244,248],
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
const clip = (input,max=55) => {
  const s=String(input??'N/A')
  return s.length>max?s.slice(0,max-1)+'…':s
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
  const daily=Array.from({length:days},(_,index)=>{
    const date=month+'-'+String(index+1).padStart(2,'0')
    const rows=(pressure.daily_hosts||[]).filter(v=>String(v.day).slice(0,10)===date)
    const peak=metric=>{
      const field='peak_'+metric+'_pct'
      const timed='peak_'+metric+'_at'
      const observed=rows.filter(row=>value(row[field])!==null)
        .sort((a,b)=>value(b[field])-value(a[field]))
      return observed.length?{
        value:value(observed[0][field]),host:app(observed[0].host),
        at:observed[0][timed]||null,
      }:null
    }
    return {day:index+1,cpu:peak('cpu'),ram:peak('ram')}
  })
  const maximum=metric=>daily.map(row=>row[metric]).filter(Boolean)
    .sort((a,b)=>b.value-a.value)[0]||null
  return {
    month,quality,summary,pressure,candidates,hosts,daily,days,
    cpuPeak:maximum('cpu'),ramPeak:maximum('ram'),
    sortedCpu:[...candidates].sort((a,b)=>
      (value(wpCpuCoreEquivalent(b.peak_cpu_pct))??-1)-
      (value(wpCpuCoreEquivalent(a.peak_cpu_pct))??-1)),
    sortedPss:[...candidates].sort((a,b)=>
      (value(b.peak_pss_gb)??-1)-(value(a.peak_pss_gb)??-1)),
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
    let sz=base
    font(weight,sz)
    while(pdf.getTextWidth(String(s))>width-8&&sz>6.1){sz-=.2;font(weight,sz)}
    text(x,y,s,sz,weight,color,align,width-7)
  }
  // Header - same positions and page geometry as the approved enterprise prototype.
  text(M,H-41,'SPHERE',25,'bold','blue')
  line(M+139,H-47,M+139,H-25)
  text(M+160,H-40,'SAP Monthly Performance Report',19,'bold','navy')
  text(M+160,H-61,monthName(month),10,'normal','muted')
  fillRect(W-M-145,H-56,145,28,'header',6)
  text(W-M-72.5,H-46,'SPHERE EVIDENCE',9,'bold','blue','center')
  line(M,H-80,W-M,H-80,'rule',.95)
  text(M,H-98,'System: SAP Production',9,'normal','ink')
  text(M+227,H-98,'Period: '+month,9,'normal','ink')
  text(M+475,H-98,'Prepared: '+wib(new Date().toISOString(),true),9,'normal','ink')
  text(W-M,H-98,'Source: SPHERE saved records',9,'normal','muted','right')
  // 5 metrics
  const ky=H-171,kh=57
  rect(M,ky,CW,kh,'light',6)
  const kp=[
    ['PROGRAMS REVIEWED',number(m.summary.workloads,0),'ink'],
    ['TUNING CANDIDATES',number(data.monthly_abap_candidates?.length,0),'blue'],
    ['CPU WARNING READINGS',number(m.pressure.cpu?.observed_pressure_host_checks,0),'red'],
    ['RAM WARNING READINGS',number(m.pressure.ram?.observed_pressure_host_checks,0),'amber'],
    ['DATA COVERAGE',pct(m.quality.coverage_pct),'ink'],
  ]
  kp.forEach(([label,val,color],i)=>{
    const x=M+20+i*CW/5
    text(x,ky+38,label,7.6,'bold','muted')
    text(x,ky+11,val,19,'bold',color)
  })
  // Daily trends - null data creates a break, not a zero and not a connected bridge.
  const panelY=H-374,panelH=190,gap=12,panelW=(CW-gap)/2
  function trend(x,title,metric,threshold) {
    rect(x,panelY,panelW,panelH,'white',7)
    section(x+16,panelY+panelH-24,title)
    text(x+16,panelY+panelH-38,'Daily highest observed APP reading',7.8,'normal','muted')
    const px=x+43,py=panelY+37,pw=panelW-67,ph=panelH-94
    for(const level of [0,25,50,75,100]){
      const yy=py+ph*level/100
      line(px,yy,px+pw,yy,'rule',.48)
      text(px-10,yy-2,String(level),7,'normal','muted','right')
    }
    const ticks=[1,10,20,m.days]
    for(const tick of new Set(ticks)){
      const xx=px+(tick-1)*pw/(m.days-1)
      text(xx,py-16,String(tick).padStart(2,'0')+' '+monthName(month).split(' ')[0].slice(0,3),7.4,'normal','muted','center')
    }
    if(value(threshold)!==null){
      const yy=py+ph*Math.max(0,Math.min(100,value(threshold)))/100
      pdf.setLineDashPattern([3,3],0);line(px,yy,px+pw,yy,'amber',.9);pdf.setLineDashPattern([],0)
      text(x+panelW-17,panelY+panelH-24,'Threshold '+pct(threshold),7.5,'normal','muted','right')
    }
    let prev=null
    for(const item of m.daily){
      const peak=item[metric]
      if(!peak){prev=null;continue}
      const xx=px+(item.day-1)*pw/(m.days-1)
      const yy=py+ph*Math.max(0,Math.min(100,peak.value))/100
      if(prev)line(prev.x,prev.y,xx,yy,'blue',1.8)
      pdf.setFillColor(...rgb('blue'));pdf.circle(xx,H-yy,1.6,'F')
      prev={x:xx,y:yy}
    }
    const best=metric==='cpu'?m.cpuPeak:m.ramPeak
    if(best){
      const chosen=m.daily.find(r=>r[metric]===best)
      const xx=px+(chosen.day-1)*pw/(m.days-1)
      const yy=py+ph*Math.max(0,Math.min(100,best.value))/100
      pdf.setFillColor(...rgb('red'));pdf.circle(xx,H-yy,4.0,'F')
      const ax=Math.min(xx+8,x+panelW-154)
      const ay=Math.min(yy+9,panelY+panelH-43)
      rect(ax,ay,132,28,'white',3)
      text(ax+6,ay+16,pct(best.value)+'  '+best.host,9,'bold','red')
      text(ax+6,ay+5,wib(best.at),7,'normal','muted', 'left',120)
    }else{
      text(x+panelW/2,py+ph/2,'No retained readings',9,'normal','muted','center')
    }
  }
  trend(M,'CPU Utilization Trend','cpu',m.pressure.thresholds?.cpu_warning_pct)
  trend(M+panelW+gap,'Memory Utilization Trend','ram',m.pressure.thresholds?.ram_warning_pct)
  // Two rankings show the same ten candidates, sorted independently.
  const barY=H-535,barH=149
  function bars(x,title,rows,metric,labelSuffix) {
    rect(x,barY,panelW,barH,'white',7)
    section(x+16,barY+barH-22,title)
    const start=barY+barH-44,dy=10.7,bx=x+211,bw=panelW-211-75
    const values=rows.map(metric)
    const max=Math.max(0,...values.filter(n=>n!==null))
    rows.slice(0,10).forEach((row,i)=>{
      const yy=start-i*dy
      fitText(x+16,yy,row.consumer_key,panelW-291,'left',7.35)
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
  const lowY=58,lowH=H-549-lowY,serverW=389,jobX=M+serverW+12,jobW=CW-serverW-12
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
  const srvSpec=[[49,'left'],[52,'right'],[58,'right'],[55,'right'],[62,'right'],[54,'right'],[39,'right']]
  table(M+10,lowY+lowH-36,serverW-20,srvSpec,
    ['APP','CPU Avg','CPU Max','RAM Avg','RAM Max','CPU Alert','RAM Alert'],srvRows,25,23,8)
  const hostPeak=(metric,peak)=>{
    if(!peak)return 'N/A'
    return peak.host+'  '+pct(peak.value)+'  '+wib(peak.at)
  }
  text(M+16,lowY+lowH-185,'Highest CPU: '+hostPeak('cpu',m.cpuPeak),8.1)
  text(M+16,lowY+lowH-202,'Highest RAM: '+hostPeak('ram',m.ramPeak),8.1)
  text(M+16,lowY+lowH-219,'Alert limit: CPU '+pct(m.pressure.thresholds?.cpu_warning_pct)+
    ', RAM '+pct(m.pressure.thresholds?.ram_warning_pct),7.5,'normal','muted')
  const jobRows=m.candidates.map((row,i)=>{
    const hostList=(row.hosts||[]).map(app)
    return [
      String(i+1).padStart(2,'0'),
      clip(row.consumer_key,45),
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
    jobRows,25,16.5,7.4)
  if(jobRows.length<10){
    text(jobX+17,lowY+lowH-36-25-16.5*jobRows.length-11,
      'Additional candidates were not observed for this period.',7.7,'normal','muted')
  }
  line(M,44,W-M,44,'rule',.9)
  text(M,28,'SPHERE Monthly Performance Review',8,'bold','blue')
  text(M+252,28,'WP CPU is core-equivalent; observed samples are not SM37 job runs.',8,'normal','muted')
  text(W-M,28,'Page 1 of 1',8,'normal','muted','right')
  if(pdf.internal.getNumberOfPages()!==1)throw Error('Enterprise report must fit one A3 landscape page')
  return returnInstance?pdf:pdf.output('blob')
}

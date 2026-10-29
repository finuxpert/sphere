/* One-page management PDF built only from SPHERE's saved monthly evidence.
 * Deliberately separate from the full technical PDF: no hidden or omitted
 * technical rows in that downloadable version, and no fabricated root causes. */
import { wpCpuCoreEquivalent } from './monthlyCpuMetrics.js'

const asNumber = value => value === null || value === undefined || value === ''
  ? null : Number.isFinite(Number(value)) ? Number(value) : null
const fmt = (value, digits = 1) => {
  const n = asNumber(value)
  return n === null ? 'N/A' : n.toLocaleString('en-US',{maximumFractionDigits:digits})
}
const percent = value => fmt(value) === 'N/A' ? 'N/A' : fmt(value) + '%'
const hostName = value => {
  const match = String(value || '').toUpperCase().match(/(?:AOPH([1-5])PAPPDC|^APP([1-5])$)/)
  return match ? 'APP'+(match[1]||match[2]) : String(value || 'Not identified')
}
const wib = value => {
  if (!value || Number.isNaN(new Date(value).getTime())) return null
  return new Intl.DateTimeFormat('en-GB',{
    timeZone:'Asia/Jakarta',day:'2-digit',month:'short',year:'numeric',
    hour:'2-digit',minute:'2-digit',hour12:false
  }).format(new Date(value))+' WIB'
}
const cpuCores = value => {
  const result = wpCpuCoreEquivalent(value)
  return result == null ? 'N/A' : fmt(result,2) + ' cores'
}
const reason = row => [
  row.signals?.sustained_high_cpu && 'High CPU',
  row.signals?.high_memory && 'High RAM',
  row.signals?.cpu_spike && 'CPU spike',
  row.signals?.baseline_anomaly && 'Above normal',
].filter(Boolean).join(', ') || 'Resource review'

function write(pdf,value,x,y,options={},fontSize=9) {
  pdf.setFont('helvetica',options.bold?'bold':'normal')
  pdf.setFontSize(fontSize)
  pdf.setTextColor(...(options.color||[35,49,60]))
  pdf.text(String(value),x,y,options.align?{align:options.align}:undefined)
}
function section(pdf,value,y,width,margin) {
  write(pdf,value,margin,y,{bold:true,color:[28,43,54]},10)
  pdf.setDrawColor(215,223,228)
  pdf.setLineWidth(.25)
  pdf.line(margin,y+2.6,margin+width,y+2.6)
}
function textLines(pdf,text,width,size=8) {
  pdf.setFont('helvetica','normal')
  pdf.setFontSize(size)
  return pdf.splitTextToSize(String(text),width)
}

export async function buildManagementMonthlyPdf({month,data,returnInstance=false}) {
  if(!data?.monthly_pressure || !data?.monthly_errors || !data?.quality) {
    throw Error('Monthly management report requires verified saved pressure, error and coverage data')
  }
  const {jsPDF}=await import('jspdf')
  const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true})
  const W=pdf.internal.pageSize.getWidth(), H=pdf.internal.pageSize.getHeight()
  const margin=11, width=W-2*margin
  const quality=data.quality||{}, pressure=data.monthly_pressure||{}, summary=data.summary||{}
  const hosts=(pressure.hosts||[]).slice(0,5)
  const candidates=data.monthly_abap_candidates||[]
  const errors=(data.monthly_errors?.top_errors||[]).filter(row=>
    row.event_count||row.snapshot_host_checks||row.untimed_trace_checks)
  const validHosts=hosts.filter(row=>asNumber(row.peak_cpu_pct)!=null)
  const peakCpu=[...validHosts].sort((a,b)=>Number(b.peak_cpu_pct)-Number(a.peak_cpu_pct))[0]
  const peakRam=[...hosts].filter(row=>asNumber(row.peak_ram_pct)!=null)
    .sort((a,b)=>Number(b.peak_ram_pct)-Number(a.peak_ram_pct))[0]

  // Plain report header — no oversized dark banner or decorative KPI cards.
  write(pdf,'SPHERE',margin,15,{bold:true,color:[25,70,91]},12)
  write(pdf,'SAP Monthly Performance Review',margin+31,15,{bold:true},12)
  write(pdf,'Management Summary',W-margin,15,{color:[79,96,108],align:'right'},8.5)
  pdf.setDrawColor(207,216,223);pdf.line(margin,19,W-margin,19)
  write(pdf,'Period: '+month,margin,25,{bold:true},8.5)
  write(pdf,'Prepared: '+(wib(new Date().toISOString())||'N/A'),margin+52,25,{},8.5)
  write(pdf,'Recorded: '+(wib(quality.first_complete_at)||'N/A')+' - '+(wib(quality.last_complete_at)||'N/A'),W-margin,25,{align:'right'},8)

  // A single data row gives management the four important numbers without boxes.
  const summaryMetrics=[
    ['PROGRAMS TO REVIEW',fmt(summary.review_required,0)],
    ['CPU WARNING READINGS',fmt(pressure.cpu?.observed_pressure_host_checks,0)],
    ['RAM WARNING READINGS',fmt(pressure.ram?.observed_pressure_host_checks,0)],
    ['DATA COVERAGE',percent(quality.coverage_pct)],
  ]
  summaryMetrics.forEach(([label,value],i)=>{
    const x=margin+i*width/4
    write(pdf,label,x+2,33,{bold:true,color:[98,113,121]},7.5)
    write(pdf,value,x+2,41,{bold:true},13)
  })
  pdf.setDrawColor(224,230,234);pdf.line(margin,44,W-margin,44)

  section(pdf,'Executive Summary',51,width,margin)
  const findings=[
    peakCpu ? 'Highest CPU: '+hostName(peakCpu.host)+' '+percent(peakCpu.peak_cpu_pct) : 'CPU peak: No Data',
    peakRam ? 'Highest RAM: '+hostName(peakRam.host)+' '+percent(peakRam.peak_ram_pct) : 'RAM peak: No Data',
    'Programs to review: '+fmt(summary.review_required,0),
    'Data coverage: '+percent(quality.coverage_pct),
  ]
  // Two columns keep the management summary readable without tiny single-line text.
  findings.forEach((value,i)=>write(pdf,value,margin+2+(i%2)*width/2,58+Math.floor(i/2)*7,
    {bold:i<2,color:i<2?[35,49,60]:[83,100,111]},8.5))

  section(pdf,'APP Server Performance',74,width,margin)
  const appColumns=[
    ['APP',margin+2],['AVG CPU',margin+47],['PEAK CPU',margin+82],
    ['AVG RAM',margin+118],['PEAK RAM',margin+157],
    ['CPU WARN',margin+198],['RAM WARN',W-margin-2]
  ]
  appColumns.forEach(([label,x],i)=>write(pdf,label,x,81,{bold:true,color:[87,101,111],align:i===6?'right':undefined},7.4))
  hosts.forEach((row,i)=>{
    const y=89+i*6
    if(i%2===1){pdf.setFillColor(246,248,249);pdf.rect(margin,y-4.5,width,5.8,'F')}
    const v=[hostName(row.host),percent(row.avg_cpu_pct),percent(row.peak_cpu_pct),
      percent(row.avg_ram_pct),percent(row.peak_ram_pct),
      fmt(row.cpu_warning_host_checks,0)+' / '+fmt(row.cpu_warning_days,0),
      fmt(row.ram_warning_host_checks,0)+' / '+fmt(row.ram_warning_days,0)]
    v.forEach((value,j)=>write(pdf,value,appColumns[j][1],y,{align:j===6?'right':undefined},8.3))
  })
  if(!hosts.length)write(pdf,'APP host readings were not recorded for this period.',margin+2,90,{},8)
  write(pdf,'CPU WARN and RAM WARN show saved readings / APP-days, not failed jobs.',margin,119,{color:[92,105,113]},7.2)

  section(pdf,'Threshold Review',129,width,margin)
  const cpuLine='CPU: '+fmt(pressure.cpu?.observed_pressure_host_checks,0)+' readings at or above '+percent(pressure.thresholds?.cpu_warning_pct)+
    ' across '+fmt(pressure.cpu?.observed_warning_app_days,0)+' APP-days'
  const ramLine='RAM: '+fmt(pressure.ram?.observed_pressure_host_checks,0)+' readings at or above '+percent(pressure.thresholds?.ram_warning_pct)+
    ' across '+fmt(pressure.ram?.observed_warning_app_days,0)+' APP-days'
  pdf.setFillColor(246,248,250)
  pdf.roundedRect(margin,132,width/2-3,11,1.2,1.2,'F')
  pdf.roundedRect(margin+width/2+3,132,width/2-3,11,1.2,1.2,'F')
  write(pdf,cpuLine,margin+3,139,{},8)
  write(pdf,ramLine,margin+width/2+6,139,{},8)

  section(pdf,'Priority ABAP Programs for Review',147,width,margin)
  write(pdf,'PROGRAM / JOB',margin+2,154,{bold:true,color:[87,101,111]},7.5)
  write(pdf,'REVIEW REASON',margin+114,154,{bold:true,color:[87,101,111]},7.5)
  write(pdf,'MAX CPU',margin+207,154,{bold:true,color:[87,101,111],align:'right'},7.5)
  write(pdf,'MAX RAM',margin+242,154,{bold:true,color:[87,101,111],align:'right'},7.5)
  write(pdf,'SAMPLES',W-margin-2,154,{bold:true,color:[87,101,111],align:'right'},7.5)

  // Deduplicate by actual ABAP identifier, preserving the source-ranked order.
  // The one-page edition includes up to five; all source rows remain in the
  // Technical Report and live Monthly Review, without invented program dates.
  const seen=new Set()
  const priority=candidates.filter(row=>{
    const name=String(row.consumer_key||'').trim()
    if(!name||seen.has(name))return false
    seen.add(name);return true
  }).slice(0,5)
  let py=160
  let shown=0
  for(const [i,row] of priority.entries()) {
    const name=String(row.consumer_key)
    const lines=textLines(pdf,(i+1)+'. '+name,107,8.2)
    const reasonLines=textLines(pdf,reason(row),76,8)
    const h=Math.max(5.6,lines.length*3.6+1.5,reasonLines.length*3.5+1.5)
    // The one-page budget wins over candidate count; never clip a name or
    // force tiny text. Remaining candidates are all in the technical report.
    if(py+h>187)break
    if(i%2===1){pdf.setFillColor(247,249,250);pdf.rect(margin,py-3,width,h,'F')}
    pdf.setFontSize(8.2);pdf.setTextColor(35,49,60);pdf.text(lines,margin+2,py)
    pdf.setFontSize(8);pdf.text(reasonLines,margin+114,py)
    write(pdf,cpuCores(row.peak_cpu_pct),margin+207,py,{align:'right'},8)
    write(pdf,asNumber(row.peak_pss_gb)==null?'N/A':fmt(row.peak_pss_gb,2)+' GB',margin+242,py,{align:'right'},8)
    write(pdf,fmt(row.occurrences,0),W-margin-2,py,{align:'right'},8)
    py+=h
    shown+=1
  }
  if(!priority.length)write(pdf,'No priority program candidate in saved evidence.',margin+2,160,{},8)
  const nextY=Math.max(185,py+2)
  write(pdf,'Showing '+shown+' of '+candidates.length+' candidates. Full program details in Technical Report.',
    margin,nextY,{color:[94,108,117]},7.3)
  const errorCount=errors.length
  const errorText=errorCount
    ? 'SAP errors to check: '+fmt(errorCount,0)+' saved categories; '+String(errors[0].error_code||'Code unavailable')+
      ' ('+hostName(errors[0].host)+'). Check SAP for the affected program.'
    : 'SAP errors: No matching saved error data. This does not confirm zero errors.'
  pdf.setFont('helvetica','normal')
  pdf.setFontSize(7.3)
  pdf.setTextColor(73,91,104)
  pdf.text(textLines(pdf,errorText,width,7.3).slice(0,1),margin,198)
  write(pdf,'Source: SPHERE saved observations  '+fmt(quality.complete_checks,0)+' / ~'+fmt(quality.expected_checks,0)+
    ' expected ('+percent(quality.coverage_pct)+').',margin,H-5,{color:[94,107,117]},7)
  write(pdf,'Page 1 of 1',W-margin,H-5,{align:'right',color:[94,107,117]},7)

  if(pdf.internal.getNumberOfPages()!==1)throw Error('Management report exceeded 1 page')
  return returnInstance?pdf:pdf.output('blob')
}

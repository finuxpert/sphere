// Pure reporting-period helpers. Keep WIB and UTC date semantics unchanged.

export function monthOptions() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: 'numeric' })
    .formatToParts(new Date())
  const year = Number(parts.find(part => part.type === 'year')?.value)
  const month = Number(parts.find(part => part.type === 'month')?.value)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1))
    return {
      value: date.toISOString().slice(0, 7),
      label: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(date) + (index === 0 ? ' · ongoing' : ''),
    }
  })
}

export function weekOptions() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit',
  }).formatToParts(new Date())
  const part = type => Number(parts.find(row => row.type===type)?.value)
  const today = new Date(Date.UTC(part('year'),part('month')-1,part('day')))
  const weekday = (today.getUTCDay()+6)%7
  const monday = today.getTime()-weekday*86400000
  const label = date => new Intl.DateTimeFormat('en-GB',{
    timeZone:'UTC',day:'2-digit',month:'short',year:'numeric',
  }).format(date)
  return Array.from({length:26},(_,index)=>{
    const start=new Date(monday-index*7*86400000)
    const end=new Date(start.getTime()+6*86400000)
    return {
      value:start.toISOString().slice(0,10),
      label:label(start)+' – '+label(end)+(index===0?' · ongoing':''),
    }
  })
}

export function customDateError(start,end,todayWib){
  const valid=date=>/^20\d{2}-\d{2}-\d{2}$/.test(String(date||''))&&
    !Number.isNaN(Date.parse(date+'T00:00:00Z'))&&
    new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date
  if(!valid(start)||!valid(end))return 'Select start and end dates'
  const days=Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)+1
  if(days<1)return 'End date must not precede start date'
  if(days>31)return 'Maximum custom period is 31 days'
  if(start>todayWib||end>todayWib)return 'Future dates are unavailable'
  return ''
}
export const customDayCount=(start,end)=>Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)+1


/** Exact WIB calendar window. The end instant is exclusive. */
export function monthlyReportPeriod(month, {weekStart=null,customStart=null,customEnd=null}={}) {
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(month)))throw Error('Invalid monthly reporting period')
  const [year,mon]=month.split('-').map(Number)
  const validDay=day=>/^20\d{2}-\d{2}-\d{2}$/.test(String(day||'')) &&
    !Number.isNaN(Date.parse(day+'T00:00:00Z')) &&
    new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day
  const first=month+'-01'
  const last=new Date(Date.UTC(year,mon,0)).toISOString().slice(0,10)
  const start=customStart||weekStart||first
  const end=customStart?customEnd:weekStart
    ?new Date(Date.parse(weekStart+'T00:00:00Z')+6*86400000).toISOString().slice(0,10):last
  if(!validDay(start)||!validDay(end)||start>end)throw Error('Invalid report window')
  const ending=new Date(Date.parse(end+'T00:00:00Z')+86400000).toISOString().slice(0,10)
  const fmt=(day,withMonth=true)=>new Intl.DateTimeFormat('en-GB',{
    timeZone:'UTC',day:'2-digit',...(withMonth?{month:'long'}:{}),year:'numeric',
  }).format(new Date(day+'T00:00:00Z'))
  const sameMonth=start.slice(0,7)===end.slice(0,7)
  const label=sameMonth?start.slice(-2)+'–'+fmt(end):fmt(start)+' – '+fmt(end)
  // 00:00 WIB corresponds to 17:00 UTC on the preceding date.
  const toUTC=day=>new Date(Date.parse(day+'T00:00:00Z')-7*3600000).toISOString()
  return {
    start,end,exclusiveEnd:ending,startUtc:toUTC(start),exclusiveEndUtc:toUTC(ending),
    label:'Period: '+label+' (WIB)',days:Math.round((Date.parse(end)-Date.parse(start))/86400000)+1,
  }
}


/** Format an actual saved instant, not a daily bucket, in Asia/Jakarta. */
export function reportPeakEvidenceWib(timestamp) {
  if(!timestamp)return 'Peak time unavailable'
  const instant=new Date(timestamp)
  if(!Number.isFinite(instant.getTime()))return 'Peak time unavailable'
  const displayed=new Intl.DateTimeFormat('en-GB',{
    timeZone:'Asia/Jakarta',day:'2-digit',month:'short',year:'numeric',
    hour:'2-digit',minute:'2-digit',hour12:false,hourCycle:'h23',
  }).format(instant)
  return displayed+' WIB'
}

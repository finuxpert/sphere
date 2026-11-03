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


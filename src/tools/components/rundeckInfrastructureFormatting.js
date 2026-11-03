// Shared infrastructure numeric and WIB formatting; implementations are unchanged.

export const metric=(value,suffix='')=>value===null||value===undefined||value===''?'—':`${Number(value).toLocaleString('en-US',{maximumFractionDigits:1})}${suffix}`

const normalizeClock=(value)=>String(value||'').replace(/(\d{1,2})\.(\d{2})/g,'$1:$2')
export const formatTime=(value)=>value?normalizeClock(new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short',hour12:false}).format(new Date(value))):'—'
export const formatAxisTime=(value,range)=>{
  if(!value)return '—'
  const date=new Date(value)
  if(range==='1h'||range==='6h')return normalizeClock(new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false}).format(date))
  if(range==='24h')return normalizeClock(new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(date))
  return new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short'}).format(date)
}

export const hasNumericSample=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value))&&Number(value)>=0


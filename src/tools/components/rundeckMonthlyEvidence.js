/** Pure monthly evidence and management summary formatting. */
import { shortHost } from './sapUiFormat.js'
import { wpCpuCoreEquivalent } from './monthlyCpuMetrics.js'

export const fmt = (value, digits = 1) => value === null || value === undefined || !Number.isFinite(Number(value))
  ? '—' : Number(value).toLocaleString('id-ID', { maximumFractionDigits: digits })
export const pct = value => fmt(value) === '—' ? '—' : fmt(value) + '%'
// WP CPU is measured against one logical CPU, not the entire APP host.
export const wpCoreEq = value => {
  const cores = wpCpuCoreEquivalent(value)
  return cores === null ? '—' : fmt(cores, 2) + ' core eq.'
}
export const id = row => String(row.consumer_type || '') + ':' + String(row.consumer_key || '')
export const hostLabel = host => shortHost(typeof host === 'string' ? host : host?.host || '').toUpperCase()
export const hostsFor = row => (Array.isArray(row.hosts) ? row.hosts : []).map(hostLabel).filter(Boolean).join(', ')
export const pressureHostsFor = (row, metric) => (row.pressure_overlap?.[metric + '_pressure_hosts'] || []).map(hostLabel).filter(Boolean).join(', ')
export const when = value => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit',
    minute: '2-digit', hour12: false,
  }).format(date) + ' WIB'
}
export function relatedMonthlyErrorCodes(row, errorEvidence = {}) {
  if (errorEvidence.status === 'ERROR_SOURCE_NOT_RETAINED') return '—'
  const identity = String(row.consumer_key || '').toUpperCase()
  const type = String(row.consumer_type || '').toUpperCase()
  const linked = (errorEvidence.top_errors || []).filter(item =>
    (type === 'PROGRAM' && item.program_link === 'EXPLICIT_ERROR_PROGRAM' &&
      String(item.program || '').toUpperCase() === identity) ||
    (type === 'JOB' && (item.job_names || []).some(name => String(name).toUpperCase() === identity))
  )
  return [...new Set(linked.map(item => item.error_code).filter(Boolean))].join(', ') || '—'
}

export const monthlySize = bytes => {
  if(bytes===null || bytes===undefined || !Number.isFinite(Number(bytes)))return 'Not Collected'
  const unit=Number(bytes)>=1e12?'TB':'GB'
  return fmt(Number(bytes)/(unit==='TB'?1e12:1e9),2)+' '+unit
}
export const MONTHLY_STORAGE_ROWS=['File System OS','FS SAP Archive','Archive INTF','INTF']
export const MONTHLY_STORAGE_REASON={
  MAPPING_NOT_CONFIGURED:'Host/mount mapping not configured',
  NO_MONTHLY_INFRA_HISTORY:'No Infrastructure filesystem samples in the reporting month',
  NO_WEEKLY_INFRA_HISTORY:'No Infrastructure filesystem samples in the reporting week',
  NO_CUSTOM_INFRA_HISTORY:'No Infrastructure filesystem samples in the selected dates',
  MAPPED_MOUNT_NOT_COLLECTED:'Mapped host/mount not found in the reporting period',
  INCOMPLETE_FILESYSTEM_FIELDS:'Incomplete saved capacity fields',
}
export const monthlyStorageNote=(storage,loading,error)=>{
  if(error)return 'Storage source unavailable'
  if(loading || !storage)return 'Checking historical storage…'
  const rows=storage.items||[]
  const missing=rows.filter(row=>row.status!=='COLLECTED')
  if(!missing.length)return '4 of 4 filesystems collected'
  const missingMap=missing.filter(row=>row.reason==='MAPPING_NOT_CONFIGURED').length
  if(missingMap)return missingMap+' filesystem mapping'+(missingMap===1?'':'s')+' not configured'
  if(!storage.source_rows)return 'No Infrastructure filesystem samples for this '+(storage.start_date?'custom period':storage.week_start?'week':'month')
  return (rows.length-missing.length)+' of '+rows.length+' collected · '+(MONTHLY_STORAGE_REASON[missing[0].reason]||'Historical source incomplete')
}

export function savedPeriodPeak(pressure,metric,month,weekStart,customStart=null,customEnd=null) {
  const field='peak_'+metric+'_pct'
  const end=weekStart?new Date(Date.parse(weekStart+'T00:00:00Z')+7*86400000).toISOString().slice(0,10):null
  const rows=(pressure?.daily_hosts||[]).filter(row=>{
    const date=String(row.day||'').slice(0,10)
    return (customStart?date>=customStart&&date<=customEnd:
      weekStart?date>=weekStart&&date<end:date.startsWith(month+'-')) &&
      row[field]!==null && row[field]!==undefined && Number.isFinite(Number(row[field]))
  })
  if(!rows.length)return null
  const winner=rows.reduce((best,row)=>Number(row[field])>Number(best[field])?row:best)
  return {value:Number(winner[field]),host:hostLabel(winner.host),at:winner['peak_'+metric+'_at']||null}
}

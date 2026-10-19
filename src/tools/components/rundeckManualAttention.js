// Session-only manual operator review. These marks are not SAP statuses.
export function attentionKey(row={}) {
  const bits=[row.host,row.consumer_type,row.consumer_key].map(v=>String(v||'').trim())
  return bits.every(Boolean)?JSON.stringify([bits[0].toUpperCase(),bits[1].toUpperCase(),bits[2]]):''
}
export function attentionSnapshot(row={},context=null,name='',description='') {
  const id=attentionKey(row);if(!id)return null
  const num=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v)
  return {id,host:row.host||'',type:row.consumer_type||'',name:name||row.consumer_key||'',description,
    cpu:num(row.cpu_pct),pss:num(row.details?.total_pss_gb??row.details?.pss_gb),
    processes:num(context?.processes),wp:context?.wp||'',observedAt:row.collected_at||'',
    collectionId:row.collection_id||'',markedAt:new Date().toISOString(),context}
}
export function attentionCsv(rows=[]){
  const quote=v=>{let t=String(v??'').replace(/[\r\n]+/g,' ');if(/^\s*[=+@-]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"'}
  return '\ufeff'+[['APP','JOB/PROGRAM','TYPE','CPU MULTICORE %','PSS GB','PROCESSES','WP','OBSERVED','COLLECTION','MARKED','NOTE'],
    ...rows.map(r=>[r.host,r.name,r.type,r.cpu,r.pss,r.processes,r.wp,r.observedAt,r.collectionId,r.markedAt,'MANUAL MARK NOT SAP STATUS'])]
      .map(row=>row.map(quote).join(',')).join('\r\n')
}
export function attentionChecklist(rows=[]){
  return ['SPHERE Manual Process Attention (not SAP execution status)',
    ...rows.map((r,i)=>`${i+1}. [ ] ${r.host} | ${r.name} | CPU ${r.cpu??'—'}% multicore | PSS ${r.pss??'—'} GB | ${r.wp||'—'} | ${r.observedAt||'time unavailable'}`),
    'Confirm job execution separately in SM37.'].join('\n')
}

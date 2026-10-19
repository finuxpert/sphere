import React from 'react'
import {createPortal} from 'react-dom'
import {formatWib,numberText,shortHost} from './sapUiFormat.js'
import {attentionChecklist,attentionCsv} from './rundeckManualAttention.js'
import './RundeckManualAttention.css'
const n=(x,d=1)=>x==null?'—':numberText(x,d)
export default function RundeckManualAttention({open,rows,preview,onClose,onRemove,onClear,onOpenJob}) {
 const dialog=React.useRef(null),close=React.useRef(null)
 const [focused,setFocused]=React.useState('')
 const [message,setMessage]=React.useState('')
 const item=rows.find(r=>r.id===focused)||preview||rows[0]||null
 React.useEffect(()=>{
   if(!open)return undefined
   const last=document.activeElement,overflow=document.body.style.overflow
   document.body.style.overflow='hidden';close.current?.focus()
   const key=event=>{
     if(event.key==='Escape'){event.preventDefault();onClose();return}
     if(event.key!=='Tab')return
     const buttons=[...dialog.current.querySelectorAll('button:not(:disabled)')]
     if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1)?.focus()}
     else if(!event.shiftKey&&document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0]?.focus()}
   }
   document.addEventListener('keydown',key)
   return ()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;if(last?.isConnected)last.focus()}
 },[open,onClose])
 if(!open||typeof document==='undefined')return null
 const copy=async()=>{try{await navigator.clipboard.writeText(attentionChecklist(rows));setMessage('Checklist copied')}catch{setMessage('Clipboard unavailable; use CSV')}}
 const download=()=>{
   const url=URL.createObjectURL(new Blob([attentionCsv(rows)],{type:'text/csv;charset=utf-8'}))
   const a=document.createElement('a');a.href=url;a.download='sphere-manual-attention.csv';document.body.appendChild(a);a.click();a.remove()
   window.setTimeout(()=>URL.revokeObjectURL(url),1200);setMessage('CSV exported')
 }
 return createPortal(<div className="sphereAttentionScrim" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <aside className="sphereAttentionDrawer" ref={dialog} role="dialog" aria-modal="true" aria-label="Manual Process Attention">
   <header><div><strong>Process Attention</strong><small>Manual checklist · not SAP job status</small></div><button type="button" ref={close} onClick={onClose} aria-label="Close Attention List">✕</button></header>
   <div className="sphereAttentionScroll">
    <section className="sphereAttentionLens" aria-label="Observation Lens">
     <span>OBSERVATION LENS · SAVED WORKLOAD</span>
     {item?<><strong title={item.description||item.name}>{item.name}</strong>
      <small>{shortHost(item.host)} · {item.wp||'WP unknown'} · {item.observedAt?formatWib(item.observedAt,true)+' WIB':'time unknown'}</small>
      <div className="sphereAttentionStats">
       <div><small>CPU multi-core</small><b>{n(item.cpu)}{item.cpu==null?'':'%'}</b></div>
       <div><small>PSS workload</small><b>{n(item.pss,2)}{item.pss==null?'':' GB'}</b></div>
       <div><small>Processes</small><b>{n(item.processes,0)}</b></div>
      </div>
      <div className="sphereAttentionLensActions">
       {item.context&&<button type="button" onClick={()=>{onClose();onOpenJob?.(item)}}>Process Details ↗</button>}
       {rows.some(row=>row.id===item.id)&&<button type="button" onClick={()=>onRemove(item.id)}>Remove mark</button>}
      </div>
     </>:<p>Centang observasi pada Current untuk menambahkan.</p>}
    </section>
    <div className="sphereAttentionListTitle"><b>Attention List</b><small>{rows.length} marked</small></div>
    <div className="sphereAttentionItems">
     {rows.map(row=><div className={'sphereAttentionItem'+(row.id===item?.id?' active':'')} key={row.id}>
      <button type="button" className="sphereAttentionItemOpen" onClick={()=>setFocused(row.id)}>
       <b>{row.name}</b><small>{shortHost(row.host)} · CPU {n(row.cpu)}% · PSS {n(row.pss,2)} GB</small>
       <small>Observed {row.observedAt?formatWib(row.observedAt,true)+' WIB':'time unknown'}</small>
      </button>
      <button type="button" onClick={()=>onRemove(row.id)} aria-label={'Unmark '+row.name}>×</button>
     </div>)}
     {!rows.length&&<p>No manually marked workloads.</p>}
    </div>
   </div>
   <footer><div className="sphereAttentionButtons"><button type="button" disabled={!rows.length} onClick={copy}>Copy checklist</button><button type="button" disabled={!rows.length} onClick={download}>Export CSV</button><button type="button" disabled={!rows.length} onClick={onClear}>Clear list</button></div>
    <small>Session-only marks. CPU multicore can exceed 100%. Marking does not affect SAP, Rundeck or saved evaluation statuses; verify SM37 separately.</small>
    {message&&<span role="status">{message}</span>}
   </footer>
  </aside>
 </div>,document.body)
}

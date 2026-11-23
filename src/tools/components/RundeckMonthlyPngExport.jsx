/* Purely UI-side PNG export. The same saved management report is rendered to
 * a temporary DOM node; no network reads, data transforms or backend changes.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import MonthlyManagementDashboard from './RundeckMonthlyManagement.jsx'
import { monthlyEnterpriseReportModel } from './rundeckMonthlyEnterprisePdf.js'

const loadTimeHostTrend=()=>import('./RundeckMonthlyTimeHostTrend.jsx')

export async function buildManagementMonthlyPng({month,data}) {
  if(typeof document==='undefined')throw Error('PNG export requires a browser')
  await import('./RundeckMonthlyPptExport.css')
  if(Array.isArray(data?.monthly_pressure?.trend_hosts))await loadTimeHostTrend()
  const model=monthlyEnterpriseReportModel(month,data)
  const mount=document.createElement('section')
  mount.className='sphereMonthlyReview is-v2 sphereMonthlyPptExport'
  document.body.appendChild(mount)
  const root=createRoot(mount)
  try {
    const base=import.meta.env.BASE_URL||'/'
    const logo=new URL(base+'branding/logo/sphere-logo-horizontal-light.png',window.location.origin).href
    flushSync(()=>root.render(<div className="sphereMonthlyPptFrame">
      <header className="sphereMonthlyPptHeader">
        <img src={logo} alt="SPHERE"/>
        <div className="sphereMonthlyPptTitle"><strong>{model.customStart?'SAP Custom Performance Report':model.weekStart?'SAP Weekly Performance Report':'SAP Monthly Performance Report'}</strong>
          <span>{model.period.label}</span></div>
      </header>
      <MonthlyManagementDashboard month={month} weekStart={model.weekStart}
        customStart={model.customStart} customEnd={model.customEnd}
        full={data} preview={null} storage={data.monthly_storage} loading={false}/>
    </div>))
    const brand=mount.querySelector('.sphereMonthlyPptHeader img')
    if(brand)await brand.decode()
    await document.fonts.ready
    // The intraday chunk was preloaded before render; give React its paint frame.
    if(Array.isArray(data?.monthly_pressure?.trend_hosts))
      await new Promise(resolve=>window.requestAnimationFrame(resolve))
    // Detect clipped content; refuse a misleading image rather than hiding rows.
    for(const panel of mount.querySelectorAll('.sphereMonthlyManagerPanel')) {
      if(panel.scrollHeight>panel.clientHeight+2 || panel.scrollWidth>panel.clientWidth+2) {
        throw Error('PNG slide panel overflows: '+(panel.querySelector('h4')?.textContent||'unknown'))
      }
    }
    const {default:html2canvas}=await import('html2canvas')
    const canvas=await html2canvas(mount,{
      width:1280,height:720,scale:1.5,backgroundColor:'#ffffff',
      useCORS:true,logging:false,
    })
    if(canvas.width!==1920||canvas.height!==1080)throw Error('Invalid 16:9 PNG dimensions')
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>
      blob?resolve(blob):reject(Error('PNG encoding failed')),'image/png'))
  } finally {
    root.unmount()
    mount.remove()
  }
}

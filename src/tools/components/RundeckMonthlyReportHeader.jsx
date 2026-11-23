/* Controlled Reports header: period picker and export actions.
 * Business state and resource fetching remain in RundeckMonthlyReview.
 */
import React from 'react'
import { monthlyReportPeriod } from './rundeckMonthlyPeriod.js'

export default function RundeckMonthlyReportHeader({
  showTitle, month, requestedWeek, requestedStart, requestedEnd,
  reportMode, weekStart, selectedMonth, draftStart, draftEnd, setDraftStart,
  setDraftEnd, changePeriod, applyCustom, customDateError, MONTHS, WEEKS,
  TODAY_WIB, completedData, staleSnapshot, pdfBusy, pdfUrl, pdfMode,
  exportStem, setEvidenceOpen, previewPdf, loading, preview,
}) {
  return <div className="sphereMonthlyHead">
      {showTitle && <div className="sphereMonthlyReportTitle"><strong>SAP Performance Report</strong><small>{monthlyReportPeriod(month,{weekStart:requestedWeek,customStart:requestedStart,customEnd:requestedEnd}).label}</small></div>}
      <div className="sphereMonthlyHeaderControls">
      <div className="sphereMonthlyPicker d-flex align-items-end gap-2">
        <div><label htmlFor="sphere-period-mode">Report period</label>
          <select className="form-select form-select-sm" id="sphere-period-mode" value={reportMode}
            onChange={event=>changePeriod(event.target.value,event.target.value==='week'?weekStart:selectedMonth)}>
            <option value="month">Monthly</option><option value="week">Weekly</option><option value="custom">Custom</option>
          </select></div>
        {reportMode==='custom' ? <>
          <div><label htmlFor="sphere-custom-start">Start date (WIB)</label>
            <input className="form-control form-control-sm" type="date" id="sphere-custom-start"
              max={TODAY_WIB} value={draftStart} onChange={event=>setDraftStart(event.target.value)}/></div>
          <div><label htmlFor="sphere-custom-end">End date (WIB)</label>
            <input className="form-control form-control-sm" type="date" id="sphere-custom-end"
              min={draftStart} max={TODAY_WIB} value={draftEnd} onChange={event=>setDraftEnd(event.target.value)}/></div>
          <button type="button" className="btn btn-sm btn-outline-info"
            disabled={Boolean(customDateError(draftStart,draftEnd))}
            onClick={applyCustom}>Apply</button>
        </> : reportMode==='week' ? <div><label htmlFor="sphere-week-choice">Reporting week (WIB)</label>
          <select className="form-select form-select-sm" id="sphere-week-choice" value={weekStart}
            onChange={event=>changePeriod('week',event.target.value)}>
            {WEEKS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
          </select></div> : <div><label htmlFor="sphere-month-choice">Reporting month</label>
          <select className="form-select form-select-sm" id="sphere-month-choice" value={selectedMonth}
            onChange={event=>changePeriod('month',event.target.value)}>
            {MONTHS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
          </select></div>}
      </div>
      <div className="sphereMonthlyReportActions sphereMonthlyOnePageActions" role="group" aria-label="Report actions">
      <button type="button" className="btn btn-sm" onClick={() => setEvidenceOpen(true)} disabled={!completedData}>Detailed Evidence</button>
      <button type="button" className="is-primary" disabled={pdfBusy || !completedData || staleSnapshot} onClick={()=>previewPdf('management')}>
        {pdfBusy?'Generating…':'Generate PDF 16:9'}
      </button>
      <button type="button" className="btn btn-sm" disabled={pdfBusy || !completedData || staleSnapshot} onClick={()=>previewPdf('png')}>Generate PNG 16:9</button>
       <button type="button" className="btn btn-sm" disabled={pdfBusy || !completedData || staleSnapshot} onClick={()=>previewPdf('print-a3')}>Generate PDF A3</button>
      {pdfUrl && <a className="sphereMonthlyDownload" href={pdfUrl}
         download={pdfMode==='technical'?'SPHERE-Monthly-Technical-Review-'+month+'.pdf'
           :exportStem+(pdfMode==='png'?'-16x9.png':pdfMode==='print-a3'?'-A3.pdf':'-16x9.pdf')}>
         Download {pdfMode==='png'?'PNG 16:9':pdfMode==='print-a3'?'PDF A3':pdfMode==='technical'?'Technical PDF':'PDF 16:9'}</a>}
      </div>
      {loading&&preview&&<small className="sphereMonthlyInlineStatus" role="status">Loading Jobs & Programs…</small>}
      </div>
    </div>
}

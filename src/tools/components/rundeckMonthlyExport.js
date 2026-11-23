/* Source-scoped evidence and request gating are handled by the Reports
 * controller. This renderer never fetches API data or mutates backend state.
 */
import { buildManagementMonthlyPdf } from './rundeckMonthlyEnterprisePdf.js'
import { buildManagementMonthlyPng } from './RundeckMonthlyPngExport.jsx'

export async function buildMonthlyReportArtifact({reportType,month,exportData}) {
  // Keep the large technical exporter lazy so normal Reports startup stays lean.
  const technicalPdf=async()=>{
    const {buildMonthlyPdf}=await import('./rundeckMonthlyPdf.js')
    return buildMonthlyPdf({month,data:exportData})
  }
  return reportType==='png'
    ? buildManagementMonthlyPng({month,data:exportData})
    : reportType==='management'
      ? buildManagementMonthlyPdf({month,data:exportData})
      : reportType==='print-a3'
        ? buildManagementMonthlyPdf({month,data:exportData,format:'a3'})
        : technicalPdf()
}

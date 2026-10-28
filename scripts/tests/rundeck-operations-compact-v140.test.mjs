import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source=name=>readFileSync(new URL('../../src/tools/components/'+name, import.meta.url),'utf8')
test('four-area monitoring remains separate from source-specific investigation',()=>{
 const core=source('RundeckMonitoringHistoryCore.jsx')
 const shell=source('RundeckMonitoringHistory.jsx')
 assert.match(core,/<RundeckUnifiedAppInfrastructure/)
 assert.match(core,/<RundeckServerTrend/)
 assert.match(core,/<RundeckWorkloadHealth/)
 assert.match(shell,/RundeckOperationsCompactV140\.css/)
 assert.match(shell,/type: 'job'/)
})
test('Report tab generates PDF without duplicated summary cards or a second click',()=>{
 const ui=source('RundeckMonthlyReview.jsx')
 assert.match(ui,/tab==='report' && data && !loading && !pdfBusy && !pdfUrl && !pdfError/)
 assert.match(ui,/void previewPdf\(\)/)
 assert.match(ui,/pdfInFlightRef\.current/)
 assert.match(ui,/<iframe title="SPHERE monthly PDF preview"/)
 assert.match(ui,/monthly_abap_candidates/)
 assert.match(ui,/MonthlyErrorAnalysis/)
 assert.doesNotMatch(ui,/sphereMonthlyReportOverview|MonthlyDashboardKpis/)
})
test('compact events and infrastructure keep timestamps, freshness and source lineage',()=>{
 const events=source('RundeckEvidenceTimeline.jsx')
 const infra=source('RundeckInfrastructure.jsx')
 assert.match(events,/!paired && <div className=\{\x60rundeckEvidenceTimingStrip/)
 assert.match(events,/Issue first observed:/)
 assert.match(events,/eventRelation\(event\.at, issueAt, threshold, event\.source\)/)
 assert.match(events,/Timestamp sources/)
 assert.match(infra,/collection_id/)
 assert.match(infra,/freshness==='UNKNOWN'/)
 assert.match(infra,/belongsToSnapshot/)
})

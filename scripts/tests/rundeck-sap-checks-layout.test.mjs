import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source=(name)=>readFileSync(new URL('../../src/tools/components/'+name,import.meta.url),'utf8')

test('SAP Checks uses one full-width issue workspace below a compact technical strip',()=>{
 const css=source('RundeckSapChecksLayout.css')
 const ui=source('RundeckMonitoringHistory.jsx')
 assert.match(css,/DEV v1\.35\.20 — SAP Checks is one investigation/)
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/)
 assert.match(css,/grid-template-columns:minmax\(285px,1\.5fr\) minmax\(0,1\.6fr\) minmax\(120px,\.7fr\)!important/)
 assert.match(css,/\.rundeckAvailabilityDetailSections/)
 assert.match(css,/\.rundeckIssueIndicatorTableWrap/)
 assert.match(css,/@media \(max-width:1040px\)/)
 assert.match(ui,/Technical checks <small>Service Availability source<\/small>/)
 assert.match(ui,/Current Issues <small>APP signals and retained incidents<\/small>/)
})

test('SAP Checks preserves independent sources, incident history, SM37 unknown state and host drilldown',()=>{
 const ui=source('RundeckMonitoringHistory.jsx')
 const availability=source('RundeckAvailability.jsx')
 const issues=source('RundeckSapIssues.jsx')
 assert.match(ui,/summaryRoot=\{availabilitySummaryRoot\}/)
 assert.match(ui,/readinessRoot=\{readinessSummaryRoot\}/)
 assert.match(ui,/setActiveOverlay\(\{ type: 'app', app: context/)
 assert.match(availability,/data\?\.execution_id/)
 assert.match(issues,/FULL_EVALUATED_POPULATION|Current SAP issues|Current indicator status/)
 assert.match(issues,/sapIssueSampleFreshness\(data\.hosts,latestHost,nowMs\)/)
 assert.match(issues,/SM37 readiness/)
 assert.match(issues,/incidentItems\.map/)
 assert.match(issues,/visibleIndicators\.map/)
})

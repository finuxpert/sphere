import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sapWorkloadState } from '../../src/tools/components/rundeckStatusSemantics.js'

const source=(name)=>readFileSync(new URL('../../src/tools/components/'+name,import.meta.url),'utf8')

test('SAP Checks uses a two-column desktop overview and one-column narrow layout',()=>{
 const css=source('RundeckSapChecksLayout.css')
 const ui=source('RundeckMonitoringHistory.jsx')
 assert.match(css,/v1\.35\.22 — concise source-backed SAP Checks overview/)
 assert.match(css,/grid-template-columns:minmax\(295px,\.90fr\) minmax\(0,1\.10fr\)!important/)
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/)
 assert.match(css,/\.rundeckAvailabilityDetailSections/)
 assert.match(css,/\.rundeckIssueIndicatorTableWrap/)
 assert.match(css,/@media\(max-width:1040px\)/)
 assert.match(ui,/Technical checks <small>Service Availability source<\/small>/)
 assert.match(ui,/Current Issues <small>APP signals and retained incidents<\/small>/)
 assert.match(ui,/ref=\{setIncidentHistoryRoot\}/)
 assert.match(ui,/historyRoot=\{incidentHistoryRoot\}/)
})

test('SAP Checks preserves independent sources, source timestamps, retained incidents and drilldown',()=>{
 const ui=source('RundeckMonitoringHistory.jsx')
 const availability=source('RundeckAvailability.jsx')
 const issues=source('RundeckSapIssues.jsx')
 assert.match(ui,/summaryRoot=\{availabilitySummaryRoot\}/)
 assert.match(ui,/readinessRoot=\{readinessSummaryRoot\}/)
 assert.match(ui,/setActiveOverlay\(\{ type: 'app', app: context/)
 assert.match(availability,/data\?\.execution_id/)
 assert.match(availability,/lastSnapshot = stale \|\| unverified/)
 assert.match(availability,/HANA DB/)
 assert.match(availability,/WEB HTTP/)
 assert.match(issues,/sapIssueSampleFreshness\(data\.hosts,latestHost,nowMs\)/)
 assert.match(issues,/SM37 readiness/)
 assert.match(issues,/incidentItems\.map/)
 assert.match(issues,/displayedIndicators\.map/)
 assert.match(issues,/rundeckSapChecksHistoryDisclosure/)
 assert.match(issues,/createPortal\(historyContent, historyRoot\)/)
 assert.match(issues,/visibleIndicators\.slice\(0,5\)/)
 assert.match(issues,/filtersExpanded && <div className="rundeckIssueFilters"/)
 assert.match(issues,/APP Critical WP: Attention 1–2/)
 assert.match(issues,/!paired && <th>Basis Check<\/th>/)
 assert.match(issues,/!paired && <td>\{row\.reason\}<\/td>/)
 assert.match(issues,/row\.status==='UNKNOWN'/)
 assert.doesNotMatch(issues,/row\.current_severity\|\|row\.severity/)
})

test('Critical WP severity follows the same current sample and threshold',()=>{
 assert.equal(sapWorkloadState({wp_critical:0}),'NORMAL')
 assert.equal(sapWorkloadState({wp_critical:1}),'ATTENTION')
 assert.equal(sapWorkloadState({wp_critical:2}),'ATTENTION')
 assert.equal(sapWorkloadState({wp_critical:3}),'CRITICAL')
 assert.equal(sapWorkloadState({wp_critical:null}),'UNKNOWN')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = filename => readFileSync(new URL('../../src/tools/components/' + filename, import.meta.url),'utf8')

test('APP card is a one-click route, with no second dashboard host selector or secondary toolbar',()=>{
  const cards=read('RundeckUnifiedAppInfrastructure.jsx')
  assert.match(cards,/onClick=\{\(\) => \{ selectApp\(key\); onInspectApp\?\.\(/)
  assert.doesNotMatch(cards,/rundeckUnifiedAppInfraDetail|Inspect SAP|<select/)
})

test('SAP+Infrastructure modal preserves host provenance, freshness and workload drilldown',()=>{
  const workspace=read('RundeckUnifiedAppAnalysis.jsx')
  const infrastructure=read('RundeckInfrastructure.jsx')
  assert.match(workspace,/RundeckAppServerAnalysis/)
  assert.match(workspace,/RundeckInfrastructure/)
  assert.match(workspace,/lockedHost/)
  assert.match(workspace,/hideHostCards/)
  assert.match(workspace,/performanceVerified/)
  assert.match(infrastructure,/const target=lockedHost \? selectedHost/)
  assert.match(infrastructure,/trendData\.scope===trendScope/)
})

test('every analysis overlay is modal, traps focus, handles Escape and restores body scroll',()=>{
  const drawer=read('RundeckWorkspaceDrawer.jsx')
  const geometry=read('RundeckUnifiedModalPolish.css')
  assert.match(drawer,/const isModal = true/)
  assert.match(drawer,/aria-modal=\{isModal\}/)
  assert.match(drawer,/isModal && <div className="rundeckWorkspaceModalBackdrop"/)
  assert.match(drawer,/event\.key === 'Escape'/)
  assert.match(drawer,/event\.key !== 'Tab'/)
  assert.match(drawer,/first\.focus\(\)/)
  assert.match(drawer,/last\.focus\(\)/)
  assert.match(drawer,/document\.body\.style\.overflow = previousOverflow/)
  // Restoring focus must not scroll the mobile visual viewport: this guard
  // complements the actual Android Playwright centering/overflow tests.
  assert.match(drawer,/previousFocus\?\.focus\?\.\(\{\s*preventScroll:\s*true\s*\}\)/)
  assert.match(drawer,/\.rundeckWorkspaceClose'\)\?\.focus\(\{\s*preventScroll:\s*true\s*\}\)/)
  assert.match(geometry,/\.is-evidence,\.is-availability,\.is-issues,\.is-unified-app,\.is-wide/)
  assert.match(geometry,/transform:translate\(-50%,-50%\)!important/)
})

test('flat analysis navigation connects four real destinations with paired history and SAP checks',()=>{
  const evidence=read('RundeckOperationalEvidence.jsx')
  const css=read('RundeckOperatorFlatV1354.css')
  const wrapper=read('RundeckMonitoringHistory.jsx')
  assert.match(evidence,/className="rundeckAnalysisActions"/)
  assert.doesNotMatch(evidence,/className="rundeckAnalysisGroup"/)
  for(const name of ['onOpenEvidence','onOpenIssues','onOpenInfrastructure','onOpenSystemData']){
    assert.ok(evidence.includes(name),'Missing action: '+name)
    assert.ok(wrapper.includes(name+'='),'Missing connected modal: '+name)
  }
  assert.match(evidence,/Open Related Events and Run History/)
  assert.match(wrapper,/title="Related Events & Run History"/)
  assert.match(wrapper,/aria-label="Run history"/)
  assert.match(wrapper,/RundeckObservationHistory/)
  assert.match(wrapper,/title="SAP Checks"/)
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/)
  assert.match(css,/@media\(min-width:640px\) and \(max-width:1099px\)/)
  assert.match(css,/prefers-reduced-motion:reduce/)
  assert.doesNotMatch(wrapper,/rundeckSelectedSecondaryAnalysis|rundeckDrawerAnalysisMenu/)
})

test('historical Trend details are not mislabeled as current server state',()=>{
  const trend=read('RundeckServerTrend.jsx')
  assert.match(trend,/HISTORICAL OBSERVATION/)
  assert.match(trend,/Historical observation at/)
})

test('center modal has a dedicated 220ms keyframe and keeps per-APP host provenance',()=>{
 const css=read('RundeckCockpitPolish.css')
 const motion=read('RundeckOperatorMotion.css')
 const app=read('RundeckUnifiedAppAnalysis.jsx')
 assert.match(motion,/:not\(\.is-unified-app\)/)
 assert.match(css,/sphereUnifiedModalEnter 220ms/)
 assert.match(css,/top:50%!important;left:50%!important/)
 assert.match(css,/transform:translate\(-50%,-50%\)/)
 assert.match(css,/prefers-reduced-motion:reduce/)
 assert.match(app,/shortHost\(infraKey\) === shortHost\(appKey\)/)
 assert.match(app,/sample time UNKNOWN/)
})

test('Workload Health is a full sibling with verified 1D selectable hexagons without 400+1 pagination',()=>{
  const workspace=read('RundeckJobsProgramsWorkspace.jsx')
  const state=read('rundeckWorkloadHealthState.js')
  const ui=read('RundeckWorkloadHealth.jsx')
  const core=read('RundeckMonitoringHistoryCore.jsx')
  const style=read('RundeckOperatorFlatV1354.css')
  assert.match(workspace,/className="rundeckJobsProgramsSplit"/)
  assert.match(workspace,/className="rundeckJobsProgramsHealthSide"/)
  assert.match(workspace,/setReviewJumpToken\(token => token \+ 1\)/)
  assert.match(workspace,/onSelectWorkload=\{onOpenEvaluatedWorkload\}/)
  assert.match(workspace,/setMode\('review'\)/)
  assert.match(ui,/retryTimer = window\.setTimeout/)
  assert.match(ui,/rundeckWorkloadHealthLegend/)
  assert.match(ui,/rundeckWorkloadDotGrid/)
  assert.match(ui,/onClick=\{\(\) => openWorkload\(row\)\}/)
  assert.ok(workspace.indexOf('className="rundeckJobsProgramsWorkspaceBody') < workspace.indexOf('className="rundeckJobsProgramsHealthSide'))
  assert.match(core,/performanceVerified=\{props.sourceQuality\?\.performanceValid/)
  assert.match(ui,/API \+ '\/evaluation\/workloads\?' \+ params\.toString\(\)/)
  assert.match(ui,/workloadHealthPreview\(first\)/)
  assert.match(ui,/validatedWorkloadDots\(first, following, 0, completePageSize\)/)
  assert.match(ui,/first\.page\?\.total !== preview\.total/)
  assert.match(ui,/not SM37 status/)
  assert.doesNotMatch(ui,/DOTS_PER_PAGE|rundeckWorkloadDotPager|rundeckWorkloadHealthBand/)
  assert.match(state,/status === 'REVIEW REQUIRED'/)
  assert.match(state,/status === 'NORMAL'/)
  assert.match(style,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)!important/)
  assert.match(style,/\.rundeckWorkloadDotGrid/)
  assert.match(style,/clip-path:polygon/)
  assert.match(style,/@media screen and \(max-width:1199px\)/)
  assert.doesNotMatch(state,/cpu_pct\s*[><=]+\s*100/)
})

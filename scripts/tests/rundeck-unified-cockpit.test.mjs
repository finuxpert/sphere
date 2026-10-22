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

test('one modal traps focus, handles escape, and restores body scroll',()=>{
  const drawer=read('RundeckWorkspaceDrawer.jsx')
  assert.match(drawer,/size === 'system-data' \|\| size === 'unified-app'/)
  assert.match(drawer,/event\.key === 'Escape'/)
  assert.match(drawer,/document\.body\.style\.overflow = previousOverflow/)
  assert.match(drawer,/previousFocus\?\.focus\?\.\(\)/)
})

test('six tiles are independent bounded cells, not two competing three-column rails',()=>{
  const css=read('RundeckCockpitPolish.css')
  assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/)
  assert.match(css,/display:contents!important/)
  assert.match(css,/overflow:hidden!important/)
  assert.doesNotMatch(read('RundeckMonitoringHistory.css'), /overflow:visible!important/)
  assert.match(read('RundeckMonitoringHistory.jsx'), /rundeckInfrastructureCard/)
  assert.match(css,/repeat\(3,minmax\(0,1fr\)\)/)
  assert.match(css,/prefers-reduced-motion:reduce/)
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

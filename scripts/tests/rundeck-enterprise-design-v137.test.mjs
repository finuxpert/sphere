import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { groupEvaluationsByApp } from '../../src/tools/components/rundeckWorkloadAppLanes.js'

const read = path => readFileSync(new URL('../../src/tools/components/' + path, import.meta.url), 'utf8')

test('enterprise visual design loaded last after historical layout layers', () => {
  const source = read('RundeckMonitoringHistory.jsx')
  const before = source.indexOf("import './RundeckVisualRedesignV136.css'")
  const after = source.indexOf("import './RundeckEnterpriseMonitoringV137.css'")
  assert.ok(before > 0 && after > before)
  const css = read('RundeckEnterpriseMonitoringV137.css')
  for (const piece of ['--v36-bg:#10151c','--v36-panel:#1b242e','--v36-blue:#67a9e7',
    'rundeckTripleTrendGrid', 'rundeckAppEvalSummary', 'is-infrastructure', 'is-sap-checks',
    'is-events', 'sphereMonthlyReview', '@media(max-width:650px)', 'prefers-reduced-motion']) {
    assert.ok(css.includes(piece), 'Enterprise design missing ' + piece)
  }
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|text-shadow/)
})

test('workload APP status distribution is source-backed and only details render individual clickable buttons', () => {
  const lanes = read('RundeckWorkloadAppLanes.jsx')
  const parent = read('RundeckWorkloadHealth.jsx')
  assert.match(lanes, /groupEvaluationsByApp\(rows\)/)
  assert.match(lanes, /lane\.counts\[level\.key\]/)
  assert.match(lanes, /100 \* lane\.counts\[level\.key\] \/ lane\.total/)
  assert.match(lanes, /expandedByLane\[lane\.key\] &&/)
  assert.match(lanes, /aria-expanded=\{Boolean\(expandedByLane\[lane\.key\]\)\}/)
  assert.match(lanes, /onSelectWorkload\?\.\(row\)/)
  assert.match(parent, /viewMode === 'by-app'/)
  const model = groupEvaluationsByApp([
    { consumer_type:'JOB', consumer_key:'A', status:'REVIEW REQUIRED', hosts:['APP1','APP2'] },
    { consumer_type:'JOB', consumer_key:'B', status:'HIGH CPU', hosts:['APP1'] },
    { consumer_type:'PROGRAM', consumer_key:'C', status:'NORMAL', hosts:['APP1'] },
  ])
  const lane = model.lanes.find(item => item.key === 'APP1')
  assert.equal(lane.total, 3)
  assert.equal(lane.counts.review, 1)
  assert.equal(lane.counts.attention, 1)
  assert.equal(lane.counts.normal, 1)
  assert.equal(model.memberships, 4)
})

test('existing SAP evidence semantics remain unchanged in presentation updates', () => {
  const core = read('RundeckMonitoringHistoryCore.jsx')
  const trend = read('RundeckServerTrend.jsx')
  const evidence = read('RundeckEvidenceTimeline.jsx')
  assert.match(core, /<RundeckUnifiedAppInfrastructure/)
  assert.match(core, /<RundeckServerTrend/)
  assert.match(core, /<RundeckWorkloadHealth/)
  assert.match(trend, /InfrastructureGapBand trend=\{technicalTrend\}/)
  assert.match(evidence, /Cause not established/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { evaluationAppKey, evaluationHostKeys, groupEvaluationsByApp } from '../../src/tools/components/rundeckWorkloadAppLanes.js'

test('only explicitly verified AOP APP names are accepted', () => {
  assert.equal(evaluationAppKey('AOPH1PAPPDC'), 'APP1')
  assert.equal(evaluationAppKey('aoph5pappdc.corp.example'), 'APP5')
  assert.equal(evaluationAppKey('APP3'), 'APP3')
  assert.equal(evaluationAppKey('AOPH6PAPPDC'), '')
  assert.equal(evaluationAppKey('unknown'), '')
  assert.equal(evaluationAppKey(null), '')
  assert.deepEqual(evaluationHostKeys({ hosts: ['AOPH1PAPPDC', 'app1', 'APP2'], host: 'APP2' }), ['APP1', 'APP2'])
  assert.deepEqual(evaluationHostKeys({ host_observations: 14, wp_critical: 2 }), [])
})

test('per-APP memberships never change unique global evaluation population', () => {
  const rows = [
    { consumer_type: 'JOB', consumer_key: 'J1', status: 'REVIEW REQUIRED', hosts: ['AOPH1PAPPDC', 'AOPH3PAPPDC'], host_observations: 12 },
    { consumer_type: 'PROGRAM', consumer_key: 'P1', status: 'HIGH CPU', hosts: ['APP1'] },
    { consumer_type: 'PROGRAM', consumer_key: 'P2', status: 'NORMAL', hosts: ['APP2'] },
    { consumer_type: 'JOB', consumer_key: 'J2', status: 'INSUFFICIENT DATA', hosts: [] },
    { consumer_type: 'JOB', consumer_key: 'J3', status: 'NORMAL', hosts: ['UNRECOGNIZED'] },
  ]
  const result = groupEvaluationsByApp(rows)
  const lanes = Object.fromEntries(result.lanes.map(lane => [lane.key, lane]))
  assert.equal(rows.length, 5) // authoritative global total from backend
  assert.equal(result.linkedUnique, 3)
  assert.equal(result.memberships, 4)
  assert.equal(result.multiHost, 1)
  assert.equal(result.unverified, 2)
  assert.equal(lanes.APP1.total, 2)
  assert.equal(lanes.APP1.counts.review, 1)
  assert.equal(lanes.APP1.counts.attention, 1)
  assert.equal(lanes.APP2.counts.normal, 1)
  assert.equal(lanes.APP3.counts.review, 1)
  assert.equal(lanes.APP4.total, 0)
  assert.equal(lanes.APP5.total, 0)
  assert.equal(lanes.UNVERIFIED.counts.unknown, 1)
  assert.equal(lanes.UNVERIFIED.counts.normal, 1)
  assert.equal(result.memberships + result.unverified, 6) // host links, not unique rows
})

test('missing APP host evidence never turns into an invented APP status', () => {
  const result = groupEvaluationsByApp([
    { status: 'HIGH MEMORY', host_observations: 8 },
    { status: 'NORMAL', hosts: null, host: 'other-linux-host' },
  ])
  assert.deepEqual(result.lanes.slice(0, 5).map(lane => lane.total), [0,0,0,0,0])
  assert.equal(result.unverified, 2)
  assert.equal(result.linkedUnique, 0)
  assert.equal(result.memberships, 0)
  assert.equal(groupEvaluationsByApp([]).unverified, 0)
})

test('APP evaluation cockpit hides redundant metadata strips but retains actionable evidence and warnings', () => {
  const read = file => readFileSync(new URL('../../src/tools/components/' + file, import.meta.url), 'utf8')
  const lanes = read('RundeckWorkloadAppLanes.jsx')
  const health = read('RundeckWorkloadHealth.jsx')
  const css = read('RundeckWorkloadAppLanes.css')
  assert.doesNotMatch(lanes, /rundeckAppEvalProvenance|APP rows:|Lane colors reflect/)
  assert.match(lanes, /groupEvaluationsByApp\(rows\)/)
  assert.match(lanes, /lane\.counts\[level\.key\]/)
  assert.match(lanes, /onSelectWorkload\?\.\(row\)/)
  assert.match(health, /viewMode !== 'by-app' && <span/)
  assert.match(health, /Evidence gap · \{insufficient\} insufficient/)
  assert.match(health, /Host data unverified/)
  assert.match(css, /grid-template-rows:auto auto auto!important/)
  assert.doesNotMatch(css, /\.rundeckAppEvalProvenance\{/)
})

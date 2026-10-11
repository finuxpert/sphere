import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveTrendFocus, trendFocusStyle, trendHostColorIndex, trendFocusHosts } from '../../src/tools/components/rundeckTrendFocus.js'

const hosts = ['APP1', 'APP2', 'APP3', 'APP4', 'APP5']

test('selected workload APP is highlighted by default when available', () => {
  assert.equal(resolveTrendFocus(null, 'APP2', hosts), 'APP2')
  assert.equal(resolveTrendFocus(null, 'MISSING', hosts), '')
})

test('operator APP focus overrides the selected workload without changing source identity', () => {
  assert.equal(resolveTrendFocus('APP4', 'APP2', hosts), 'APP4')
  assert.equal(resolveTrendFocus('', 'APP2', hosts), '')
  assert.equal(resolveTrendFocus('BAD', 'APP2', hosts), '')
})

test('focused trace is readable and other traces remain available', () => {
  assert.deepEqual(trendFocusStyle('APP2', 'APP2'), { width: 2.8, opacity: 1, itemOpacity: 1 })
  assert.deepEqual(trendFocusStyle('APP1', 'APP2'), { width: 1.8, opacity: 0.26, itemOpacity: 0.36 })
  assert.deepEqual(trendFocusStyle('APP1', ''), { width: 1.8, opacity: 1, itemOpacity: 1 })
})

test('availability trace uses lower default opacity with unchanged high-contrast focus', () => {
  assert.deepEqual(trendFocusStyle('APP1', '', true),
    { width: 1.5, opacity: 0.72, itemOpacity: 1 })
  assert.deepEqual(trendFocusStyle('APP1', 'APP1', true),
    { width: 2.8, opacity: 1, itemOpacity: 1 })
  assert.deepEqual(trendFocusStyle('APP1', 'APP2', true),
    { width: 1.5, opacity: 0.26, itemOpacity: 0.36 })
})

test('focus rules do not mutate retained samples, observation gaps or operator host list', () => {
  const data = Object.freeze([{ bucket: '2026-10-11T10:00:00+07:00', max_value: 72 }, { bucket: '2026-10-11T10:10:00+07:00', max_value: null }])
  const frozenHosts = Object.freeze([...hosts])
  const before = JSON.stringify(data)
  assert.equal(resolveTrendFocus('APP3', '', frozenHosts), 'APP3')
  assert.equal(trendFocusStyle('APP3', 'APP3').width, 2.8)
  assert.equal(JSON.stringify(data), before)
  assert.deepEqual(data[1], { bucket: '2026-10-11T10:10:00+07:00', max_value: null })
})

test('APP1–APP5 keep stable palette slots when a source APP is missing', () => {
  assert.equal(trendHostColorIndex('APP1'), 0)
  assert.equal(trendHostColorIndex('APP2'), 1)
  assert.equal(trendHostColorIndex('APP5'), 4)
  assert.equal(trendHostColorIndex('APP5', 0), 4)
  assert.equal(trendHostColorIndex('OTHER', 3), 3)
})


test('shared APP focus includes actual AOP hosts before chart samples arrive', () => {
  assert.deepEqual(trendFocusHosts([
    { host: 'AOPH3PAPPDC' }, { host: 'AOPH1PAPPDC' },
    { host: 'AOPH2PAPPDC' }, { host: 'AOPH4PAPPDC' },
    { host: 'AOPH5PAPPDC' },
  ]), ['APP1','APP2','APP3','APP4','APP5'])
})

test('shared APP focus deduplicates inventory and historical hosts without creating synthetic data', () => {
  const live = Object.freeze([{ host: 'APP2' }, { host: 'UNKNOWN' }])
  const saved = Object.freeze([{ host: 'AOPH1PAPPDC' }, { host: 'APP2' }, { host: 'OTHER' }])
  assert.deepEqual(trendFocusHosts(live, saved), ['APP1','APP2'])
  assert.deepEqual(trendFocusHosts([], []), [])
  assert.equal(live[0].host, 'APP2')
})

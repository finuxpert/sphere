import test from 'node:test'
import assert from 'node:assert/strict'
import { workloadRowsThatFit, workloadPagerReserve } from '../../src/tools/components/rundeckWorkloadViewport.js'

test('short desktop preserves actual pager instead of rendering a clipped fourth row', () => {
  assert.equal(workloadRowsThatFit({
    viewportHeight: 850, tableTop: 650, headerHeight: 27, rowHeight: 51,
    reserveBelow: 44, maxRows: 3,
  }), 2)
})
test('taller desktop can use more rows without introducing scroll', () => {
  assert.equal(workloadRowsThatFit({
    viewportHeight: 1080, tableTop: 610, headerHeight: 30, rowHeight: 48,
    reserveBelow: 44, maxRows: 5,
  }), 5)
})
test('small or invalid viewport never claims more than one visible row', () => {
  assert.equal(workloadRowsThatFit({viewportHeight:700,tableTop:690,headerHeight:30,rowHeight:50,maxRows:3}),1)
  assert.equal(workloadRowsThatFit({viewportHeight:0,tableTop:0,headerHeight:0,rowHeight:40}),null)
  assert.equal(workloadRowsThatFit({viewportHeight:800,tableTop:500,headerHeight:30,rowHeight:0}),null)
})

test('reserve tracks measured pager height rather than a fixed 90px', () => {
  assert.equal(workloadPagerReserve(26), 44)
  assert.equal(workloadPagerReserve(52), 68)
  assert.equal(workloadPagerReserve(null), 46)
  assert.equal(workloadRowsThatFit({
    viewportHeight: 920, tableTop: 655, headerHeight: 37, rowHeight: 48,
    reserveBelow: workloadPagerReserve(26), maxRows: 4,
  }), 3)
  assert.equal(workloadRowsThatFit({
    viewportHeight: 850, tableTop: 650, headerHeight: 27, rowHeight: 51,
    reserveBelow: workloadPagerReserve(52), maxRows: 3,
  }), 2)
})

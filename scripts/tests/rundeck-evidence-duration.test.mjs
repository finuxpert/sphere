import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDurationMinutes } from '../../src/tools/components/rundeckEvidenceTiming.js'

test('timing gaps are concise even when observations are days apart',()=>{
  assert.equal(formatDurationMinutes(4080),'2d 20h')
  assert.equal(formatDurationMinutes(61),'1h 1m')
  assert.equal(formatDurationMinutes(15),'15m')
  assert.equal(formatDurationMinutes(0),'0m')
  assert.equal(formatDurationMinutes(-1),'—')
  assert.equal(formatDurationMinutes(null),'—')
})

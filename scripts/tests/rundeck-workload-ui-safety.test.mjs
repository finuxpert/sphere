import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { workloadCpuSignal } from '../../src/tools/components/rundeckWorkloadMetrics.js'
import { workloadDotLayout } from '../../src/tools/components/rundeckWorkloadGrid.js'

test('Review, high PSS and multicore CPU are not automatically CPU anomalies', () => {
  assert.equal(workloadCpuSignal({ status: 'REVIEW REQUIRED', signals: { high_memory: true } }), false)
  assert.equal(workloadCpuSignal({ review_required: true, anomaly_status: 'ABOVE BASELINE' }), false)
  assert.equal(workloadCpuSignal({ cpu_pct: 200 }), false)
  assert.equal(workloadCpuSignal({ details: { resource_pattern: 'HIGH_MEMORY' } }), false)
  assert.equal(workloadCpuSignal({ status: 'HIGH CPU' }), true)
  assert.equal(workloadCpuSignal({ signals: { cpu_spike: true } }), true)
  assert.equal(workloadCpuSignal({ details: { signals: { sustained_high_cpu: true } } }), true)
})

test('verified population fits or provides an explicit Review fallback', () => {
  assert.equal(workloadDotLayout({ count: 392, width: 608, height: 112 }).fits, true)
  const tight = workloadDotLayout({ count: 392, width: 330, height: 90 })
  assert.equal(tight.fits, true)
  assert.ok(tight.size < 10)
  assert.equal(workloadDotLayout({ count: 800, width: 330, height: 90 }).fits, false)
  assert.equal(workloadDotLayout({ count: 0, width: 330, height: 90 }).fits, true)
  assert.equal(workloadDotLayout({ count: 392, width: 0, height: 90 }).fits, false)
})

test('workload UX preserves population evidence and responsive controls', () => {
  const read = name => readFileSync(new URL('../../src/tools/components/' + name, import.meta.url),'utf8')
  assert.match(read('RundeckWorkloadHealth.jsx'), /rundeckWorkloadDistribution/)
  assert.match(read('RundeckWorkloadHealth.jsx'), /INSUFFICIENT DATA/)
  assert.match(read('RundeckOperatorFlatV1354.css'), /--workload-dot-size/)
  assert.match(read('RundeckJobsProgramsWorkspace.jsx'), />Current<\/button>/)
  assert.match(read('RundeckCurrentWorkload.jsx'), /workloadCpuSignal\(row\)/)
  assert.doesNotMatch(read('RundeckCurrentWorkload.jsx'), /hasReviewSignal\(/)
})

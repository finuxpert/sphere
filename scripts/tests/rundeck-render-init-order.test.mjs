import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/tools/components/RundeckServerTrend.jsx', import.meta.url), 'utf8')

test('RundeckServerTrend defines memo dependencies before React invokes callbacks during render', () => {
  const declaration = source.indexOf('const temporalReady = Boolean(')
  assert.ok(declaration > 0, 'temporal readiness declaration must exist')
  const memoNames = ['savedPeak1', 'savedPeak2', 'savedTechnicalPeak']
  for (const name of memoNames) {
    const use = source.indexOf('const ' + name + ' = React.useMemo(() => temporalReady ?')
    assert.ok(use > declaration, name + ' must not reference temporalReady before initialization')
    assert.ok(source.indexOf(name + ' = React.useMemo', declaration) > -1)
  }
})

test('optional canvas remains lazy and must not prevent the monitoring component from rendering', () => {
  assert.match(source, /if \(!temporalReady\) return undefined/)
  assert.match(source, /import\('\.\/rundeckTrendAmbient\.js'\)/)
  assert.match(source, /if \(disposed\) return/)
  assert.match(source, /\.catch\(\(\) => \{/)
  assert.match(source, /className="rundeckTrendChart"/)
})

test('historical queries and SAP evidence checks are unaffected by render-order fix', () => {
  assert.match(source, /displayWindow\?\.from \?\? \(Number\.isFinite\(rangeStart\)/)
  assert.match(source, /connectNulls: false/)
  assert.match(source, /markLine: index === 0 && visibleThresholds\.length/)
  assert.match(source, /markArea: index === 0 && gaps\.length/)
})

test('SPA root has an operator-facing fallback instead of an empty error screen', () => {
  const main = readFileSync(new URL('../../src/main.jsx', import.meta.url), 'utf8')
  const boundary = readFileSync(new URL('../../src/app/SphereAppErrorBoundary.jsx', import.meta.url), 'utf8')
  assert.match(main, /<SphereAppErrorBoundary>/)
  assert.match(main, /<App \/>/)
  assert.match(main, /<\/SphereAppErrorBoundary>/)
  assert.match(boundary, /getDerivedStateFromError/)
  assert.match(boundary, /componentDidCatch/)
  assert.match(boundary, /role="alert"/)
  assert.match(boundary, /Reload dashboard/)
})

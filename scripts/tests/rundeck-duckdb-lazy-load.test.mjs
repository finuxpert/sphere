import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

test('DuckDB JS is loaded on demand when log ranking runs, not in the default LOG bundle', () => {
  const source = read('src/tools/workloadAnalyticsV3.js')
  assert.doesNotMatch(source, /import\s+\*\s+as\s+duckdb\s+from\s+['"]@duckdb\/duckdb-wasm['"]/)
  const aggregate = source.slice(source.indexOf('async function aggregateSnapshotsDuckDb('))
  const asyncImport = aggregate.indexOf("import('@duckdb/duckdb-wasm')")
  const bundleSelect = aggregate.indexOf('duckdb.selectBundle(BUNDLES)')
  assert.ok(asyncImport >= 0 && asyncImport < bundleSelect,
    'DuckDB should be loaded before choosing its worker bundle')
  assert.match(aggregate, /withTimeout\(import\('@duckdb\/duckdb-wasm'\), DUCKDB_TIMEOUT_MS/)
  assert.match(aggregate, /await conn\?\.close\?\.\(\)/)
  assert.match(aggregate, /await db\?\.terminate\?\.\(\)/)
  assert.match(aggregate, /worker\?\.terminate\(\)/)
})

test('Both WASM worker URL variants and JS fallback remain available', () => {
  const source = read('src/tools/workloadAnalyticsV3.js')
  for (const part of ['duckdb-mvp.wasm?url', 'duckdb-eh.wasm?url',
    'duckdb-browser-mvp.worker.js?url', 'duckdb-browser-eh.worker.js?url',
    'aggregateSnapshotsJs(attached)']) {
    assert.ok(source.includes(part), 'Missing required fallback/asset: ' + part)
  }
  const root = read('src/tools/ToolLogWorkspace.jsx')
  assert.match(root, /React\.lazy\(\(\) => import\('\.\/ToolLogAutoSphereV5\.jsx'\)\)/)
})

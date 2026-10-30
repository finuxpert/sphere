import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync('src/tools/ToolLogAutoSphereV5.jsx', 'utf8')

test('Monitoring does not eagerly load manual parser or resource ranking', () => {
  for (const specifier of ['./logAnalysisV15.js', './logSphereEngineV3.js', './workloadAnalyticsV5.js']) {
    const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.doesNotMatch(src, new RegExp('^import\\s+[^\\n]+from\\s+[\\x27\\x22]' + escaped + '[\\x27\\x22]', 'm'),
      specifier + ' must not be loaded during initial Monitoring render')
    assert.ok(src.includes("import('" + specifier + "')"), specifier + ' must remain available on demand')
  }
  assert.match(src, /source === 'automatic' && <RundeckSource onCollection=\{upload\}/)
})

test('Manual upload preserves worker-first parsing, fallback and source-backed ranking', () => {
  const upload = src.slice(src.indexOf('const upload = React.useCallback('))
  const worker = upload.indexOf('parsedAnalysis = await workerParse(input)')
  const fallback = upload.indexOf("import('./logAnalysisV15.js')")
  const engine = upload.indexOf("import('./logSphereEngineV3.js')")
  const rank = upload.indexOf('await rankResources(nextAnalysis, nextRca)')
  assert.ok(worker >= 0 && fallback > worker && engine > fallback && rank > engine)
  assert.match(upload, /parsedAnalysis = buildLogAnalysis\(input\.map\(\(item\) => parseLogText\(item\.text, item\.name\)\)\)/)
  assert.match(src, /const ranked = await rankResourceConsumersV5\(nextAnalysis\?\.processes \|\| \[\], nextRca, nextAnalysis\)/)
  assert.match(src, /setCapabilities\(fallbackCapabilities\)/)
  assert.match(src, /catch \(error\) \{/)
})

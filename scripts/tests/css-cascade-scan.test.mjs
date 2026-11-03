import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { scanCssRules, directStylesheetImports } from '../qa-css-cascade.mjs'

test('same selector in the same at-rule context is an override review candidate', () => {
  const css = '@media(min-width: 800px){.x{color:red}.x{color:blue}}'
  const report = scanCssRules(css)
  assert.equal(report.repeated_context_selector_groups, 1)
  assert.equal(report.extra_rule_blocks, 1)
  assert.equal(report.repeated[0].selector, '.x')
})

test('media-query differences do not become false duplicate-selector findings', () => {
  const css = '.x{color:red}@media(min-width:700px){.x{color:blue}}@media(min-width:900px){.x{color:green}}'
  assert.equal(scanCssRules(css).repeated_context_selector_groups, 0)
})

test('comments, quoted braces and keyframes do not fabricate selector conflicts', () => {
  const css = '/** { ; } */ .box{content:"{ } ;";color:red} @keyframes pulse{from{opacity:0}to{opacity:1}}'
  const report = scanCssRules(css)
  assert.equal(report.repeated_context_selector_groups, 0)
  assert.equal(report.rule_blocks, 1)
})

test('stylesheet import order stays in JSX source order', () => {
  const source = "import './a.css'\nimport Widget from './Widget.jsx'\nimport './b.css'\n"
  assert.deepEqual(directStylesheetImports(source), ['./a.css', './b.css'])
})

test('QA trend focus schedules each test file once', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  const files = [...pkg.scripts['qa:trend-focus'].matchAll(/scripts\/tests\/[^\s]+\.test\.mjs/g)]
    .map(match => match[0])
  assert.equal(files.length, new Set(files).size, 'duplicate test execution wastes CI time')
})

test('Monitoring CSS keeps final evidence styles after redundant declarations are removed', () => {
  const css = readFileSync(new URL('../../src/tools/components/RundeckMonitoringHistory.css', import.meta.url), 'utf8')
  // These source-backed styles are still required. Only earlier, identical
  // selector/context declarations were removed from the stylesheet.
  assert.match(css, /\.rundeckSelectedOperationalEvidence\s*\{\s*margin-top:6px!important;/)
  assert.match(css, /\.rundeckSelectedOperationalEvidence \.rundeckEvidenceCard>em\s*\{\s*margin-top:3px!important;/)
  assert.match(css, /\.rundeckTrendModeNote\s*\{[^}]*white-space:nowrap;/)
  assert.doesNotMatch(css, /\.rundeckSelectedOperationalEvidence\s*\{\s*\}/)
  assert.doesNotMatch(css, /\.rundeckSelectedOperationalEvidence \.rundeckEvidenceCard>em\s*\{\s*\}/)
})


/**
 * Static declaration-level regression checkpoints for the approved DEV CSS.
 * These snapshots intentionally ignore declarations shadowed by a later exact
 * selector/context/property. They are not a rendered-pixel equivalence proof.
 */
function effectiveCssFingerprint(source) {
  const values = new Map()
  const stack = []
  let cursor = 0
  let quote = ''
  let escaped = false
  let comment = false
  const normalize = (value) => value.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim()

  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    const next = source[i + 1]
    if (comment) {
      if (char === '*' && next === '/') { comment = false; i++ }
      continue
    }
    if (quote) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = ''
      continue
    }
    if (char === '/' && next === '*') { comment = true; i++; continue }
    if (char === '"' || char === "'") { quote = char; continue }

    if (char === '{') {
      const label = normalize(source.slice(cursor, i))
      stack.push({
        label,
        open: i,
        scope: stack.filter((item) => item.label.startsWith('@')).map((item) => item.label).join(' > '),
        nested: false,
      })
      if (stack.length > 1) stack.at(-2).nested = true
      cursor = i + 1
    } else if (char === '}') {
      const rule = stack.pop()
      assert.ok(rule, 'unbalanced CSS closing brace')
      if (!rule.label.startsWith('@') && !rule.nested) {
        const declarations = source.slice(rule.open + 1, i)
        for (const match of declarations.matchAll(/(?:^|;)\s*([-\w]+)\s*:\s*([^;]+)(?=;|$)/g)) {
          values.set(rule.scope + '\0' + rule.label + '\0' + match[1], match[2].trim())
        }
      }
      cursor = i + 1
    } else if (char === ';') {
      cursor = i + 1
    }
  }
  assert.equal(stack.length, 0, 'unbalanced CSS opening brace')
  const payload = [...values].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + '\x1f' + value).join('\n')
  let hash = 2166136261 >>> 0
  for (let i = 0; i < payload.length; i++) {
    hash = Math.imul(hash ^ payload.charCodeAt(i), 16777619) >>> 0
  }
  return { hash: hash.toString(16).padStart(8, '0'), keys: values.size }
}

const cssCheckpoints = [
  ['src/tools/components/RundeckInfrastructure.css', '4c87cb53', 552],
  ['src/tools/components/RundeckJobHistory.css', 'a2ae7193', 992],
  ['src/tools/components/RundeckLiveOverview.css', 'dd4fd6bf', 715],
  ['src/tools/components/RundeckWorkspace.css', '1af192cc', 503],
  ['src/app/accessibility-theme-v13412.css', '5431e63e', 917],
  ['src/tools/components/RundeckCockpitHexV13512.css', '0d6e103c', 872],
  ['src/tools/components/RundeckMockupParity.css', 'a2252958', 856],
  ['src/tools/components/RundeckOperatorFlatV1354.css', 'ede2074a', 701],
  ['src/tools/components/RundeckVisualRedesignV136.css', '2b3fdb11', 708],
  ['src/tools/components/RundeckUnifiedExperience20261030.css', '99e84fdc', 767],
  ['src/tools/components/RundeckEvidenceTimeline.css', '1eca1f36', 233],
  ['src/tools/components/RundeckWorkspaceDrawer.css', 'ff5683da', 275],
  ['src/tools/components/RundeckSource.css', 'd113646d', 653],
  ['src/tools/components/RundeckMonitoringHistory.css', '9002c91b', 1335],
]

for (const [path, hash, keys] of cssCheckpoints) {
  test('approved effective CSS declarations: ' + path, () => {
    const css = readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
    assert.deepEqual(effectiveCssFingerprint(css), { hash, keys })
  })
}

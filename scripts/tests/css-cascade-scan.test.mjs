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

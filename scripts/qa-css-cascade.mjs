/**
 * Conservative CSS cascade inventory for SPHERE.
 *
 * This is a lexical audit, not a CSS compiler: repeated selectors are REVIEW
 * candidates only. Never remove a rule based on these numbers alone, because
 * source order, media queries, layers, specificity and runtime state matter.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export function scanCssRules(source) {
  const groups = new Map()
  const stack = []
  let cursor = 0
  let line = 1
  let statementLine = 1
  let quoted = ''
  let escaped = false
  let comment = false

  const stripComments = (value) => value.replace(/\/\*[\s\S]*?\*\//g, '')
  const normalize = (value) => stripComments(value).replace(/\s+/g, ' ').trim()
  const currentContext = () => stack.map(item => item.label).join(' > ')
  const insideKeyframes = () => stack.some(item => /^@(?:-[\w]+-)?keyframes\b/i.test(item.label))

  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    const next = source[i + 1]
    if (char === '\n') line++
    if (comment) {
      if (char === '*' && next === '/') { comment = false; i++ }
      continue
    }
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quoted) quoted = ''
      continue
    }
    if (char === '/' && next === '*') { comment = true; i++; continue }
    if (char === '"' || char === "'") { quoted = char; continue }

    if (char === '{') {
      const label = normalize(source.slice(cursor, i))
      if (label && !label.startsWith('@') && !insideKeyframes()) {
        const context = currentContext()
        const key = context + '\0' + label
        if (!groups.has(key)) groups.set(key, { selector: label, context, lines: [] })
        groups.get(key).lines.push(statementLine)
      }
      stack.push({ label })
      cursor = i + 1
      statementLine = line
    } else if (char === '}') {
      stack.pop()
      cursor = i + 1
      statementLine = line
    } else if (char === ';') {
      cursor = i + 1
      statementLine = line
    }
  }

  const repeated = [...groups.values()]
    .filter(({ lines }) => lines.length > 1)
    .map(({ selector, context, lines }) => ({ selector, context, count: lines.length, lines }))
    .sort((a, b) => b.count - a.count || a.lines[0] - b.lines[0])
  return {
    rule_blocks: [...groups.values()].reduce((count, group) => count + group.lines.length, 0),
    unique_context_selectors: groups.size,
    repeated_context_selector_groups: repeated.length,
    extra_rule_blocks: repeated.reduce((count, group) => count + group.count - 1, 0),
    repeated,
  }
}

export function directStylesheetImports(source) {
  return [...source.matchAll(/^\s*import\s*['"]([^'"]+\.css(?:\?[^'"]*)?)['"]/gm)].map(match => match[1])
}

function main() {
  const root = process.cwd()
  const paths = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean)
  const cssPaths = paths.filter(path => path.startsWith('src/') && path.endsWith('.css'))
  const results = cssPaths.map(path => {
    const content = readFileSync(join(root, path), 'utf8')
    const scan = scanCssRules(content)
    return {
      path,
      bytes: Buffer.byteLength(content, 'utf8'),
      important_declarations: (content.replace(/\/\*[\s\S]*?\*\//g, '').match(/!important\b/g) || []).length,
      rule_blocks: scan.rule_blocks,
      repeated_context_selector_groups: scan.repeated_context_selector_groups,
      extra_rule_blocks: scan.extra_rule_blocks,
      top_repeated: scan.repeated.slice(0, 5),
    }
  })
  results.sort((a, b) => b.extra_rule_blocks - a.extra_rule_blocks || b.bytes - a.bytes)
  const monitoring = 'src/tools/components/RundeckMonitoringHistory.jsx'
  const importOrder = paths.includes(monitoring)
    ? directStylesheetImports(readFileSync(join(root, monitoring), 'utf8'))
    : []
  const report = {
    note: 'Static review candidates only: same-context repeated selectors can be intentional overrides or feature-specific layers.',
    tracked_src_stylesheets: cssPaths.length,
    total_css_bytes: results.reduce((total, row) => total + row.bytes, 0),
    important_declarations: results.reduce((total, row) => total + row.important_declarations, 0),
    repeated_context_selector_groups: results.reduce((total, row) => total + row.repeated_context_selector_groups, 0),
    extra_rule_blocks: results.reduce((total, row) => total + row.extra_rule_blocks, 0),
    monitoring_direct_css_import_order: importOrder,
    top_cascade_review_files: results.slice(0, 12),
  }
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  } else {
    process.stdout.write('=== SPHERE CSS CASCADE AUDIT (READ-ONLY) ===\n')
    process.stdout.write('SRC_CSS=' + report.tracked_src_stylesheets + ' BYTES=' + report.total_css_bytes + '\n')
    process.stdout.write('IMPORTANT=' + report.important_declarations +
      ' REPEATED_CONTEXT_SELECTOR_GROUPS=' + report.repeated_context_selector_groups +
      ' EXTRA_RULE_BLOCKS=' + report.extra_rule_blocks + '\n')
    process.stdout.write('MONITORING_DIRECT_CSS_IMPORTS=' + importOrder.length + '\n')
    for (const path of importOrder) process.stdout.write('  IMPORT ' + path + '\n')
    for (const row of report.top_cascade_review_files) {
      process.stdout.write('  REVIEW ' + row.extra_rule_blocks + ' extra rules / ' +
        row.repeated_context_selector_groups + ' groups / ' +
        row.important_declarations + ' !important: ' + row.path + '\n')
    }
    process.stdout.write('No CSS source files changed or deleted by this audit.\n')
  }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/qa-css-cascade.mjs')) main()

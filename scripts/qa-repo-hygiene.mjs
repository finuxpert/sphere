#!/usr/bin/env node
/** Guard against tracked build debris and accidental stylesheet removal. */
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = new Set(process.argv.slice(2))
const strict = argv.has('--strict')
const cleanLocal = argv.has('--clean-local')
const branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim()
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split('\0').filter(Boolean)
const cssFiles = tracked.filter((p) => p.endsWith('.css'))
const cssSet = new Set(cssFiles)

const generatedFile = (p) => /(^|\/)(?:node_modules|dist|dist-ssr|coverage|test-results|playwright-report|__pycache__|\.pytest_cache|\.ruff_cache|\.mypy_cache)(?:\/|$)/.test(p) || /(?:\.log|\.pyc|\.bak|\.orig|\.rej|\.swp|~)$/.test(p) || /(^|\/)\.env(?:\.[^/]*)?$/.test(p)
const generatedTracked = tracked.filter(generatedFile)
const cssReferenced = new Set()
const unresolvedCssImports = []
// Only scan runtime application source: QA scripts contain literal CSS paths for assertions,
// not imports resolved relative to the QA file itself.
const sourceFiles = tracked.filter((p) =>
  (p.startsWith('src/') && /\.(?:css|jsx?|mjs|tsx?)$/.test(p)) || p === 'index.html'
)
for (const file of sourceFiles) {
  const contents = readFileSync(join(root, file), 'utf8')
  // Scan quoted CSS paths from imports; do not infer usage from class names.
  const literals = contents.matchAll(/["']((?:\.\.?\/|\/src\/)[^"'\n]*?\.css)(?:\?[^"'\n]*)?["']/g)
  for (const match of literals) {
    const spec = match[1]
    const target = spec.startsWith('/src/') ? spec.slice(1) : normalize(join(dirname(file), spec))
    if (cssSet.has(target)) cssReferenced.add(target)
    else unresolvedCssImports.push(file + ' -> ' + spec)
  }
}
const unusedCss = cssFiles.filter((p) => !cssReferenced.has(p))

console.log('=== SPHERE REPOSITORY HYGIENE ===')
console.log('BRANCH=' + branch + ' TRACKED=' + tracked.length + ' CSS=' + cssFiles.length)
console.log('TRACKED_GENERATED=' + generatedTracked.length + ' CSS_UNREFERENCED=' + unusedCss.length + ' CSS_IMPORT_MISSING=' + unresolvedCssImports.length)
for (const [label, list] of [
  ['TRACKED_GENERATED_FILES', generatedTracked],
  ['CSS_UNREFERENCED_REVIEW_ONLY', unusedCss],
  ['CSS_IMPORT_MISSING', unresolvedCssImports],
]) if (list.length) {
  console.log('\n' + label + ':')
  for (const item of list) console.log('  ' + item)
}

// Do not touch dist, backups, credentials, Rundeck artifacts, metrics, or PROD.
const disposable = ['test-results', 'playwright-report', 'coverage', '.eslintcache', '.pytest_cache', '.ruff_cache', '.mypy_cache']
const existing = disposable.filter((name) => existsSync(join(root, name)))
console.log('LOCAL_QA_ARTIFACTS=' + (existing.join(',') || 'none'))
if (cleanLocal) {
  if (branch !== 'rundeck-sphere-dev') {
    console.error('CLEANUP_BLOCKED: only permitted on rundeck-sphere-dev')
    process.exitCode = 1
  } else {
    for (const name of existing) {
      const location = join(root, name)
      if (lstatSync(location).isSymbolicLink()) {
        console.error('SKIPPED_SYMLINK=' + name)
        continue
      }
      rmSync(location, { recursive: true, force: true })
      console.log('REMOVED_LOCAL_QA_ARTIFACT=' + name)
    }
  }
}
if (strict && (generatedTracked.length || unusedCss.length || unresolvedCssImports.length)) {
  console.error('HYGIENE=FAIL (review source references before deleting files)')
  process.exitCode = 1
} else {
  console.log('HYGIENE=' + (generatedTracked.length || unusedCss.length || unresolvedCssImports.length ? 'REVIEW' : 'PASS'))
}

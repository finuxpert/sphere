/**
 * SPHERE CSS hygiene audit. Run from the repository root.
 *
 * Reports tracked custom CSS without static references, byte-identical copies,
 * and total !important declarations. "Unreferenced" is a REVIEW CANDIDATE,
 * not proof of runtime dead code (dynamic imports, legacy routes and exports).
 * Intentionally read-only: never delete styles without browser + regression QA.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, normalize, resolve } from 'node:path'

const root = process.cwd()
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(Boolean).map(value => value.replaceAll('\\', '/'))
const customCss = files.filter(value => /^src\/.*\.css$/i.test(value))
const scanFiles = files.filter(value => /\.(?:[cm]?[jt]sx?|css|html)$/i.test(value))
const references = new Map(customCss.map(value => [value, new Set()]))
const contentByPath = new Map()

for (const file of scanFiles) {
  const abs = join(root, file)
  if (!existsSync(abs)) continue
  const contents = readFileSync(abs, 'utf8')
  contentByPath.set(file, contents)
  // Match literal local CSS URLs in ESM imports, dynamic imports, CSS @imports,
  // CommonJS, or HTML; exclude package imports such as bootstrap/dist/...
  const cssPath = /['"]((?:\.{1,2}\/|\/|src\/)[^'"\n]+?\.css)(?:\?[^'"\n]*)?['"]/g
  for (const [, spec] of contents.matchAll(cssPath)) {
    const resolved = spec.startsWith('src/')
      ? normalize(spec)
      : spec.startsWith('/')
        ? normalize('public' + spec)
        : normalize(resolve(root, dirname(file), spec).slice(root.length + 1))
    const canonical = resolved.replaceAll('\\', '/')
    if (references.has(canonical)) references.get(canonical).add(file)
  }
}

const noStaticImports = customCss.filter(path => references.get(path).size === 0)
const importCandidates = noStaticImports.filter(path => {
  const basename = path.split('/').at(-1)
  // Conservative: even a filename reference in JS, HTML or another CSS file
  // prevents automatic dead-code classification.
  return ![...contentByPath].some(([source, content]) => source !== path && content.includes(basename))
})
const identical = new Map()
for (const file of customCss) {
  const hash = createHash('sha256').update(readFileSync(join(root, file))).digest('hex')
  if (!identical.has(hash)) identical.set(hash, [])
  identical.get(hash).push(file)
}
const duplicates = [...identical.values()].filter(group => group.length > 1)
const important = customCss.reduce((total, file) =>
  total + (contentByPath.get(file)?.match(/!important\b/g)?.length || 0), 0)
const result = {
  bootstrap: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).dependencies?.bootstrap,
  tracked_custom_css: customCss.length,
  statically_referenced_css: customCss.length - noStaticImports.length,
  review_candidates: importCandidates,
  no_static_imports: noStaticImports,
  identical_content_groups: duplicates,
  important_declarations: important,
  notes: [
    'Candidate CSS is not deleted automatically; confirm browser routes, dynamic imports, PDF and theme behavior.',
    'Bootstrap grid compatibility requires visual regression checks before removing vendor/bootstrap-grid.min.css.',
    'Do not change PROD while auditing DEV.'
  ]
}
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
} else {
  process.stdout.write('SPHERE CSS hygiene (read-only)\n')
  process.stdout.write('Bootstrap: ' + result.bootstrap + '\n')
  process.stdout.write('Tracked src CSS: ' + customCss.length + ', statically referenced: ' + result.statically_referenced_css + '\n')
  process.stdout.write('No static imports: ' + noStaticImports.length + ', conservative prune candidates: ' + importCandidates.length + '\n')
  process.stdout.write('Exact duplicate CSS groups: ' + duplicates.length + ', !important declarations: ' + important + '\n')
  for (const file of importCandidates) process.stdout.write('CANDIDATE ' + file + '\n')
  for (const group of duplicates) process.stdout.write('DUPLICATE ' + group.join(' | ') + '\n')
  process.stdout.write('No CSS files have been deleted. Review candidates and run full DEV QA first.\n')
}

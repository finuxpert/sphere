import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../qa-repo-hygiene.mjs', import.meta.url))

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'sphere-hygiene-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const path of ['scripts', 'src/components']) mkdirSync(join(root, path), { recursive: true })
  copyFileSync(script, join(root, 'scripts/qa-repo-hygiene.mjs'))
  writeFileSync(join(root, 'src/main.jsx'), "import './components/active.css'\n")
  writeFileSync(join(root, 'src/components/active.css'), '.active { display: block }\n')
  // Assertions about other files' imports must not be mistaken for imports here.
  writeFileSync(join(root, 'scripts/qa-rundeck-ui-contract.mjs'), 'const testPath = "./components/not-an-import.css"\n')
  writeFileSync(join(root, 'scripts/qa-basis-investigation.mjs'), 'const testPath = "./RundeckMockupParity.css"\n')
  execFileSync('git', ['init', '-q', '-b', 'rundeck-sphere-dev'], { cwd: root })
  execFileSync('git', ['add', '.'], { cwd: root })
  return root
}

function check(root, ...args) {
  return spawnSync(process.execPath, [join(root, 'scripts/qa-repo-hygiene.mjs'), ...args], {
    cwd: root, encoding: 'utf8',
  })
}

test('quoted CSS paths in QA files are not unresolved imports', (t) => {
  const root = fixture(t)
  const result = check(root, '--strict')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /CSS_UNREFERENCED=0 CSS_IMPORT_MISSING=0/)
  assert.match(result.stdout, /HYGIENE=PASS/)
})

test('missing CSS referenced from application source blocks strict QA', (t) => {
  const root = fixture(t)
  writeFileSync(join(root, 'src/main.jsx'), "import './components/active.css'\nimport './components/missing.css'\n")
  const result = check(root, '--strict')
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stdout, /CSS_IMPORT_MISSING=1/)
  assert.match(result.stdout, /src\/main\.jsx -> \.\/components\/missing\.css/)
})

test('tracked unreferenced CSS blocks strict QA', (t) => {
  const root = fixture(t)
  writeFileSync(join(root, 'src/components/orphan.css'), '.orphan {}\n')
  execFileSync('git', ['add', 'src/components/orphan.css'], { cwd: root })
  const result = check(root, '--strict')
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stdout, /CSS_UNREFERENCED=1/)
})

test('local cleanup only removes disposable QA artifacts on DEV', (t) => {
  const root = fixture(t)
  for (const path of ['test-results', 'playwright-report', 'dist', 'backups']) {
    mkdirSync(join(root, path))
    writeFileSync(join(root, path, 'keep.txt'), 'test')
  }
  const result = check(root, '--strict', '--clean-local')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(existsSync(join(root, 'test-results')), false)
  assert.equal(existsSync(join(root, 'playwright-report')), false)
  assert.equal(existsSync(join(root, 'dist/keep.txt')), true)
  assert.equal(existsSync(join(root, 'backups/keep.txt')), true)
  execFileSync('git', ['checkout', '-q', '-b', 'sphere-prod'], { cwd: root })
  mkdirSync(join(root, 'test-results'))
  const blocked = check(root, '--clean-local')
  assert.equal(blocked.status, 1, blocked.stdout + blocked.stderr)
  assert.equal(existsSync(join(root, 'test-results')), true)
  assert.match(blocked.stderr, /CLEANUP_BLOCKED/)
})

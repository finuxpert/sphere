import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const shell = readFileSync('scripts/qa-visual-dev.sh', 'utf8')

test('DEV visual command uses available Chromium checks without requiring Playwright', () => {
  assert.equal(pkg.scripts['qa:visual'], 'bash scripts/qa-visual-dev.sh')
  assert.equal(pkg.scripts['qa:visual:playwright'], 'playwright test -c playwright.config.mjs')
  assert.match(shell, /rundeck-sphere-dev/)
  assert.match(shell, /dist\/index\.html/)
  assert.match(shell, /git rev-parse --short=7 HEAD/)
  assert.match(shell, /bash scripts\/qa-browser-boot\.sh/)
  assert.match(shell, /node scripts\/qa-evaluation-layout\.mjs/)
  assert.match(shell, /PLAYWRIGHT_FULL_SUITE=NOT_RUN/)
  assert.doesNotMatch(shell, /npm (?:ci|install)|apt(?:-get)? install|git push/)
})

test('visual smoke entrypoint is valid Bash', () => {
  const result = spawnSync('bash', ['-n', 'scripts/qa-visual-dev.sh'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})

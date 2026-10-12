#!/usr/bin/env node
/**
 * Fast, build-only SPHERE DEV entry point.
 * Visual acceptance is handled manually on the DEV website.
 * Does not run QA, deploy, change database, or touch PROD.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import process from 'node:process'

const readGit = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const branch = readGit('branch', '--show-current')
if (branch !== 'rundeck-sphere-dev') {
  console.error('BUILD_DEV=BLOCKED wrong branch:', branch)
  process.exit(2)
}
const dirty = readGit('status', '--porcelain')
if (dirty) {
  console.error('BUILD_DEV=BLOCKED dirty worktree; review changes before building')
  process.exit(2)
}
const sha = readGit('rev-parse', '--short=7', 'HEAD')
console.log('SOURCE_BRANCH=' + branch)
console.log('SOURCE_SHA=' + sha)
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, GITHUB_REF_NAME: branch, GITHUB_SHA: sha },
})
if (result.error) {
  console.error('BUILD_DEV=FAIL', result.error.message)
  process.exit(1)
}
if (result.status !== 0 || !existsSync('dist/index.html')) {
  console.error('BUILD_DEV=FAIL')
  process.exit(result.status || 1)
}
console.log('BUILD_DEV=PASS')
console.log('VISUAL_QA=MANUAL')
console.log('DEPLOY=NOT_PERFORMED')
console.log('PROD=UNCHANGED')

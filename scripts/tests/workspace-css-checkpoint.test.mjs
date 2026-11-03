/** Freeze-guard for the production-approved v1.35.20 CSS consolidation.
 * Hashes cover merged declarations in original order, not runtime-generated CSS.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
function fnv32(value) {
  let hash = 2166136261 >>> 0
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

test('application shell keeps exactly the approved merged CSS declarations', () => {
  assert.equal(fnv32(read('src/app/workspace.css')), '1984368c')
  assert.match(read('src/App.jsx'), /import '\.\/app\/workspace\.css'/)
  assert.doesNotMatch(read('src/App.jsx'), /workspace-2026(?:-shell)?\.css/)
})

test('LOG workspace preserves four historical CSS layers in original order', () => {
  assert.equal(fnv32(read('src/tools/LogWorkspace.css')), 'd6b85af7')
  assert.match(read('src/tools/ToolLogWorkspace.jsx'), /import '\.\/LogWorkspace\.css'/)
  for (const basename of ['SphereWorkspaceV153.css','SphereWorkspaceV154.css',
                           'SphereWorkspaceV155.css','SphereWorkspaceV156.css']) {
    assert.doesNotMatch(read('src/tools/ToolLogWorkspace.jsx'), new RegExp(basename.replace('.', '\\.')))
    assert.equal(existsSync(new URL('../../src/tools/' + basename, import.meta.url)), false)
  }
})

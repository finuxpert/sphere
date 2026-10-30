import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(path, 'utf8')
const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const css = read('src/tools/components/RundeckBootstrapFoundation.css')
const wrapper = read('src/tools/components/RundeckMonitoringHistory.jsx')
test('Bootstrap stable lock and React-owned runtime', () => {
 assert.equal(pkg.dependencies.bootstrap,'5.3.8')
 assert.equal(lock.packages[''].dependencies.bootstrap, '5.3.8')
 assert.equal(lock.packages['node_modules/bootstrap']?.version,'5.3.8')
 assert.equal(lock.packages['node_modules/@popperjs/core']?.version,'2.11.8')
 assert.match(css, /bootstrap\.min\.css" layer\(sphere-bootstrap\)/)
 assert.ok(wrapper.indexOf("import './RundeckDevFinalAudit20261030.css'") < wrapper.indexOf("import './RundeckBootstrapFoundation.css'"))
 assert.doesNotMatch(wrapper,/bootstrap\/dist\/js/)
})
test('Bootstrap theme matches dark and light SPHERE', () => {
 assert.match(css,/html\[data-theme="dark"\]/)
 assert.match(css,/html\[data-theme="light"\]/)
 assert.match(css,/sphereBootstrapWorkloadTable/)
 assert.match(css,/form-check-input/)
})

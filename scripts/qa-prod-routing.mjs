import fs from 'node:fs'

const nginx = fs.readFileSync('ops/rundeck/nginx-prod.conf', 'utf8')
const backend = fs.readFileSync('backend/rundeck_api.py', 'utf8')

const checks = [
  ['backend exposes availability history', backend.includes('@app.get("/availability/history")')],
  ['backend exposes analysis evidence', backend.includes('@app.get("/analysis/evidence")')],
  ['PROD routes availability to Rundeck API', nginx.includes('location /api/availability/') && nginx.includes('proxy_pass http://127.0.0.1:8092/availability/;')],
  ['PROD routes analysis evidence to Rundeck API', nginx.includes('location = /api/analysis/evidence') && nginx.includes('proxy_pass http://127.0.0.1:8092/analysis/evidence;')],
  ['Rundeck availability route precedes legacy API fallback', nginx.indexOf('location /api/availability/') >= 0 && nginx.indexOf('location /api/availability/') < nginx.indexOf('location /api/ {')],
  ['analysis evidence route precedes legacy API fallback', nginx.indexOf('location = /api/analysis/evidence') >= 0 && nginx.indexOf('location = /api/analysis/evidence') < nginx.indexOf('location /api/ {')],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (failed.length) {
  console.error(`\n${failed.length} production routing contract check(s) failed.`)
  process.exit(1)
}
console.log('\nProduction routing contract checks passed.')

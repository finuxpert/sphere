import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const file=new URL('../../ops/rundeck/release-ui-dev.sh', import.meta.url)
const script=readFileSync(file,'utf8')
test('DEV UI-only deploy is guarded by exact SHA, clean branch, version and QA build',()=>{
  const syntax=spawnSync('bash',['-n',file.pathname],{encoding:'utf8'})
  assert.equal(syntax.status,0,syntax.stderr)
  for(const marker of ['Pass the exact verified DEV GitHub SHA','rundeck-sphere-dev',
    'git rev-parse HEAD','git status --porcelain', 'APP_VERSION',
    'bash ops/rundeck/qa-build-dev.sh','grep -Rqs "\${EXPECTED:0:7}"',
    'mv -Tf "$WEB_ROOT/.next-$$" "$WEB_CURRENT"']) assert.ok(script.includes(marker),marker)
  assert.doesNotMatch(script,/APP_VERSION" == "1\.35\.6"|rundeck-v1356\.visual\.spec/)
})
test('DEV UI-only release never invokes migrations, pollers, backend restart or DB writes',()=>{
  for(const forbidden of [/\bsystemctl\b/,/\bpg_dump\b/,/\bpsql\b/,/\balembic\b/,/\bmigrate-dev\.sh\b/,
    /\bcollect-now\b/,/\bINSERT INTO\b/,/\bUPDATE\s+\w+\s+SET\b/,/\bDELETE FROM\b/,
    /\bnginx -[st]\b/,/\bdeploy-dev\.sh\b/,/\brelease-dev-fast\.sh\b/])
    assert.doesNotMatch(script,forbidden)
  assert.match(script,/DEV_API_BEFORE=/)
  assert.match(script,/readlink -f \/opt\/sphere-rundeck-dev\/current/)
  assert.match(script,/DB_MIGRATION=SKIPPED BACKEND=UNCHANGED POLLERS=NOT_RESTARTED/)
})
test('DEV UI-only release guards PROD, HTTPS routing, and rolls back any failing smoke',()=>{
  assert.match(script,/trap cleanup EXIT/)
  assert.match(script,/ROLLBACK=RESTORE_PREVIOUS_DEV_WEB/)
  assert.match(script,/mv -Tf "\$WEB_ROOT\/\.rollback-\$\$" "\$WEB_CURRENT"/)
  assert.match(script,/cmp -s "\$STAGED\/index\.html" "\$SMOKE_HTML"/)
  assert.match(script,/sphere\.astraotoparts\.co\.id\/dev\/api\/collections\/latest/)
  assert.match(script,/sphere\.astraotoparts\.co\.id\/api\/collections\/latest/)
  assert.match(script,/readlink -f \/var\/www\/sphere\.astraotoparts\.co\.id\/current/)
  assert.match(script,/sha256sum "\$PROD_WEB\/index\.html"/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = p => readFileSync(new URL('../../'+p,import.meta.url),'utf8')
test('promote CLI targets live DEV release only with operator approval',()=>{
  const cli=read('ops/rundeck/sphere-cli.sh')
  const sh=read('ops/rundeck/promote-ui-prod-current-dev.sh')
  assert.match(cli,/promote-ui-prod-current-dev\.sh/)
  assert.match(sh,/DEV_ACTIVE_RELEASE="\$\(readlink -f "\$DEV_ROOT\/current"/)
  assert.match(sh,/APPROVED="\$\{DEV_ACTIVE_RELEASE##\*\/\}"/)
  assert.match(sh,/merge-base --is-ancestor "\$APPROVED" origin\/rundeck-sphere-dev/)
  assert.match(sh,/PROMOTE DEV \$SHORT TO PROD/)
  assert.doesNotMatch(sh,/POPUP_ACCEPTED_SHA=|REVIEWED_SHA=|2bf89c756/)
})
test('promotion verifies API, does isolated production-base build and rollback',()=>{
  const sh=read('ops/rundeck/promote-ui-prod-current-dev.sh')
  assert.match(sh,/check_api EVALUATION/)
  assert.match(sh,/check_api JOB_SOURCE/)
  assert.match(sh,/GITHUB_REF_NAME=rundeck-sphere-prod GITHUB_SHA="\$APPROVED" npm run build/)
  assert.match(sh,/ROLLBACK=RESTORED_PREVIOUS_PROD_WEB/)
  assert.match(sh,/PROD_BACKEND=UNCHANGED/)
  assert.doesNotMatch(sh,/git push|systemctl restart|alembic upgrade/)
})

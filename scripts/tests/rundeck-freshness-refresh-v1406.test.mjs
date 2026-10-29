import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const load=name=>readFileSync(new URL('../../src/tools/components/'+name,import.meta.url),'utf8')
test('source uses coalesced refresh for polling and collection_ready SSE', () => {
 const source=load('RundeckSource.jsx')
 assert.match(source,/coalesceAsyncRefresh\(async \(\) =>/)
 assert.match(source,/window\.setInterval\(refreshAll, 60000\)/)
 assert.match(source,/source\.addEventListener\('collection_ready', onReady\)/)
 assert.match(source,/collectionAligned \? hosts : \[\]/)
})
test('APP landscape gates individual CPU RAM WP and status on per-host observation', () => {
 const app=load('RundeckUnifiedAppInfrastructure.jsx')
 assert.match(app,/hosts\.map\(host => appSignalState\(host, hostVerified\(host\)\)\)/)
 assert.match(app,/const verified = hostVerified\(host\)/)
 assert.match(app,/const hostCpu = verified \? host\.cpu_pct : null/)
 assert.match(app,/const hostRam = verified \? host\.ram_pct : null/)
 assert.match(app,/const hostWp = verified \? host\.wp_critical : null/)
 assert.match(app,/const selectedFreshness = appSampleFreshness/)
 assert.match(app,/sapSampleFreshness: appSampleFreshness/)
})
test('saved 1D evaluation polls independently with existing validated population guard', () => {
 const app=load('RundeckWorkloadHealth.jsx')
 assert.match(app,/window\.setInterval\(\(\) => setRetryToken\(value => value \+ 1\), 60_000\)/)
 assert.match(app,/const MIN_REFRESH_MS = 5 \* 60 \* 1000/)
 assert.match(app,/validatedWorkloadDots\(first, following, 0, completePageSize\)/)
 assert.match(app,/validatedAppEvaluationMemberships\(verified\.rows, preview\.total\)/)
 assert.match(app,/controller\.abort\(\)/)
})

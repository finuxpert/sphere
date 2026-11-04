/** Dev browser bundle budget based on successful 2026-11-04 CI.
 * Only emitted asset sizes. This does not measure runtime/LCP or SQL latency.
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const BUNDLE_BUDGETS = Object.freeze([
  {prefix: 'ToolLogAutoSphereV5-',suffix:'.css',limitBytes:1200000},
  {prefix: 'ToolLogAutoSphereV5-',suffix:'.js',limitBytes:970000},
  {prefix: 'index-',suffix:'.css',limitBytes:245000},
  {prefix: 'RundeckMonthlyReview-',suffix:'.js',limitBytes:78000},
  {prefix: 'RundeckMonthlyReview-',suffix:'.css',limitBytes:20000},
])

export function assessBundleSizes(entries, budgets=BUNDLE_BUDGETS) {
  const rows=budgets.map(budget=>{
    const matches=entries.filter(entry=>entry.name.startsWith(budget.prefix)&&entry.name.endsWith(budget.suffix))
    return {
      label: budget.prefix+('*')+budget.suffix,
      found: matches.length,
      sizeBytes: matches.length===1 ? matches[0].size : null,
      limitBytes: budget.limitBytes,
      pass: matches.length===1 && matches[0].size <= budget.limitBytes,
    }
  })
  return {pass:rows.every(row=>row.pass),rows}
}

function run() {
  const dir=process.argv.find(arg=>arg.startsWith('--assets-dir='))?.slice('--assets-dir='.length) || 'dist/assets'
  const entries=readdirSync(dir).map(name=>({name,size:statSync(join(dir,name)).size}))
  const result=assessBundleSizes(entries)
  for(const row of result.rows) {
    process.stdout.write('BUNDLE_BUDGET='+ (row.pass?'PASS':'FAIL') +
      ' asset='+row.label+' found='+row.found+' bytes='+row.sizeBytes+
      ' max_bytes='+row.limitBytes+'\n')
  }
  if(!result.pass) process.exitCode=1
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/qa-bundle-budget.mjs')) run()

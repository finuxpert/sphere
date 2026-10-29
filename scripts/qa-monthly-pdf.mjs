import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildMonthlyPdf } from '../src/tools/components/rundeckMonthlyPdf.js'

// Actual jsPDF generation, not a mock of the layout or a regex-only test.
// Contains long ABAP identifiers and both explicitly dated / snapshot errors.
const candidates = Array.from({length:10},(_,index)=>({
  consumer_key:index===9?'ZLAST_CANDIDATE_10':
    index===2?'ZCL_MFG_PRODUCTION_ACH_ENHANCEMENT_LONG_CLASS_NAME=========CP':
      'ZCUSTOM_SAP_ABAP_PROGRAM_FOR_PERFORMANCE_REVIEW_'+String(index+1),
  hosts:['AOPH1PAPPDC','AOPH2PAPPDC','AOPH3PAPPDC','AOPH4PAPPDC','AOPH5PAPPDC'],
  peak_cpu_pct:index*63+102,
  peak_pss_gb:8.23+index,
  occurrences:index+25,
  signals:{sustained_high_cpu:index%2===0,high_memory:index%3===0,
    cpu_spike:index%2!==0,baseline_anomaly:false}
}))
const data={
  quality:{complete_checks:700,expected_checks:750,coverage_pct:93.3,
    first_complete_at:'2026-09-01T00:00:00Z',last_complete_at:'2026-09-30T23:00:00Z'},
  summary:{review_required:10,workloads:120},
  monthly_pressure:{
    hosts:[], daily_hosts:[],
    thresholds:{cpu_warning_pct:75,ram_warning_pct:80},
    cpu:{observed_pressure_host_checks:15,observed_warning_app_days:9},
    ram:{observed_pressure_host_checks:8,observed_warning_app_days:5},
    top_cpu_workloads:[],top_ram_workloads:[]
  },
  monthly_abap_candidates:candidates,
  monthly_errors:{top_errors:[{
    category:'RUNTIME',error_code:'TSV_TNEW_PAGE_ALLOC_FAILED',
    program:'ZLONG_ERROR_RELATED_ABAP_PROGRAM',
    program_link:'RELATED_WORKLOAD',host:'AOPH3PAPPDC',
    event_count:2,snapshot_host_checks:3,first_at:'2026-09-18T03:34:00Z'
  }]}
}
const pdf=await buildMonthlyPdf({month:'2026-09',data,returnInstance:true})
const pageCount=pdf.internal.getNumberOfPages()
assert.ok(pageCount>=3 && pageCount<=6,'PDF should paginate actual rows without runaway blank pages: '+pageCount)
const pages=pdf.internal.pages.slice(1).map(lines=>lines.join('\n'))
const all=pages.join('\n')
assert.ok(all.includes('Programs Requiring Review'),'ABAP section missing')
assert.ok(all.includes('SAP Errors to Check'),'source-backed errors section missing')
assert.ok(all.includes('ZLAST_CANDIDATE_10'),'last ABAP candidate omitted')
assert.ok(all.includes('MONITORING RECORDS'),'management summary missing')
assert.ok(all.includes('OBSERVED SAMPLES'),'sample count heading missing')
assert.ok(all.includes('Monitoring records count saved observations, not job runs.'),'methodology missing')
assert.ok(all.includes('Review reason is performance-based'),'ABAP/error distinction missing')
assert.equal(pages.filter(page=>page.includes('Programs Requiring Review')).length>=1,true)
const bytes=new Uint8Array(pdf.output('arraybuffer'))
assert.ok(bytes.length>2000,'PDF buffer empty')
assert.equal(String.fromCharCode(...bytes.slice(0,5)),'%PDF-')
const out=join(process.env.RUNNER_TEMP||tmpdir(),'sphere-monthly-qa-fixture.pdf')
writeFileSync(out,bytes)
console.log('MONTHLY_PDF=PASS pages='+pageCount+' bytes='+bytes.length+' fixture='+out)

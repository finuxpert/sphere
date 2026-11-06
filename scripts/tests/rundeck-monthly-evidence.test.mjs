import test from 'node:test'
import assert from 'node:assert/strict'
import {fmt,pct,wpCoreEq,id,hostLabel,hostsFor,pressureHostsFor,when,relatedMonthlyErrorCodes,monthlySize,monthlyStorageAvailable,MONTHLY_STORAGE_ROWS,MONTHLY_STORAGE_REASON,monthlyStorageNote,savedPeriodPeak} from '../../src/tools/components/rundeckMonthlyEvidence.js'
test('Monthly retained values, WIB and host identities retain source meaning',()=>{
 assert.equal(fmt(null),'—');assert.equal(pct(12.5),'12,5%');assert.equal(wpCoreEq(200),'2 core eq.');
 assert.equal(id({consumer_type:'JOB',consumer_key:'JOB1'}),'JOB:JOB1');assert.equal(hostLabel('AOPH1PAPPDC'),'APP1');
 assert.equal(hostsFor({hosts:['APP1','APP2']}),'APP1, APP2');assert.equal(pressureHostsFor({pressure_overlap:{cpu_pressure_hosts:['APP3']}},'cpu'),'APP3');
 assert.equal(when(null),'—');assert.match(when('2026-10-13T05:00:00Z'),/WIB$/);
});
test('ABAP error code attribution requires explicit program or job identity',()=>{
 const e={top_errors:[{program_link:'EXPLICIT_ERROR_PROGRAM',program:'Z_TUNE',error_code:'RABAX'},{program_link:'WORKLOAD_CONTEXT',program:'Z_TUNE',error_code:'WRONG'},{job_names:['MY_JOB'],error_code:'RXMSG'}]};
 assert.equal(relatedMonthlyErrorCodes({consumer_type:'PROGRAM',consumer_key:'z_tune'},e),'RABAX');
 assert.equal(relatedMonthlyErrorCodes({consumer_type:'JOB',consumer_key:'my_job'},e),'RXMSG');
 assert.equal(relatedMonthlyErrorCodes({consumer_type:'PROGRAM',consumer_key:'Z_TUNE'},{...e,status:'ERROR_SOURCE_NOT_RETAINED'}),'—');
});
test('Monthly peak is bounded by selected month, week or custom dates, without synthetic zero',()=>{
 const p={daily_hosts:[{day:'2026-10-04',host:'APP1',peak_cpu_pct:77,peak_cpu_at:'2026-10-04T03:00:00Z'},{day:'2026-10-14',host:'APP2',peak_cpu_pct:95,peak_cpu_at:'2026-10-14T03:00:00Z'},{day:'2026-11-01',host:'APP3',peak_cpu_pct:99},{day:'2026-10-15',host:'APP4',peak_cpu_pct:null}]};const before=structuredClone(p);
 assert.deepEqual(savedPeriodPeak(p,'cpu','2026-10',null),{value:95,host:'APP2',at:'2026-10-14T03:00:00Z'});
 assert.deepEqual(savedPeriodPeak(p,'cpu','2026-10','2026-10-01'),{value:77,host:'APP1',at:'2026-10-04T03:00:00Z'});
 assert.deepEqual(savedPeriodPeak(p,'cpu','2026-10',null,'2026-10-14','2026-10-15'),{value:95,host:'APP2',at:'2026-10-14T03:00:00Z'});
 assert.equal(savedPeriodPeak(p,'ram','2026-10',null),null);assert.deepEqual(p,before);
});
test('Storage distinguishes retained capacity, mapping missing and no historical samples',()=>{
 assert.equal(MONTHLY_STORAGE_ROWS.length,4);assert.ok(MONTHLY_STORAGE_REASON.MAPPING_NOT_CONFIGURED);
 assert.equal(monthlySize(null),'Not Collected');assert.equal(monthlySize(1.5e9),'1,5 GB');assert.equal(monthlySize(2e12),'2 TB');
 assert.equal(monthlyStorageNote(null,true,''),'Checking historical storage…');assert.equal(monthlyStorageNote(null,false,'HTTP 503'),'Storage source unavailable');
 assert.equal(monthlyStorageNote({source_rows:10,items:Array.from({length:4},()=>({status:'COLLECTED'}))},false,''),'4 of 4 filesystems collected');
 assert.equal(monthlyStorageNote({source_rows:5,items:[{status:'MISSING',reason:'MAPPING_NOT_CONFIGURED'}]},false,''),'1 filesystem mapping not configured');
 assert.equal(monthlyStorageNote({source_rows:0,week_start:'2026-10-05',items:[{status:'MISSING',reason:'NO_WEEKLY_INFRA_HISTORY'}]},false,''),'No Infrastructure filesystem samples for this week');
});

test('historical df Avail reports source missing instead of guessed Total minus Used',()=>{
  const legacy={status:'COLLECTED',total_bytes:1000,used_bytes:700,
    free_bytes:null,availability_source:'NOT_RETAINED'}
  assert.equal(monthlyStorageAvailable(legacy),'Not retained')
  assert.equal(monthlyStorageAvailable({...legacy,free_bytes:300}),'Not retained')
  assert.equal(monthlyStorageAvailable({...legacy,status:'NOT_COLLECTED'}),'—')
  assert.equal(monthlyStorageAvailable({...legacy,free_bytes:0,availability_source:'EXPLICIT'}),'0 GB')
  assert.equal(monthlyStorageAvailable({...legacy,free_bytes:300000000000,availability_source:'EXPLICIT'}),'300 GB')
  assert.match(monthlyStorageNote({source_rows:182369,items:Array.from({length:4},()=>legacy)},false,''),/df Avail not retained \\(4\\/4\\)/)
})

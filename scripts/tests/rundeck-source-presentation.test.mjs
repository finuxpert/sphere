import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {formatTime,metric,ageLabel,clipped,availabilityStatus,availabilityServiceImpact} from '../../src/tools/components/rundeckSourcePresentation.js'
test('Monitoring renders timestamps, numbers and age without changing display semantics',()=>{
 assert.equal(formatTime(null),'—');assert.equal(formatTime('invalid'),'invalid');assert.match(formatTime('2026-10-13T05:30:00Z',true),/12.*30/);
 assert.equal(metric(null),'—');assert.equal(metric(1234.56,'%'),'1,234.6%');assert.equal(ageLabel(NaN),'age unknown');
 assert.equal(ageLabel(0),'<1m');assert.equal(ageLabel(61),'1h 1m');assert.equal(clipped('',10),'—');assert.equal(clipped('abcdefghijklmnop',7),'abcdef…');
});
test('Availability UNKNOWN stays unknown; explicit APP/HANA/Dispatcher DOWN stays critical',()=>{
 assert.equal(availabilityStatus([{name:'Primary',status:'up'}],'PRIMARY'),'UP');assert.equal(availabilityStatus([],'DR'),'UNKNOWN');
 assert.equal(availabilityServiceImpact({sap_app:[{status:'DOWN'}]}),true);assert.equal(availabilityServiceImpact({hana_system_db:[{name:'PRIMARY',status:'DOWN'}]}),true);
 assert.equal(availabilityServiceImpact({hana_system_db:[{name:'SECONDARY',status:'DOWN'}]}),false);
 assert.equal(availabilityServiceImpact({web_dispatcher:[{status:'UP'},{status:'DOWN'}]}),false);
 assert.equal(availabilityServiceImpact({web_dispatcher:[{status:'DOWN'},{status:'DOWN'}]}),true);assert.equal(availabilityServiceImpact({}),false);
});
test('Monitoring React shell retains refresh, saved evidence and PDF status orchestration',()=>{
 const ui=readFileSync(new URL('../../src/tools/components/RundeckSource.jsx',import.meta.url),'utf8');
 assert.match(ui,/coalesceAsyncRefresh\(/);assert.match(ui,/Promise\.allSettled\(/);assert.match(ui,/setInterval\(refreshAll, 60000\)/);
 assert.match(ui,/addEventListener\('collection_ready', onReady\)/);assert.match(ui,/availabilityServiceImpact\(availabilityResult\)/);assert.match(ui,/pdfStatusColor\(status\)/);
});

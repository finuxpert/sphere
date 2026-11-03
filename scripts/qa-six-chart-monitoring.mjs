#!/usr/bin/env node
/** Chromium geometry regression for the source-backed 25/50/25 Monitoring layout. */
import {execFileSync,spawnSync} from 'node:child_process'
import {mkdtempSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
const assets=resolve('dist/assets')
const files=readdirSync(assets).filter(file=>file.endsWith('.css'))
const priority=files.filter(file=>readFileSync(join(assets,file),'utf8').includes('is-six-chart-layout'))
if(!files.length||!priority.length)throw Error('SIX_CHART_QA=FAIL compiled layout CSS unavailable')
const ordered=[...files.filter(file=>!priority.includes(file)),...priority]
const styles=ordered.map(file=>'<style>'+readFileSync(join(assets,file),'utf8')+'</style>').join('')
let chrome=''
for(const cmd of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
 try{chrome=execFileSync('which',[cmd],{encoding:'utf8'}).trim();break}catch{/* try next */}
}
if(!chrome)throw Error('SIX_CHART_QA=FAIL browser unavailable')
const temp=mkdtempSync(join(tmpdir(),'sphere-six-chart-'))
const apps=Array.from({length:5},(_,i)=>'<button class="rundeckAppHexSelector is-sap-attention"><span class="rundeckAppHexShape"><strong>APP'+(i+1)+'</strong><small>ATTENTION</small><em>WP 1</em><span class="rundeckFleetMeters"><span class="rundeckFleetMeter"><span class="rundeckFleetMeterName">CPU</span><span class="rundeckFleetMeterTrack"></span><span class="rundeckFleetMeterValue">24%</span></span><span class="rundeckFleetMeter"><span class="rundeckFleetMeterName">RAM</span><span class="rundeckFleetMeterTrack"></span><span class="rundeckFleetMeterValue">32%</span></span></span></span></button>').join('')
const fsRows=['OS Root','INTF','INTF AOQ','SAP Archive','Archive INTF'].map(name=>'<button class="sphereStorageRow"><span class="sphereStorageLabel"><strong>'+name+'</strong><small>APP1</small></span><span class="sphereStorageTrack"></span><strong class="sphereStoragePercent">72%</strong></button>').join('')
const counts=['Review','Watch','Limited Data','Normal'].map(name=>'<button class="rundeckWorkloadCategory"><strong>42</strong><span>'+name+'</span></button>').join('')
const consumers=(metric)=>Array.from({length:10},(_,i)=>'<div class="sphereEvaluationTop5Row"><span class="sphereEvaluationTop5Name">SAVED_WORKLOAD_'+i+'</span><span class="sphereEvaluationTop5Track"><i style="width:60%"></i></span><span class="sphereEvaluationTop5Value">'+(metric==='CPU'?'1.20 cores':'2.25 GB')+'</span></div>').join('')
const donuts=['Workload Mix','Recurring Workloads','High Memory','WP Signal Overlap'].map((name,index)=>
  '<article class="sphereJobDonutCard"><div class="sphereJobDonutRing" style="--sphere-job-ring-pct:25%"><span>'+[60,23,9,7][index]+'</span></div>'+
  '<div class="sphereJobDonutCopy"><strong>'+name+'</strong><span class="sphereJobDonutDetail">Source-backed signal</span><small>24h</small></div></article>').join('')
const chart='<svg viewBox="0 0 360 108"><polyline points="37,80 110,65 170,45 250,61 352,25" fill="none" stroke="#67a9e8"/></svg>'
const template=`<!doctype html><html data-theme="__THEME__"><head><meta charset="utf-8">__CSS__
<style>
html,body{margin:0!important;padding:0!important}
.appShell{width:__WIDTH__px}
.spherePerformanceMain{width:calc(100% - 190px);margin-left:190px;box-sizing:border-box}
.rundeckPanel{padding-top:145px}
.rundeckMonitoring{--sphere-overview-room:calc(100vh - 182px)}
.sphereMonitoringTrendBottom{background:var(--cockpit-surface,#1b2835);border:1px solid #304150}
.fixtureBottom{display:grid;grid-template-rows:30px minmax(0,1fr);height:100%;padding:7px;box-sizing:border-box}
.fixtureTrendCards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;min-height:0}
.fixtureTrendCards>div{border:1px solid #304150;min-height:110px}
</style></head><body><div class="appShell isTool"><div class="rundeckPanel"><main class="spherePerformanceMain">
<section class="rundeckMonitoring rundeckCockpitV13491 is-three-panel is-six-chart-layout" data-viewport-fit="true" data-motion="off">
<div class="sphereMonitoringThreeUp sphereOverviewBottomRow row g-2">
<div class="sphereMonitoringLeftStack">
<section class="sphereMonitoringApp rundeckTopBandV13454 is-unified-app-infra col-12 col-xl-4">
<section class="rundeckUnifiedAppInfra" data-layout="landscape-operations">
<header class="rundeckUnifiedAppInfraHead"><h3>SAP APP Landscape</h3></header>
<div class="rundeckAppHexMain rundeckAppThreePanels"><section class="rundeckAppMotionPanel">
<div class="rundeckAppHexSelectors rundeckUnifiedAppCards is-honeycomb">__APPS__</div>
</section></div></section></section>
<section class="sphereStorageSummary col-12 is-compact-summary">
<header class="sphereStorageSummaryHead"><h3>Storage Summary</h3><button class="sphereStorageDetails">View details</button></header>
<div class="sphereStorageRows">__FSROWS__</div></section></div>
<section class="rundeckJobsProgramsOverview col-12"><div class="rundeckJobsProgramsHealthSide">
<section class="rundeckWorkloadHealth is-monitoring-globe" data-view-mode="status">
<header class="rundeckWorkloadHealthTitle"><strong>Job &amp; Program Evaluation</strong><button>Open Review</button></header>
<div class="rundeckWorkloadHealthLegend">__COUNTS__</div>
<section class="sphereEvaluationTop5 sphereEvaluationDual"><div class="sphereEvaluationTop5Head sphereEvaluationDualHead"><strong>Top Consumers <small>· 24h</small></strong><div class="sphereConsumerRange"><button>30M</button><button>1H</button><button>6H</button><button aria-pressed="true">24H</button><button>Custom</button></div></div>
<div class="sphereEvaluationDualGrid"><div class="sphereEvaluationDualPanel is-cpu"><div class="sphereEvaluationDualPanelTitle"><strong>Top 10 CPU · Avg Cores</strong></div><div class="sphereEvaluationTop5Bars">__CPU_CONSUMERS__</div></div>
<div class="sphereEvaluationDualPanel is-memory"><div class="sphereEvaluationDualPanelTitle"><strong>Top 10 Memory · Avg PSS</strong></div><div class="sphereEvaluationTop5Bars">__MEM_CONSUMERS__</div></div></div></section>
<section class="sphereJobDonuts">__DONUTS__</section>
<footer class="rundeckWorkloadHealthFooter"></footer>
</section></div></section>
<div class="sphereMonitoringRightStack">
<section class="sphereMonitoringMiniChart"><div class="sphereFleetMiniTrend sphereWorkloadActivityMini">
<div class="sphereFleetMiniHead"><strong>SAP Workload Activity</strong><div class="sphereFleetMiniActions"><button>6H</button><button>24H</button></div></div>
<div class="sphereFleetMiniMeta">Observed Job / Program names · All APPs</div>
__CHART__<div class="sphereWorkloadActivityLegend"><span>Jobs</span><span>Programs</span></div><small class="sphereFleetMiniFooter">Peak 112 observed workloads</small></div></section>
<section class="sphereMonitoringMiniChart"><div class="sphereFleetMiniTrend sphereWorkloadActivityMini">
<div class="sphereFleetMiniHead"><strong>Work Process by Type</strong><div class="sphereFleetMiniActions"><button>6H</button><button>24H</button></div></div>
<div class="sphereFleetMiniMeta">Observed WP snapshots · All APPs</div>
__CHART__<div class="sphereWorkloadActivityLegend"><span>DIA</span><span>BTC</span><span>UPD</span><span>ENQ</span><span>Other</span></div><small class="sphereFleetMiniFooter">Peak 42 observed WP</small></div></section>
</div></div>
<section class="rundeckTrendBandV13454 sphereMonitoringTrendBottom"><div class="fixtureBottom">
<strong>Performance Trends</strong><div class="fixtureTrendCards"><div>CPU</div><div>RAM</div><div>Host Load</div><div>Critical WP</div></div>
</div></section>
</section></main></div></div>
<script>window.addEventListener('load',function(){
const get=function(s){return document.querySelector(s)}
const rect=function(s){const el=get(s);return el?el.getBoundingClientRect():null}
const left=rect('.sphereMonitoringLeftStack'),mid=rect('.rundeckJobsProgramsOverview'),right=rect('.sphereMonitoringRightStack')
const a=rect('.sphereMonitoringApp'),s=rect('.sphereStorageSummary')
const n=rect('.sphereMonitoringRightStack .sphereMonitoringMiniChart:first-child')
const d=rect('.sphereMonitoringRightStack .sphereMonitoringMiniChart:last-child')
const top=rect('.sphereMonitoringThreeUp'),bottom=rect('.sphereMonitoringTrendBottom')
const eq=function(x,y,t){return Math.abs(x-y)<=t}
const columns=left&&mid&&right&&left.width>190&&eq(left.width,right.width,7)&&eq(mid.width,left.width*2,16)&&eq(left.top,mid.top,4)&&eq(mid.top,right.top,4)
const stacks=a&&s&&n&&d&&eq(s.top,a.bottom+8,5)&&eq(d.top,n.bottom+8,5)&&a.height>145&&s.height>115&&n.height>140&&d.height>140
const chartCount=document.querySelectorAll('.sphereMonitoringRightStack svg').length===2&&
document.querySelectorAll('.fixtureTrendCards > div').length===4&&
document.querySelectorAll('.sphereStorageRow').length===5&&
document.querySelectorAll('.rundeckAppHexSelector').length===5&&
document.querySelectorAll('.sphereEvaluationTop5Row').length===20
const head=rect('.rundeckWorkloadHealthTitle')
const kpis=rect('.rundeckWorkloadHealthLegend')
const cpu=rect('.sphereEvaluationTop5')
const donutArea=rect('.sphereJobDonuts')
const donutItems=[...document.querySelectorAll('.sphereJobDonutCard')].map(node=>node.getBoundingClientRect())
const dual=[...document.querySelectorAll('.sphereEvaluationDualPanel')].map(node=>node.getBoundingClientRect())
const dualFit=dual.length===2&&dual.every(box=>box.width>100&&box.height>130)&&
  eq(dual[0].width,dual[1].width,8)&&eq(dual[0].top,dual[1].top,5)&&
  dual[0].right+4<=dual[1].left&&dual[1].right<=mid.right+2&&
  [...document.querySelectorAll('.sphereEvaluationDualPanel .sphereEvaluationTop5Bars')].every(node=>node.getBoundingClientRect().height>110)
const centralFlow=head&&kpis&&cpu&&donutArea&&
  [head,kpis,cpu,donutArea].every(box=>box.width>=mid.width*.86)&&
  head.bottom<=kpis.top+6&&kpis.bottom<=cpu.top+6&&cpu.bottom<=donutArea.top+6&&
  donutArea.bottom<=mid.bottom+8&&donutItems.length===4&&
  donutItems.every(box=>box.width>100&&box.height>42)&&
  eq(donutItems[0].top,donutItems[1].top,5)&&eq(donutItems[2].top,donutItems[3].top,5)&&
  donutItems[0].right<donutItems[1].left&&donutItems[2].right<donutItems[3].left
const singleSelector=document.querySelectorAll('.sphereFleetMiniHost').length===0
const ordered=bottom&&top&&bottom.top>=top.bottom-4
const chartsFit=[...document.querySelectorAll('.sphereFleetMiniTrend svg')].length===2&&
  [...document.querySelectorAll('.sphereFleetMiniTrend svg')].every(el=>el.getBoundingClientRect().height>=70)
const labels=[...document.querySelectorAll('.sphereMonitoringRightStack .sphereFleetMiniHead strong')].map(el=>el.textContent)
const correctCharts=labels.length===2&&labels[0]==='SAP Workload Activity'&&labels[1]==='Work Process by Type'&&document.querySelectorAll('.sphereWorkloadActivityLegend').length===2
const pass=columns&&stacks&&chartCount&&correctCharts&&ordered&&chartsFit&&centralFlow&&singleSelector&&dualFit
document.body.dataset.qa=pass?'PASS':'FAIL'
const detailChecks=[
  [head,kpis,cpu,donutArea].every(box=>box&&box.width>=mid.width*.86),
  !!(head&&kpis&&head.bottom<=kpis.top+6),
  !!(kpis&&cpu&&kpis.bottom<=cpu.top+6),
  !!(cpu&&donutArea&&cpu.bottom<=donutArea.top+6),
  !!(donutArea&&donutArea.bottom<=mid.bottom+8),
  donutItems.length===4&&donutItems.every(box=>box.width>100&&box.height>42),
  donutItems.length===4&&eq(donutItems[0].top,donutItems[1].top,5)&&eq(donutItems[2].top,donutItems[3].top,5),
  donutItems.length===4&&donutItems[0].right<donutItems[1].left&&donutItems[2].right<donutItems[3].left,
  Math.round(head?.width||0),Math.round(kpis?.width||0),Math.round(cpu?.width||0),Math.round(donutArea?.width||0),
  Math.round(mid?.height||0),Math.round(donutArea?.height||0),
  Math.round(cpu?.bottom||0),Math.round(donutArea?.top||0),Math.round(donutArea?.bottom||0),Math.round(mid?.bottom||0)
]
document.body.dataset.metrics=[columns,stacks,chartCount,correctCharts,ordered,chartsFit,centralFlow,singleSelector,dualFit,...dual.map(b=>Math.round(b.width)),...dual.map(b=>Math.round(b.height)),...detailChecks,Math.round(left?.width||0),Math.round(mid?.width||0),Math.round(right?.width||0),Math.round(a?.height||0),Math.round(s?.height||0),Math.round(n?.height||0),Math.round(d?.height||0)].join(',')
})</script></body></html>`;
try{
 for(const size of [{w:1536,h:960},{w:1920,h:1080}]){
  for(const theme of ['dark','light']){
   const html=template.replaceAll('__THEME__',theme).replaceAll('__WIDTH__',String(size.w))
     .replaceAll('__CSS__',styles).replaceAll('__APPS__',apps).replaceAll('__FSROWS__',fsRows)
     .replaceAll('__COUNTS__',counts).replaceAll('__CPU_CONSUMERS__',consumers('CPU')).replaceAll('__MEM_CONSUMERS__',consumers('PSS')).replaceAll('__DONUTS__',donuts).replaceAll('__CHART__',chart)
   const file=join(temp,'monitor-'+size.w+'-'+theme+'.html')
   writeFileSync(file,html)
   const result=spawnSync(chrome,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
     '--allow-file-access-from-files','--window-size='+size.w+','+size.h,
     '--virtual-time-budget=1400','--dump-dom',pathToFileURL(file).href],
     {encoding:'utf8',timeout:30000,maxBuffer:5*1024*1024,env:{...process.env,DBUS_SESSION_BUS_ADDRESS:''}})
   const metrics=result.stdout?.match(/data-metrics="([^"]+)"/)?.[1]
   if(result.status!==0||!result.stdout?.includes('data-qa="PASS"'))
    throw Error('SIX_CHART_QA=FAIL '+size.w+' '+theme+' '+metrics+' '+result.stderr?.slice(-250))
   console.log('SIX_CHART_QA=PASS',size.w+'x'+size.h,theme,metrics)
  }
 }
}finally{rmSync(temp,{recursive:true,force:true})}

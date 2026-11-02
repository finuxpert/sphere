#!/usr/bin/env node
/** Real compiled CSS check for the SPHERE DEV 3-panel Monitoring viewport.
 * Data in this synthetic fixture is not used in any production dashboard. */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const assets=resolve('dist/assets')
const styles=readdirSync(assets).filter(name=>name.endsWith('.css'))
if(!styles.length)throw Error('MONITOR_LAYOUT=FAIL CSS build absent')
const priority=styles.filter(file=>readFileSync(join(assets,file),'utf8').includes('is-three-panel') &&
  readFileSync(join(assets,file),'utf8').includes('eval-capsule'))
if(!priority.length)throw Error('MONITOR_LAYOUT=FAIL three-panel stylesheet absent')
const ordered=[...styles.filter(file=>!priority.includes(file)),...priority]
const links=ordered.map(file=>'<style>'+readFileSync(join(assets,file),'utf8')+'</style>').join('')
let browser=''
for(const candidate of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
  try{browser=execFileSync('which',[candidate],{encoding:'utf8'}).trim();break}catch{/* next */}
}
if(!browser)throw Error('MONITOR_LAYOUT=FAIL Chrome unavailable')
const tmp=mkdtempSync(join(tmpdir(),'sphere-three-panel-'))
const kpis=['Review','Watch','Limited Data','Normal'].map(label=>'<button class="rundeckWorkloadCategory"><strong>42</strong><span>'+label+'</span></button>').join('')
const distribution=['review','attention','unknown','normal'].map((key,index)=>
  '<button class="sphereEvaluationStatusRow is-'+key+'"><span class="sphereEvaluationStatusLabel">'+['Review','Watch','Limited Data','Normal'][index]+'</span><span class="sphereEvaluationStatusTrack"><i style="width:'+['10','30','25','35'][index]+'%"></i></span><span class="sphereEvaluationStatusPercent">'+['10','30','25','35'][index]+'%</span></button>').join('')
const apps=Array.from({length:5},(_,i)=>'<button class="rundeckAppHexSelector '+(i===0?'is-sap-normal is-active':'is-sap-attention')+'"><span class="rundeckAppHexShape"><strong>APP'+(i+1)+'</strong><small>Normal</small><em>WP 0</em><span class="rundeckFleetMeters"><span class="rundeckFleetMeter"><span class="rundeckFleetMeterName">CPU</span><span class="rundeckFleetMeterTrack"></span><span class="rundeckFleetMeterValue">20%</span></span></span></span></button>').join('')
const mounts=['OS Root','INTF','INTF AOQ','SAP Archive','Archive INTF'].map(name=>'<button class="sphereStorageRow"><span class="sphereStorageLabel"><strong>'+name+'</strong><small>APP1</small></span><span class="sphereStorageTrack"><i style="width:70%"></i></span><strong class="sphereStoragePercent">70%</strong></button>').join('')
try{
  for(const size of [{w:1536,h:960},{w:1920,h:1080}]){
    for(const theme of ['dark','light']){
      const html=`<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8">${links}
        <style>body{margin:0}.appShell{width:${size.w}px;min-height:${size.h}px}.spherePerformanceMain{width:calc(100% - 190px);margin-left:190px;box-sizing:border-box}.rundeckMonitoring{--sphere-overview-room:735px}.rundeckTrendBandV13454{min-height:220px}</style></head>
        <body><div class="appShell isTool"><div class="rundeckPanel"><main class="spherePerformanceMain">
        <section class="rundeckMonitoring rundeckCockpitV13491 is-three-panel" data-viewport-fit="true" data-motion="on">
        <div class="sphereMonitoringThreeUp sphereOverviewBottomRow row g-2">
          <section class="sphereMonitoringApp rundeckTopBandV13454 is-unified-app-infra col-12 col-xl-4">
          <section class="rundeckUnifiedAppInfra" data-layout="landscape-operations">
          <header class="rundeckUnifiedAppInfraHead"><h3>SAP APP Landscape</h3><button class="sphereAppHealthAction">Health Details</button></header>
          <div class="sphereAppWpSummary">Critical WP <strong>0</strong></div>
          <div class="rundeckAppHexMain rundeckAppThreePanels"><section class="rundeckAppMotionPanel">
          <div class="rundeckAppHexSelectors rundeckUnifiedAppCards is-honeycomb">${apps}</div>
          </section></div></section></section>
          <section class="rundeckJobsProgramsOverview col-12 col-xl-4"><div class="rundeckJobsProgramsHealthSide">
          <section class="rundeckWorkloadHealth is-monitoring-globe">
          <header class="rundeckWorkloadHealthTitle"><strong>Job &amp; Program Evaluation</strong><button>Open Review</button></header>
          <div class="rundeckWorkloadHealthLegend">${kpis}</div>
          <div class="sphereEvaluationStatus"><div class="sphereEvaluationStatusHeading"><strong>Status Distribution</strong><span>60 evaluated</span></div><div class="sphereEvaluationStatusRows">${distribution}</div></div>
          <section class="sphereEvaluationTop5">
             <div class="sphereEvaluationTop5Head"><strong>Top 5 Resource Consumers</strong></div>
             <div class="sphereEvaluationTop5Bars">
               ${Array.from({length:5},(_,i)=>'<button class="sphereEvaluationTop5Row"><span class="sphereEvaluationTop5Name">Observed workload '+i+'</span><span class="sphereEvaluationTop5Track"><i style="width:60%"></i></span><span class="sphereEvaluationTop5Value">20%</span></button>').join('')}
             </div>
           </section>
          <footer class="rundeckWorkloadHealthFooter">60 evaluated</footer></section></div></section>
          <section class="sphereStorageSummary col-12 col-xl-4"><header class="sphereStorageSummaryHead"><h3>Storage Summary</h3></header>
          <div class="sphereStorageRows">${mounts}</div>
          <div class="sphereStorageGrowth"><div class="sphereStorageGrowthHead"><strong>Filesystem Growth</strong></div>
          <div class="sphereFilesystemTrend"><svg viewBox="0 0 400 140"><path d="M30 50 L200 40 L390 30" stroke="#67a9e8" fill="none"/></svg></div>
          </div>
          <section class="sphereDiskIoTrend"><div class="sphereDiskIoHead"><strong>Disk I/O Activity</strong></div>
          <div class="sphereDiskIoMeta">Device / mount · Read / Write MB/s</div>
          <svg viewBox="0 0 350 96"><polyline points="34,60 120,38 240,48 342,20" fill="none" stroke="#67a9e8"/></svg>
          </section></section>
        </div>
        <section class="rundeckTrendBandV13454 sphereMonitoringTrendBottom">Performance Trends</section>
        <button class="sphereMonitoringMotionToggle">Motion On</button>
        </section></main></div></div>
        <script>window.addEventListener('load',()=>{
          const $=selector=>document.querySelector(selector)
          const rect=selector=>$(selector)?.getBoundingClientRect()
          const a=rect('.sphereMonitoringApp'),b=rect('.rundeckJobsProgramsOverview'),c=rect('.sphereStorageSummary')
          const t=rect('.sphereMonitoringTrendBottom'),top=rect('.sphereMonitoringThreeUp')
          const title=rect('.rundeckWorkloadHealthTitle'),kpi=rect('.rundeckWorkloadHealthLegend')
          const orb=rect('.sphereEvaluationStatus'),top5=rect('.sphereEvaluationTop5')
          const foot=rect('.rundeckWorkloadHealthFooter'),io=rect('.sphereDiskIoTrend')
          const columns=[a,b,c].every(x=>x?.width>250)&&
            Math.max(a.width,b.width,c.width)-Math.min(a.width,b.width,c.width)<12&&
            Math.max(a.top,b.top,c.top)-Math.min(a.top,b.top,c.top)<9
          const order=title&&kpi&&orb&&top5&&foot&&title.bottom<=kpi.top+4&&
            kpi.bottom<=orb.top+4&&orb.bottom<=top5.top+4&&top5.bottom<=foot.top+4
          const after=t&&top&&t.top>=top.bottom-3
          const inside=orb&&top5&&foot&&io&&foot.bottom<=b.bottom+5&&io.bottom<=c.bottom+5&&
            orb.height>=120&&top5.height>=110&&io.height>=65
          const all=document.querySelectorAll('.rundeckAppHexSelector').length===5&&
            document.querySelectorAll('.sphereStorageRow').length===5&&
            document.querySelectorAll('.sphereEvaluationTop5Row').length===5&&
             document.querySelectorAll('.sphereEvaluationStatusRow').length===4
          const selected=$('.rundeckAppHexSelector.is-active')
          const background=getComputedStyle(selected).backgroundColor
          const severity=getComputedStyle(selected).boxShadow.includes('inset')
          const valid=columns&&order&&after&&inside&&all&&severity
          document.body.dataset.qa=valid?'PASS':'FAIL'
          document.body.dataset.metrics=[columns,order,after,inside,all,severity,Math.round(a.width),Math.round(b.width),Math.round(c.width),Math.round(orb.height),Math.round(top5.height),Math.round(io.height),background].join(',')
        })</script></body></html>`
      const name=join(tmp,'layout-'+size.w+'-'+theme+'.html')
      writeFileSync(name,html)
      const result=spawnSync(browser,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--allow-file-access-from-files','--window-size='+size.w+','+size.h,'--virtual-time-budget=1200','--dump-dom',pathToFileURL(name).href],{encoding:'utf8',timeout:30000,maxBuffer:5*1024*1024})
      const metrics=result.stdout?.match(/data-metrics="([^"]+)"/)?.[1]
      if(result.status!==0||!result.stdout.includes('data-qa="PASS"'))throw Error('MONITOR_LAYOUT=FAIL '+size.w+' '+theme+' '+metrics+' '+result.stderr?.slice(-300))
      console.log('MONITOR_LAYOUT=PASS',size.w+'x'+size.h,theme,metrics)
    }
  }
}finally{rmSync(tmp,{recursive:true,force:true})}

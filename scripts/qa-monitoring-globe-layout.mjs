#!/usr/bin/env node
/** Browser geometry guard for the actual Monitoring 50/50 globe layout.
 * Synthetic data is only used for HTML layout: it is never a monitoring result.
 * Check compiled CSS in Chrome because JS/static tests cannot detect overlap. */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const assets=resolve('dist/assets')
const styles=readdirSync(assets).filter(file=>file.endsWith('.css'))
if(!styles.length)throw Error('MONITOR_LAYOUT=FAIL no compiled CSS')
// The real Monitoring route loads its CSS after the shared shell CSS.
// Loading all independent Vite CSS chunks in filesystem order can override
// the APP severity styles with earlier shared button defaults.
const monitoring=styles.filter(file=>{
  const content=readFileSync(join(assets,file),'utf8')
  return content.includes('is-monitoring-globe') && content.includes('#214339')
})
if(!monitoring.length)throw Error('MONITOR_LAYOUT=FAIL Monitoring severity stylesheet absent from build')
const orderedStyles=[...styles.filter(file=>!monitoring.includes(file)),...monitoring]
const browsers=['google-chrome','google-chrome-stable','chromium','chromium-browser']
let browser=''
for(const candidate of browsers){
  try { browser=execFileSync('which',[candidate],{encoding:'utf8'}).trim();break }
  catch { /* try next */ }
}
if(!browser)throw Error('MONITOR_LAYOUT=FAIL Chrome unavailable')
const temp=mkdtempSync(join(tmpdir(),'sphere-monitor-layout-'))
// Embed compiled CSS into the fixture, avoiding flaky file:// link loads
// under headless Chromium. The checks still use the real build's selectors.
const links=orderedStyles.map(file=>'<style data-css-chunk="'+file+'">'+readFileSync(join(assets,file),'utf8')+'</style>').join('')
const levels=['Review','Watch','Limited Data','Normal']
const categories=levels.map((name,i)=>'<button class="rundeckWorkloadCategory is-'+['review','attention','unknown','normal'][i]+'"><strong>42</strong><span>'+name+'</span></button>').join('')
const dots=Array.from({length:42},(_,i)=>'<button class="rundeckWorkloadDot" aria-label="Mock observation '+i+'"></button>').join('')
try{
  for(const viewport of [{w:1536,h:960},{w:1920,h:1080}]){
    for(const theme of ['dark','light']){
      const html=`<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8">${links}
      <style>body{margin:0}.fixtureRoot{width:${viewport.w}px;min-height:${viewport.h}px}.spherePerformanceMain{min-width:0}.sphereOverviewBottomRow{min-width:0}.rundeckJobsProgramsOverview,.sphereStorageSummary{min-width:0}</style>
      </head><body><div class="appShell isTool fixtureRoot"><div class="rundeckPanel">
      <div class="spherePerformanceShell"><nav class="spherePerformanceSidebar" style="width:180px"></nav>
      <main class="spherePerformanceMain"><section class="rundeckMonitoring rundeckCockpitV13491" data-viewport-fit="true" style="--sphere-overview-room:730px">
      <section class="rundeckTopBandV13454 is-unified-app-infra" style="height:150px">
        <div class="rundeckUnifiedAppInfra" data-layout="landscape-operations">
          <div class="rundeckAppHexSelectors rundeckUnifiedAppCards is-honeycomb">
            <button class="rundeckAppHexSelector is-sap-normal is-active"><span class="rundeckAppHexShape">APP1 Normal</span></button>
          </div>
        </div>
      </section>
      <section class="rundeckTrendBandV13454" style="height:265px"></section>
      <div class="sphereOverviewBottomRow row g-2 align-items-start">
       <section class="rundeckJobsProgramsOverview col-12 col-xl-5"><div class="rundeckJobsProgramsHealthSide">
        <section class="rundeckWorkloadHealth is-monitoring-globe" style="--workload-dot-size:7px;--workload-dot-gap:2px;--workload-columns:7">
          <header class="rundeckWorkloadHealthTitle"><span><strong>Job &amp; Program Evaluation</strong></span><button>Open Review</button></header>
          <div class="rundeckWorkloadHealthLegend">${categories}</div>
          <div class="rundeckWorkloadDotGrid">${dots}</div>
          <footer class="rundeckWorkloadHealthFooter"><span>Saved evaluations</span><small>Evidence source</small></footer>
        </section>
       </div></section>
       <section class="sphereStorageSummary col-12 col-xl-7"><header>Storage Summary</header></section>
      </div>
      </section></main></div></div></div>
      <script>window.addEventListener('load',()=>{
       const $=s=>document.querySelector(s)
       const rect=s=>$(s)?.getBoundingClientRect()
       const a=rect('.rundeckWorkloadHealthTitle'),b=rect('.rundeckWorkloadHealthLegend')
       const c=rect('.rundeckWorkloadDotGrid'),d=rect('.rundeckWorkloadHealthFooter')
       const panel=rect('.rundeckWorkloadHealth'),left=rect('.rundeckJobsProgramsOverview'),right=rect('.sphereStorageSummary')
       const selected=$('.rundeckAppHexSelector.is-active')
       const background=getComputedStyle(selected).backgroundColor
       const ordered=a&&b&&c&&d&&a.bottom<=b.top+4&&b.bottom<=c.top+4&&c.bottom<=d.top+4
       const fit=panel&&d&&d.bottom<=panel.bottom+4&&c.height>=140&&b.height>=35
       const ratio=left&&right?left.width/(left.width+right.width):0
       const columns=ratio>.45&&ratio<.55&&Math.abs(left.top-right.top)<8
       const severity='${theme}'!=='dark'||background==='rgb(33, 67, 57)'
       const valid=Boolean(ordered&&fit&&columns&&severity)
       document.body.dataset.check=valid?'PASS':'FAIL'
       document.body.dataset.metrics=[ordered,fit,columns,severity,background,Math.round(c?.height||0),ratio.toFixed(3)].join(',')
      })</script></body></html>`
      const file=join(temp,'monitor-'+viewport.w+'-'+theme+'.html')
      writeFileSync(file,html)
      const run=spawnSync(browser,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--allow-file-access-from-files','--window-size='+viewport.w+','+viewport.h,'--virtual-time-budget=1000','--dump-dom',pathToFileURL(file).href],{encoding:'utf8',timeout:30000,maxBuffer:5*1024*1024})
      const result=run.stdout?.match(/data-metrics="([^"]*)"/)?.[1]
      if(run.status!==0||!run.stdout.includes('data-check="PASS"'))
        throw Error('MONITOR_LAYOUT=FAIL '+viewport.w+'x'+viewport.h+' theme='+theme+' details='+result+' '+run.stderr?.slice(-300))
      console.log('MONITOR_LAYOUT=PASS',viewport.w+'x'+viewport.h,theme,result)
    }
  }
} finally { rmSync(temp,{recursive:true,force:true}) }

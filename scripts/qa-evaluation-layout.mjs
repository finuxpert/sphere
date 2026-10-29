#!/usr/bin/env node
/**
 * Chrome geometry regression for the actual compiled cockpit CSS.
 * The old structural-only test passed even though APP rows occupied only the
 * first 30% of the Job & Program Evaluation panel.
 * This test checks computed width in real Chromium for both viewport modes.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dist = resolve('dist/assets')
const cssFiles = readdirSync(dist).filter(name => name.endsWith('.css'))
if (!cssFiles.length) throw new Error('LAYOUT=FAIL: no compiled CSS assets')
const browsers = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
let chrome
for (const browser of browsers) {
  try {
    chrome = execFileSync('which', [browser], { encoding: 'utf8' }).trim()
    break
  } catch { /* try the next browser */ }
}
if (!chrome) throw new Error('LAYOUT=FAIL: no Chromium / Chrome installed')
const temp = mkdtempSync(join(tmpdir(), 'sphere-evaluation-layout-'))
const cssLinks = cssFiles.map(file => '<link rel="stylesheet" href="' +
  pathToFileURL(join(dist,file)).href + '">').join('\n')
const category = ['Review','Attention','Data limited','Normal']
  .map(label => '<button class="rundeckWorkloadCategory"><strong>24</strong><span>'+label+'</span></button>').join('')
const row = name => `<section class="rundeckAppEvalLane">
  <div class="rundeckAppEvalIdentity"><strong>${name}</strong><small>140 linked</small></div>
  <div class="rundeckAppEvalSummary"><div class="rundeckAppEvalBar" style="display:flex">
    <span style="background:#d97878;width:8%"></span>
    <span style="background:#dfbe70;width:58%"></span>
    <span style="background:#909ba9;width:18%"></span>
    <span style="background:#62b896;width:16%"></span>
  </div><button class="rundeckAppEvalToggle">Details</button></div>
  <div class="rundeckAppEvalBreakdown"><span><strong>2</strong></span>
  <span><strong>79</strong></span><span><strong>27</strong></span>
  <span><strong>28</strong></span></div>
</section>`
const lanes = ['APP1','APP2','APP3','APP4','APP5'].map(row).join('\n')

try {
  for (const fit of [false,true]) {
    for (const theme of ['dark','light']) {
      const html=`<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8">
      ${cssLinks}
      <style>
      body { margin:0; }
      .fixtureRoot { width:1536px; min-height:900px; margin:0 auto; }
      .fixtureRoot .rundeckJobsProgramsOverview { width:100%; min-width:0; }
      </style>
      </head><body><div class="appShell fixtureRoot">
      <div class="rundeckPanel"><div class="spherePerformanceShell">
      <nav class="spherePerformanceSidebar">SAP Operations</nav>
      <main class="spherePerformanceMain"><div class="spherePerformancePage">
      <section class="rundeckMonitoring rundeckCockpitV13491"
        ${fit ? 'data-viewport-fit="true" style="--sphere-overview-room:710px"' : ''}>
        <section class="rundeckTopBandV13454 is-unified-app-infra" style="min-height:75px"></section>
        <section class="rundeckTrendBandV13454" style="min-height:250px"></section>
        <section class="rundeckJobsProgramsOverview"><div class="rundeckJobsProgramsHealthSide">
          <section class="rundeckWorkloadHealth is-by-app">
            <div class="rundeckWorkloadOverviewHead">
              <header class="rundeckWorkloadHealthTitle"><span><strong>Job &amp; Program Evaluation</strong></span></header>
              <div class="rundeckWorkloadHealthLegend">${category}</div>
            </div>
            <div class="rundeckAppEvaluationLanes">
              <div class="rundeckAppEvalColumnHead"><span>APP</span><span>Status</span><div>${category}</div></div>
              ${lanes}
            </div>
          </section>
        </div></section>
      </section></div></main></div></div></div>
      <script>
        window.addEventListener('load',()=>{
          const health=document.querySelector('.rundeckWorkloadHealth')
          const head=document.querySelector('.rundeckWorkloadOverviewHead')
          const lanes=document.querySelector('.rundeckAppEvaluationLanes')
          const first=document.querySelector('.rundeckAppEvalLane')
          const healthWidth=health.getBoundingClientRect().width
          const laneWidth=lanes.getBoundingClientRect().width
          const rowWidth=first.getBoundingClientRect().width
          const parentLayout=getComputedStyle(health).display
          const headLayout=getComputedStyle(head).display
          const ok=healthWidth>700 && laneWidth/healthWidth>.93 &&
            rowWidth/healthWidth>.93 && parentLayout==='flex' && headLayout==='grid'
          document.body.setAttribute('data-geometry',ok?'PASS':'FAIL')
          document.body.setAttribute('data-actual',[
            healthWidth.toFixed(1),laneWidth.toFixed(1),rowWidth.toFixed(1),
            parentLayout,headLayout].join(','))
        })
      </script></body></html>`
      const filename=join(temp,`layout-${fit?'fitted':'natural'}-${theme}.html`)
      writeFileSync(filename,html)
      const run=spawnSync(chrome,[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--allow-file-access-from-files','--window-size=1536,960',
        '--virtual-time-budget=1500','--dump-dom',pathToFileURL(filename).href
      ],{encoding:'utf8',timeout:30000,maxBuffer:5*1024*1024})
      if (run.status!==0 || !run.stdout.includes('data-geometry="PASS"')) {
        const details=run.stdout.match(/data-(?:geometry|actual)="[^"]*"/g)
        throw new Error(`LAYOUT=FAIL fit=${fit} theme=${theme} result=${run.status} data=${details} ${run.stderr?.slice(-1000)}`)
      }
      const details=run.stdout.match(/data-actual="[^"]*"/)?.[0]
      console.log(`LAYOUT=PASS fit=${fit} theme=${theme} ${details}`)
    }
  }
} finally {
  rmSync(temp,{recursive:true,force:true})
}

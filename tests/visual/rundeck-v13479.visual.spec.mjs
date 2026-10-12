import { test, expect } from '@playwright/test'

const TARGET = process.env.SPHERE_VISUAL_BASE_URL || 'https://sphere.astraotoparts.co.id/dev/#/tool/logs'

// Emit actionable actual-DOM geometry only when Playwright has a failed test.
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return
  try {
    const geometry = await page.evaluate(() => {
      const rect = (el) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y),
          w: Math.round(r.width), h: Math.round(r.height) }
      }
      const dialog = document.querySelector('.rundeckWorkspaceDrawer')
      const nav = dialog?.querySelector('.rundeckAnalysisRelatedNav')
      const cards = [...document.querySelectorAll('.rundeckAnalysisRailV13456 .rundeckAnalysisActions>button')]
      const hit = (el) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        const x = r.left + r.width / 2, y = r.top + r.height / 2
        const found = document.elementFromPoint(x, y)
        return { rect: rect(el), hit: found?.outerHTML?.slice(0, 150) || null }
      }
      return {
        viewport: { innerW: innerWidth, innerH: innerHeight,
          visualW: visualViewport?.width, visualH: visualViewport?.height,
          scrollY, clientW: document.documentElement.clientWidth,
          scrollW: document.documentElement.scrollWidth },
        dialog: rect(dialog),
        portal: rect(document.querySelector('.rundeckWorkspacePortal')),
        viewportVars: document.querySelector('.rundeckWorkspacePortal') ? {
          x:getComputedStyle(document.querySelector('.rundeckWorkspacePortal')).getPropertyValue('--sphere-dialog-viewport-x').trim(),
          y:getComputedStyle(document.querySelector('.rundeckWorkspacePortal')).getPropertyValue('--sphere-dialog-viewport-y').trim(),
          h:getComputedStyle(document.querySelector('.rundeckWorkspacePortal')).getPropertyValue('--sphere-dialog-viewport-h').trim()
        } : null,
        dialogStyle: dialog ? { height: getComputedStyle(dialog).height,
          top: getComputedStyle(dialog).top,
          transform: getComputedStyle(dialog).transform,
          overflow: getComputedStyle(dialog).overflow } : null,
        backdrop: rect(document.querySelector('.rundeckWorkspaceModalBackdrop')),
        header: rect(dialog?.querySelector('header')),
        navigation: rect(nav),
        tabs: [...(nav?.querySelectorAll('button') || [])].map(el => ({
          text: el.textContent, pressed: el.getAttribute('aria-pressed'), ...hit(el) })),
        cards: cards.map(el => ({ text: el.textContent?.trim().slice(0, 45), ...hit(el) })),
        overflowOffenders: [...document.querySelectorAll('body *')]
          .filter(el => {
            const r = el.getBoundingClientRect()
            const style = getComputedStyle(el)
            return r.width > 0 && r.right > document.documentElement.clientWidth + 2
              && style.display !== 'none' && style.position !== 'fixed'
          })
          .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)
          .slice(0, 18)
          .map(el => {
            const r = el.getBoundingClientRect()
            return { tag: el.tagName.toLowerCase(), className: String(el.className?.baseVal || el.className || '').slice(0, 100),
              right: Math.round(r.right), width: Math.round(r.width),
              minWidth: getComputedStyle(el).minWidth, overflowX: getComputedStyle(el).overflowX }
          })
      }
    })
    console.log('VISUAL_FAIL_BRIEF=' + JSON.stringify({
      test: info.title,
      viewport: geometry.viewport,
      dialog: geometry.dialog,
      portal: geometry.portal,
      viewportVars: geometry.viewportVars,
      overflowOffenders: geometry.overflowOffenders.slice(0, 8)
    }))
    console.log('VISUAL_GEOMETRY_DEBUG=' + JSON.stringify({ test: info.title, ...geometry }))
  } catch (err) {
    console.log('VISUAL_GEOMETRY_DEBUG_ERROR=' + String(err))
  }
})

async function openCockpit(page) {
  await page.goto(TARGET, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.rundeckPanel')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.rundeckCockpitV13456')).toBeVisible()
}

test('v1.34.79 cockpit keeps operational sections reachable at desktop target sizes', async ({ page }) => {
  await openCockpit(page)
  const monitoring = page.locator('.rundeckCockpitV13456')
  const top = monitoring.locator('.rundeckTopBandV13454')
  const trends = monitoring.locator('.rundeckTripleTrendGrid')
  const shortcuts = monitoring.locator('.rundeckAnalysisRailV13456')
  const jobs = monitoring.locator('.rundeckJobsProgramsWorkspace')
  for (const section of [top, trends, shortcuts, jobs]) await expect(section).toBeVisible()
  await expect(monitoring.locator('.rundeckJobsProgramsModes').getByRole('tab', { name: 'Live' })).toBeVisible()
  await expect(monitoring.locator('.rundeckJobsProgramsModes').getByRole('tab', { name: 'Review' })).toBeVisible()
  await expect(monitoring.locator('.rundeckJobsProgramsModes').getByRole('tab', { name: 'Search' })).toBeVisible()
  const metrics = await page.evaluate(() => {
    const get = (selector) => document.querySelector(selector)
    const table = get('.rundeckJobsProgramsWorkspaceBody .rundeckCurrentWorkloadTableWrap')
    const jobsPanel = get('.rundeckJobsProgramsWorkspace')
    const fonts = [...document.querySelectorAll('.rundeckJobsProgramsModes button')].map(el => Number.parseFloat(getComputedStyle(el).fontSize))
    return {
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      jobsBottom: jobsPanel?.getBoundingClientRect().bottom ?? null,
      viewportHeight: window.innerHeight,
      tableOverflowY: table ? getComputedStyle(table).overflowY : 'missing',
      fonts,
    }
  })
  expect(metrics.overflowX).toBeLessThanOrEqual(2)
  expect(metrics.fonts.every(n => Number.isFinite(n) && n >= 10)).toBe(true)
  expect(metrics.tableOverflowY).toMatch(/auto|scroll/)
  // 1366x768 deliberately permits page scroll rather than clipping the workload.
  if (page.viewportSize().height >= 864) {
    expect(metrics.jobsBottom).toBeLessThanOrEqual(metrics.viewportHeight + 30)
  }
  await test.info().attach('cockpit-viewport', { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' })
})

test('Android-sized viewport does not introduce horizontal page overflow', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'laptop-1366') test.skip()
  await page.setViewportSize({ width: 393, height: 852 })
  await openCockpit(page)
  const widthOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(widthOverflow).toBeLessThanOrEqual(2)
  await expect(page.locator('.rundeckJobsProgramsWorkspace')).toBeVisible()
  await expect(page.locator('.rundeckAnalysisRailV13456')).toBeVisible()
  await test.info().attach('cockpit-android-393', { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' })
})

test('APP trace focus is selectable with All reset without hiding saved charts', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'desktop-1536') test.skip()
  await openCockpit(page)
  const plots = page.locator('.rundeckTrendPlot')
  await expect(plots.first()).toBeVisible({ timeout: 20_000 })
  const focus = page.locator('.rundeckTrendSharedControls').getByRole('group', { name: 'Highlight APP trace' })
  const app = focus.getByRole('button', { name: /APP[1-5]/ }).first()
  await expect(app).toBeVisible()
  await app.click()
  await expect(app).toHaveAttribute('aria-pressed', 'true')
  await focus.getByRole('button', { name: 'All' }).click()
  await expect(focus.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
  await expect(plots.first().locator('canvas')).toBeVisible()
})

test('Jobs and Programs mode tabs work with keyboard arrows and Home', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'desktop-1536') test.skip()
  await openCockpit(page)
  const tabs = page.locator('.rundeckJobsProgramsModes')
  const live = tabs.getByRole('tab', { name: 'Live' })
  const review = tabs.getByRole('tab', { name: 'Review' })
  const search = tabs.getByRole('tab', { name: 'Search' })
  await live.focus()
  await live.press('ArrowRight')
  await expect(review).toHaveAttribute('aria-selected', 'true')
  await review.press('ArrowRight')
  await expect(search).toHaveAttribute('aria-selected', 'true')
  await search.press('Home')
  await expect(live).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.rundeckJobsProgramsWorkspaceBody')).toHaveAttribute('role', 'tabpanel')
})


test('v1.34.82 one APP click opens the merged SAP and Infrastructure modal', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'desktop-1536') test.skip()
  await openCockpit(page)
  const merged = page.locator('.rundeckUnifiedAppInfra')
  const cards = merged.getByRole('group', { name: 'Select APP server' }).getByRole('button')
  await expect(cards).toHaveCount(5, { timeout: 30_000 })
  await expect(merged.locator('.rundeckUnifiedAppInfraDetail')).toHaveCount(0)
  await cards.nth(4).click()
  const modal = page.getByRole('dialog', { name: /APP5 Analysis/ })
  await expect(modal).toBeVisible({ timeout: 30_000 })
  await expect(modal.getByRole('region', { name: 'SAP performance evidence' })).toBeVisible()
  await expect(modal.getByRole('region', { name: 'Infrastructure evidence' })).toBeVisible()
  await expect(modal.getByRole('group', { name: 'Select Infrastructure APP' })).toHaveCount(0)
  await expect(modal.getByRole('button', { name: 'Close analysis' })).toBeVisible()
  await modal.getByRole('button', { name: 'Close analysis' }).click()
  await expect(modal).toHaveCount(0)
})

test('v1.34.87 analysis groups have independent bounded surfaces', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'desktop-1536') test.skip()
  await openCockpit(page)
  const rail = page.locator('.rundeckAnalysisRailV13456')
  const cards = rail.locator('.rundeckAnalysisActions>button')
  await expect(cards).toHaveCount(6, { timeout: 30_000 })
  const geometry = await cards.evaluateAll(nodes=>nodes.map(node=>{
    const rect=node.getBoundingClientRect()
    const text=node.querySelector('strong,small')
    const childRect=text?.getBoundingClientRect()
    return { x:rect.x,right:rect.right,textRight:childRect?.right || rect.x }
  }))
  for (let i=0;i<geometry.length;i++){
    expect(geometry[i].textRight).toBeLessThanOrEqual(geometry[i].right+1)
  }
  await test.info().attach('flat-analysis-actions',{body:await page.screenshot({animations:'disabled'}),contentType:'image/png'})
})

test('v1.34.82 loaded Jobs & Programs rows remain scrollable, not single-row clipped', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'desktop-1536') test.skip()
  await openCockpit(page)
  const table=page.locator('.rundeckJobsProgramsWorkspaceBody.is-live .rundeckCurrentWorkloadTableWrap')
  await expect(table).toBeVisible({timeout:30_000})
  await expect.poll(()=>table.locator('tbody tr').count(),{timeout:30_000}).toBeGreaterThan(1)
  const data=await table.evaluate(el=>({
    height:el.clientHeight,
    rowCount:el.querySelectorAll('tbody tr').length,
    overflowY:getComputedStyle(el).overflowY,
    scrollHeight:el.scrollHeight,
  }))
  expect(data.height).toBeGreaterThan(130)
  expect(data.rowCount).toBeGreaterThan(1)
  expect(data.overflowY).toMatch(/auto|scroll/)
  expect(data.scrollHeight).toBeGreaterThanOrEqual(data.height)
})

test('v1.34.83 APP5 modal respects viewport bounds after 220ms motion, Escape restores focus', async ({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'})
 await openCockpit(page)
 const card=page.locator('.rundeckUnifiedAppInfra').getByRole('group',{name:'Select APP server'}).getByRole('button').nth(4)
 await card.click()
 const modal=page.getByRole('dialog',{name:/APP5 Analysis/})
 await expect(modal).toBeVisible()
 await page.waitForTimeout(260)
 const box=await modal.evaluate(el=>{
  const r=el.getBoundingClientRect(),h=el.querySelector(':scope > header').getBoundingClientRect()
  const c=el.querySelector('.rundeckWorkspaceClose').getBoundingClientRect()
  const v=window.visualViewport
  return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,center:(r.left+r.right)/2,
   vx:v?.offsetLeft||0,vy:v?.offsetTop||0,
   vw:v?.width||innerWidth,vh:v?.height||innerHeight,
   headerL:h.left,headerR:h.right,closeL:c.left,closeR:c.right}
 })
 expect(box.left).toBeGreaterThanOrEqual(box.vx-1)
 expect(box.right).toBeLessThanOrEqual(box.vx+box.vw+1)
 expect(box.top).toBeGreaterThanOrEqual(box.vy-1)
 expect(box.bottom).toBeLessThanOrEqual(box.vy+box.vh+1)
 expect(Math.abs(box.center-(box.vx+box.vw/2))).toBeLessThan(2)
 expect(box.headerL).toBeGreaterThanOrEqual(box.left)
 expect(box.headerR).toBeLessThanOrEqual(box.right+1)
 expect(box.closeL).toBeGreaterThanOrEqual(box.left)
 expect(box.closeR).toBeLessThanOrEqual(box.right+1)
 await page.keyboard.press('Escape')
 await expect(modal).toHaveCount(0)
 await expect(card).toBeFocused()
})
test('v1.34.87 flat actions remain bounded without extra nested card surfaces',async ({page})=>{
  await openCockpit(page)
  const actions=page.locator('.rundeckAnalysisRailV13456 .rundeckAnalysisActions>button')
  await expect(actions).toHaveCount(6,{timeout:30000})
  const geometry=await actions.evaluateAll(nodes=>nodes.map(el=>{
    const r=el.getBoundingClientRect()
    return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,vw:innerWidth}
  }))
  for(const rect of geometry){
    expect(rect.left).toBeGreaterThanOrEqual(-1)
    expect(rect.right).toBeLessThanOrEqual(rect.vw+1)
  }
  for(let i=0;i<geometry.length;i++)for(let j=i+1;j<geometry.length;j++){
    const a=geometry[i],b=geometry[j]
    expect(Math.min(a.right,b.right)-Math.max(a.left,b.left)>2 &&
      Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2).toBe(false)
  }
})

test('v1.34.83 Live workload scroll geometry with actual rows or DOM-only empty-source fixture',async ({page})=>{
 await openCockpit(page)
 const table=page.locator('.rundeckJobsProgramsWorkspaceBody.is-live .rundeckCurrentWorkloadTableWrap')
 await expect(table).toBeVisible({timeout:30000})
 const data=await table.evaluate(el=>{
  const tbody=el.querySelector('tbody')
  const emptyText='No job or program observed in this collection.'
  const currentRows=[...tbody.querySelectorAll('tr')].filter(row=>!row.textContent.includes(emptyText))
  const observed=currentRows.length
  const hadEmptyPlaceholder=observed===0 && tbody.textContent.includes(emptyText)
  // No SAP observations is a valid empty state, not a scroll bug.
  // Still validate the real table's overflow CSS with browser-only layout rows.
  // This does NOT assert that API records exist.
  if(observed<30){
   if(hadEmptyPlaceholder) tbody.replaceChildren()
   for(let i=observed;i<40;i++){
    const tr=document.createElement('tr')
    for(const content of ['APP5','Visual fixture '+String(i+1),'3.2%','0.1 GB','1','DIA 1']){
     const td=document.createElement('td')
     td.textContent=content
     tr.appendChild(td)
    }
    tbody.appendChild(tr)
   }
  }
  el.scrollTop=el.scrollHeight
  const last=tbody.querySelector('tr:last-child')?.getBoundingClientRect()
  const bounds=el.getBoundingClientRect()
  return {actualRows:observed,emptyState:hadEmptyPlaceholder,usedDomFixture:observed<30,
   renderedRows:tbody.querySelectorAll('tr').length,overflowY:getComputedStyle(el).overflowY,
   scrollTop:el.scrollTop,max:el.scrollHeight-el.clientHeight,
   lastBottom:last?.bottom,lastTop:last?.top,containerBottom:bounds.bottom,containerTop:bounds.top}
 })
 if(data.usedDomFixture){
  console.log(`WORKLOAD_DATA_EVIDENCE=ONLY_${data.actualRows}_REAL_ROWS; SCROLL_LAYOUT=DOM_FIXTURE_ONLY`)
  if(data.actualRows===0) expect(data.emptyState).toBe(true)
 }
 expect(data.renderedRows).toBeGreaterThan(1)
 expect(data.overflowY).toMatch(/auto|scroll/)
 expect(data.max).toBeGreaterThan(0)
 expect(data.scrollTop).toBeGreaterThanOrEqual(data.max-2)
 expect(data.lastTop).toBeGreaterThanOrEqual(data.containerTop-2)
 expect(data.lastBottom).toBeLessThanOrEqual(data.containerBottom+2)
})

// Cloudflare-inspired accents are purely decorative: verify interaction
// without nudging neighboring tiles, and honor accessibility preferences.
test('v1.34.84 desktop hover lights APP and shortcut cards without shifting grid neighbors',async ({page},testInfo)=>{
 if(testInfo.project.name!=='desktop-1536') test.skip()
 await page.emulateMedia({reducedMotion:'no-preference'})
 await openCockpit(page)
 const cards=page.locator('.rundeckUnifiedAppInfra .rundeckUnifiedAppCard')
 await expect(cards).toHaveCount(5,{timeout:30000})
 const first=cards.first(), second=cards.nth(1)
 const neighborBefore=await second.boundingBox()
 await first.hover()
 await page.waitForTimeout(270)
 const style=await first.evaluate(el=>({
  transform:getComputedStyle(el).transform,
  light:Number(getComputedStyle(el,'::before').opacity),
  duration:getComputedStyle(el).transitionDuration,
 }))
 expect(style.transform).not.toBe('none')
 expect(style.light).toBeGreaterThan(.9)
 expect(style.duration).toContain('0.22s')
 const neighborAfter=await second.boundingBox()
 expect(Math.abs(neighborBefore.x-neighborAfter.x)).toBeLessThan(1)
 expect(Math.abs(neighborBefore.y-neighborAfter.y)).toBeLessThan(1)
 const tile=page.locator('.rundeckAnalysisRailV13456 .rundeckEvidenceCard').first()
 await tile.hover()
 await page.waitForTimeout(260)
 const tileLight=await tile.evaluate(el=>Number(getComputedStyle(el,'::before').opacity))
 expect(tileLight).toBeGreaterThan(.9)
 const review=page.getByRole('tab',{name:'Review'})
 await review.click()
 await expect(review).toHaveAttribute('aria-selected','true')
 await expect.poll(()=>review.evaluate(el=>Number(getComputedStyle(el,'::after').opacity))).toBeGreaterThan(.9)
})
test('v1.34.84 reduced-motion keeps APP interaction and modal accessible with zero animation',async ({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'})
 await openCockpit(page)
 const app=page.locator('.rundeckUnifiedAppInfra .rundeckUnifiedAppCard').first()
 await expect(app).toBeVisible()
 const duration=await app.evaluate(el=>getComputedStyle(el).transitionDuration)
 expect(duration).toBe('0s')
 await app.click()
 const modal=page.getByRole('dialog',{name:/APP[1-5] Analysis/})
 await expect(modal).toBeVisible()
 const scrim=page.locator('.rundeckWorkspaceModalBackdrop')
 await expect(scrim).toBeVisible()
 expect(await scrim.evaluate(el=>getComputedStyle(el).animationName)).toBe('none')
 await page.keyboard.press('Escape')
 await expect(modal).toHaveCount(0)
})

// v1.34.85 Theme-specific visual contracts: real browser layout, no fabricated SAP data.
test('v1.34.87 light theme, table contrast and three analysis groups are bounded',async ({page})=>{
  await openCockpit(page)
  await page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'))
  await expect(page.locator('.rundeckUnifiedAppCard').first()).toBeVisible({timeout:30000})
  // The six flat buttons exist while independent evidence requests settle.
  await expect(page.locator('.rundeckAnalysisRailV13456 .rundeckAnalysisActions>button')).toHaveCount(6,{timeout:30000})
  const metrics=await page.evaluate(()=>{
    const style=getComputedStyle(document.documentElement)
    const cards=[...document.querySelectorAll('.rundeckAnalysisRailV13456 .rundeckAnalysisActions>button')]
    const rows=[...document.querySelectorAll('.rundeckCurrentWorkloadTableWrap tbody tr')]
    return {
      page:style.getPropertyValue('--sphere-page').trim(),text:style.getPropertyValue('--sphere-text').trim(),
      surface:getComputedStyle(document.querySelector('.rundeckUnifiedAppCard')).backgroundColor,
      count:cards.length,rows:rows.length,
      widthOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      cards:cards.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}})
    }
  })
  expect(metrics.page).toBe('#f8fafc')
  expect(metrics.text).toBe('#111827')
  expect(metrics.surface).toBe('rgb(255, 255, 255)')
  expect(metrics.count).toBe(6)
  expect(metrics.widthOverflow).toBeLessThanOrEqual(2)
  for(let i=0;i<metrics.count;i++){
    const a=metrics.cards[i]
    expect(a.left).toBeGreaterThanOrEqual(-1)
    expect(a.right).toBeLessThanOrEqual(page.viewportSize().width+1)
    for(let j=i+1;j<metrics.count;j++){
      const b=metrics.cards[j]
      expect(Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2).toBe(false)
    }
  }
})
test('v1.34.85 dark theme retains dark tokens and independent status labels',async ({page})=>{
  await openCockpit(page)
  await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'))
  await expect(page.locator('.rundeckUnifiedAppCard').first()).toBeVisible({timeout:30000})
  const metrics=await page.evaluate(()=>{
    const style=getComputedStyle(document.documentElement)
    return {page:style.getPropertyValue('--sphere-page').trim(),
      card:getComputedStyle(document.querySelector('.rundeckUnifiedAppCard')).backgroundColor,
      label:document.querySelector('.rundeckUnifiedAppCardTop em')?.textContent||'',
      infra:document.querySelector('.rundeckUnifiedAppCardInfra small')?.textContent||''}
  })
  expect(metrics.page).not.toBe('#f8fafc')
  expect(metrics.card).not.toBe('rgb(255, 255, 255)')
  expect(metrics.label).toMatch(/SAP · /)
  expect(metrics.infra).toMatch(/Infra FS /)
})
test('v1.34.85 APP modal infrastructure snapshot and history fit panel width',async ({page},testInfo)=>{
  if(testInfo.project.name!=='desktop-1536') test.skip()
  await openCockpit(page)
  await page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'))
  const app=page.locator('.rundeckUnifiedAppCard').nth(1)
  await app.click()
  const modal=page.getByRole('dialog',{name:/APP2 Analysis/})
  await expect(modal).toBeVisible()
  const pane=modal.locator('.rundeckUnifiedAnalysisPane').nth(1)
  await expect(pane.locator('.rundeckInfraGrid')).toBeVisible({timeout:30000})
  await expect(pane.locator('.rundeckInfraTrendWorkspace')).toBeVisible()
  const boxes=await pane.evaluate(el=>{
    const snap=el.querySelector('.rundeckInfraCurrent')?.getBoundingClientRect()
    const history=el.querySelector('.rundeckInfraTrendWorkspace')?.getBoundingClientRect()
    const grid=el.querySelector('.rundeckInfraGrid')?.getBoundingClientRect()
    const chart=el.querySelector('.rundeckInfraChartWrap svg')?.getBoundingClientRect()
    const pane=el.getBoundingClientRect()
    return {pane:{left:pane.left,right:pane.right},snap:{top:snap.top,bottom:snap.bottom,left:snap.left,right:snap.right},
      history:{top:history.top,left:history.left,right:history.right},grid:{left:grid.left,right:grid.right},
      chart:chart&&{left:chart.left,right:chart.right}}
  })
  expect(boxes.history.top).toBeGreaterThanOrEqual(boxes.snap.bottom-2)
  expect(boxes.snap.left).toBeGreaterThanOrEqual(boxes.pane.left-2)
  expect(boxes.grid.right).toBeLessThanOrEqual(boxes.pane.right+2)
  expect(boxes.history.right).toBeLessThanOrEqual(boxes.pane.right+2)
  if(boxes.chart) expect(boxes.chart.right).toBeLessThanOrEqual(boxes.pane.right+2)
  await modal.getByRole('button',{name:'Close analysis'}).click()
  await expect(modal).toHaveCount(0)
})


test('v1.34.86 every analysis destination is centered and focus-trapped',async ({page})=>{
  await openCockpit(page)
  await expect(page.locator('.rundeckAnalysisRailV13456')).toBeVisible()
  const labels=['Correlated Events','SAP Availability','SAP Issues','Infrastructure Analysis','System Data']
  for(const label of labels){
    await page.locator('.rundeckAnalysisRailV13456').getByRole('button',{name:new RegExp(label)}).first().click()
    const modal=page.getByRole('dialog')
    await expect(modal).toBeVisible()
    await expect(modal).toHaveAttribute('aria-modal','true')
    const box=await modal.boundingBox()
    const vp=await page.evaluate(()=>{
      const v=window.visualViewport
      return {x:v?.offsetLeft||0,y:v?.offsetTop||0,
        width:v?.width||innerWidth,height:v?.height||innerHeight}
    })
    expect(Math.abs((box.x+box.width/2)-(vp.x+vp.width/2))).toBeLessThan(3)
    expect(Math.abs((box.y+box.height/2)-(vp.y+vp.height/2))).toBeLessThan(3)
    expect(box.x).toBeGreaterThanOrEqual(vp.x-2)
    expect(box.y).toBeGreaterThanOrEqual(vp.y-2)
    expect(box.x+box.width).toBeLessThanOrEqual(vp.x+vp.width+2)
    expect(box.y+box.height).toBeLessThanOrEqual(vp.y+vp.height+2)
    await expect(page.locator('.rundeckWorkspaceModalBackdrop')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(modal).toHaveCount(0)
  }
})
test('v1.34.86 paired evidence and SAP Health links change content in the same centered modal',async ({page})=>{
  await openCockpit(page)
  await page.locator('.rundeckAnalysisRailV13456').getByRole('button',{name:/Correlated Events/}).click()
  let modal=page.getByRole('dialog',{name:'Correlated Events'})
  await expect(modal).toBeVisible()
  const nav=modal.getByRole('group',{name:'Related analysis'})
  await expect(nav.getByRole('button',{name:'Correlated Events'})).toHaveAttribute('aria-pressed','true')
  // History is only enabled for selected workload identities, never for anonymous data.
  const history=nav.getByRole('button',{name:'Observation History'})
  if(await history.isEnabled()){
    await history.scrollIntoViewIfNeeded()
    const hittable=await history.evaluate(el=>{
      const rect=el.getBoundingClientRect()
      const target=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)
      return target===el||el.contains(target)
    })
    expect(hittable).toBe(true)
    await history.click()
    modal=page.getByRole('dialog',{name:'Observation History'})
    await expect(modal).toBeVisible()
  }
  await page.keyboard.press('Escape')
  await page.locator('.rundeckAnalysisRailV13456').getByRole('button',{name:/SAP Availability/}).click()
  modal=page.getByRole('dialog',{name:'SAP Availability'})
  await expect(modal).toBeVisible()
  const issues=modal.getByRole('group',{name:'Related analysis'}).getByRole('button',{name:'SAP Issues'})
  await issues.scrollIntoViewIfNeeded()
  expect(await issues.evaluate(el=>{
    const rect=el.getBoundingClientRect()
    const target=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)
    return target===el||el.contains(target)
  })).toBe(true)
  await issues.click()
  modal=page.getByRole('dialog',{name:'SAP Issues'})
  await expect(modal).toBeVisible()
  await page.keyboard.press('Escape')
})

test('v1.34.87 selected APP focus is shared by all three saved trend plots',async ({page})=>{
  await openCockpit(page)
  const selector=page.locator('.rundeckTrendSharedControls').getByRole('group',{name:'Highlight APP trace'})
  await expect(selector).toHaveCount(1)
  const app=selector.getByRole('button',{name:/APP[1-5]/}).first()
  await expect(app).toBeVisible({timeout:30000})
  await app.click()
  await expect(app).toHaveAttribute('aria-pressed','true')
  const key=(await app.textContent()).trim().match(/APP[1-5]/)?.[0]
  if(key) await expect(page.locator('.rundeckUnifiedAppCard').filter({hasText:key}).first()).toHaveAttribute('aria-pressed','true')
  await expect(page.locator('.rundeckTrendPlot')).toHaveCount(6)
  await expect(page.locator('.rundeckTrendPlot .rundeckTrendHostLegend')).toHaveCount(0)
  await selector.getByRole('button',{name:'All'}).click()
  await expect(selector.getByRole('button',{name:'All'})).toHaveAttribute('aria-pressed','true')
})

test('v1.34.87 System Data is one of six flat analysis actions',async ({page})=>{
  await openCockpit(page)
  const rail=page.locator('.rundeckAnalysisRailV13456')
  await expect(rail.locator('.rundeckAnalysisActions>button')).toHaveCount(6)
  await expect(rail.getByRole('button',{name:/System Data/})).toHaveCount(1)
  await expect(rail.getByRole('button',{name:/SAP Issues/})).toBeVisible()
})

test('v1.34.87 Android analysis groups fit the viewport without horizontal overflow',async ({page},info)=>{
  if(info.project.name!=='laptop-1366') test.skip()
  await page.setViewportSize({width:393,height:852})
  await openCockpit(page)
  const groups=page.locator('.rundeckAnalysisActions>button')
  await expect(groups).toHaveCount(6,{timeout:30000})
  const layout=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    groups:[...document.querySelectorAll('.rundeckAnalysisActions>button')].map(n=>{
      const r=n.getBoundingClientRect();return {l:r.left,r:r.right}
    })
  }))
  expect(layout.overflow).toBeLessThanOrEqual(2)
  for(const card of layout.groups){
    expect(card.l).toBeGreaterThanOrEqual(-1)
    expect(card.r).toBeLessThanOrEqual(394)
    expect(card.r-card.l).toBeGreaterThan(100)
  }
})

test('v1.34.87 theme selector updates the palette in place without page reload',async ({page},info)=>{
  if(info.project.name!=='desktop-1536') test.skip()
  await openCockpit(page)
  const selector=page.getByRole('combobox',{name:'Display theme'})
  await expect(selector).toBeVisible()
  await selector.selectOption('light')
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.theme)).toBe('light')
  await selector.selectOption('dark')
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.theme)).toBe('dark')
})

// Only a retained Job/Program identity is actionable. Do not click the
// placeholder tbody row while the DEV collection and workload API are loading.
async function openActionableLiveJob(page){
  const table=page.locator('.rundeckJobsProgramsWorkspaceBody.is-live .rundeckCurrentWorkloadTableWrap')
  await expect(table).toBeVisible({timeout:30000})
  const row=table.locator('tbody tr[role="button"]').first()
  try {
    await expect(row).toBeVisible({timeout:30000})
  } catch (error) {
    const evidence=await page.evaluate(()=>{
      const tbody=document.querySelector('.rundeckJobsProgramsWorkspaceBody.is-live .rundeckCurrentWorkloadTableWrap tbody')
      return {
        visibleRows:tbody?.querySelectorAll('tr').length || 0,
        actionableRows:tbody?.querySelectorAll('tr[role="button"]').length || 0,
        rowText:tbody?.textContent?.trim().slice(0,200) || '',
        stateText:document.querySelector('.rundeckCurrentWorkloadState')?.textContent?.trim() || '',
        countText:document.querySelector('.rundeckCurrentWorkloadCount')?.textContent?.trim() || ''
      }
    })
    throw new Error('No actionable Live Job row after API readiness window: '+JSON.stringify(evidence)+'; '+error.message)
  }
  const jobButton=row.locator('.rundeckCurrentWorkloadName button')
  await expect(jobButton).toBeEnabled()
  const rawKey=await jobButton.getAttribute('title')
  await jobButton.click()
  const modal=page.locator('.rundeckWorkspaceDrawer.is-performance')
  await expect(modal).toBeVisible({timeout:15000})
  if(rawKey) await expect(modal).toHaveAttribute('aria-label',rawKey)
  return modal
}

test('v1.34.88 desktop Job drawer has one working related-analysis rail and Back stack',async ({page})=>{
  await openCockpit(page)
  const modal=await openActionableLiveJob(page)
  const related=modal.getByRole('group',{name:'Related analysis'})
  await expect(related).toHaveCount(1)
  await expect(modal.locator('.rundeckPerformanceDrawerEvidence')).toHaveCount(0)
  await expect(related.getByRole('button')).toHaveCount(6)
  await expect(modal.locator('.rundeckJobMetricLegend')).toBeVisible()
  await page.screenshot({path:'test-results/sphere-v13488-job-'+(page.viewportSize()?.width || 'desktop')+'.png',fullPage:false})
  await related.getByRole('button',{name:'Observation History'}).click()
  await expect(page.getByRole('dialog',{name:'Observation History'})).toBeVisible()
  await page.getByRole('dialog',{name:'Observation History'}).getByRole('button',{name:/Back to/}).click()
  await expect(page.locator('.rundeckWorkspaceDrawer.is-performance')).toBeVisible()
  const returned=page.locator('.rundeckWorkspaceDrawer.is-performance')
  await returned.getByRole('group',{name:'Related analysis'}).getByRole('button',{name:'Infrastructure'}).click()
  await expect(page.getByRole('dialog',{name:'Infrastructure Analysis'})).toBeVisible()
  await page.getByRole('dialog',{name:'Infrastructure Analysis'}).getByRole('button',{name:/Back to/}).click()
  await expect(page.locator('.rundeckWorkspaceDrawer.is-performance')).toBeVisible()
})

test('v1.34.88 desktop Job and Infrastructure drawers remain inside viewport',async ({page})=>{
  await openCockpit(page)
  const modal=await openActionableLiveJob(page)
  const bounds=await modal.evaluate(el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,vw:innerWidth,vh:innerHeight}})
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.y).toBeGreaterThanOrEqual(0)
  expect(bounds.right).toBeLessThanOrEqual(bounds.vw+2)
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.vh+2)
  // The outer drawer opens immediately, but the retained Job history and
  // WP projection are asynchronous. Wait for actual history content before
  // asserting whether retained WP rows exist or are explicitly unavailable.
  const historyContent=modal.locator('.rundeckJobHistoryContent')
  await expect(historyContent).toBeVisible({timeout:30000})
  const wpPanel=historyContent.locator('.rundeckWpSignalPanel')
  await expect(wpPanel).toHaveCount(1)
  const wpTable=wpPanel.locator('.rundeckWpSignalTableWrap')
  if(await wpTable.count()){
    const scroll=await wpTable.evaluate(el=>({scrollH:el.scrollHeight,clientH:el.clientHeight}))
    expect(scroll.scrollH-scroll.clientH).toBeLessThanOrEqual(2)
  } else {
    await expect(wpPanel).toHaveClass(/is-empty/)
    await expect(wpPanel).toContainText('WP/Trace signal was not retained')
  }
  await modal.getByRole('group',{name:'Related analysis'}).getByRole('button',{name:'Infrastructure'}).click()
  const infra=page.getByRole('dialog',{name:'Infrastructure Analysis'})
  await expect(infra).toBeVisible()
  await expect(infra.getByRole('group',{name:'Select Infrastructure APP'}).getByRole('button')).toHaveCount(5)
  await page.screenshot({path:'test-results/sphere-v13488-infra-'+(page.viewportSize()?.width || 'desktop')+'.png',fullPage:false})
})

test('v1.34.89 desktop flat analysis routes have six actual buttons and working Back',async ({page})=>{
  await openCockpit(page)
  const rail=page.locator('.rundeckAnalysisRailV13456')
  const actions=rail.locator('.rundeckAnalysisActions>button')
  await expect(actions).toHaveCount(6,{timeout:30000})
  await expect(rail.locator('.rundeckAnalysisGroup')).toHaveCount(0)
  await actions.filter({hasText:'SAP Issues'}).click()
  const issues=page.getByRole('dialog',{name:'SAP Issues'})
  await expect(issues).toBeVisible({timeout:15000})
  await issues.getByRole('button',{name:/Back to SAP Performance/}).click()
  await expect(issues).toHaveCount(0)
  await actions.filter({hasText:'Infrastructure'}).click()
  const infra=page.getByRole('dialog',{name:'Infrastructure Analysis'})
  await expect(infra).toBeVisible({timeout:15000})
  await infra.getByRole('button',{name:/Back to SAP Performance/}).click()
  await expect(infra).toHaveCount(0)
  await actions.filter({hasText:'System Data'}).click()
  const data=page.getByRole('dialog',{name:'System Data'})
  await expect(data).toBeVisible({timeout:15000})
  await data.getByRole('button',{name:/Back to SAP Performance/}).click()
  await expect(data).toHaveCount(0)
})

test('v1.34.90 desktop mockup structure presents real APP metric cells and readable chart canvas',async ({page})=>{
  await openCockpit(page)
  const title=page.locator('.rundeckLandscapeHeader h2')
  await expect(title).toContainText('SAP Performance Dashboard')
  const views=page.getByRole('navigation',{name:'Performance views'})
  await expect(views).toBeVisible()
  await expect(views.getByRole('button',{name:'Overview'})).toBeVisible()
  await expect(views.getByRole('button',{name:'Infrastructure Analysis'})).toBeVisible()
  await expect(page.locator('.rundeckUnifiedAppCards .rundeckUnifiedAppCard')).toHaveCount(5)
  const metrics=page.locator('.rundeckUnifiedAppCard').first().locator('.rundeckUnifiedMetric')
  await expect(metrics).toHaveCount(4)
  const trend=page.locator('.rundeckTripleTrendGrid .rundeckTrendChart').first()
  await expect(trend).toBeVisible({timeout:30000})
  const h=await trend.evaluate(el=>el.getBoundingClientRect().height)
  expect(h).toBeGreaterThanOrEqual(155)
  await expect(page.locator('.rundeckAnalysisActions>button')).toHaveCount(6)
  await page.screenshot({path:'test-results/sphere-v13490-overview-'+(page.viewportSize()?.width||'desktop')+'.png',fullPage:false})
})

test('v1.34.90 desktop Infrastructure modal uses history-first layout and real source selectors',async ({page})=>{
  await openCockpit(page)
  await page.getByRole('navigation',{name:'Performance views'}).getByRole('button',{name:'Infrastructure Analysis'}).click()
  const drawer=page.getByRole('dialog',{name:'Infrastructure Analysis'})
  await expect(drawer).toBeVisible({timeout:30000})
  // A visible dialog is not proof that its lazy-loaded Infrastructure API finished.
  await expect(drawer.locator('.rundeckInfra')).toBeVisible({timeout:30000})
  const hosts=drawer.getByRole('group',{name:'Select Infrastructure APP'})
  await expect(hosts).toBeVisible({timeout:30000})
  try {
    await expect(hosts.getByRole('button')).toHaveCount(5,{timeout:30000})
  } catch (error) {
    const evidence=await drawer.locator('.rundeckInfra').evaluate(el=>({
      hostButtons:el.querySelectorAll('.rundeckInfraHostCard').length,
      hostMessage:el.querySelector('.rundeckInfraHostMissing')?.textContent?.trim() || '',
      sourceError:el.querySelector('.rundeckInfraError')?.textContent?.trim() || ''
    }))
    throw new Error('Infrastructure host source not ready: '+JSON.stringify(evidence)+'; '+error.message)
  }
  const geometry=await drawer.evaluate(el=>{const box=el.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,vw:innerWidth,vh:innerHeight}})
  expect(geometry.left).toBeGreaterThanOrEqual(-1)
  expect(geometry.right).toBeLessThanOrEqual(geometry.vw+2)
  expect(geometry.top).toBeGreaterThanOrEqual(-1)
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.vh+2)
  const layout=await drawer.evaluate(el=>{
    const chart=el.querySelector('.rundeckInfraTrendWorkspace')?.getBoundingClientRect()
    const snap=el.querySelector('.rundeckInfraCurrent')?.getBoundingClientRect()
    return chart&&snap?{chartTop:chart.top,snapshotTop:snap.top}:null
  })
  expect(layout).not.toBeNull()
  expect(layout.chartTop).toBeLessThan(layout.snapshotTop)
  await page.screenshot({path:'test-results/sphere-v13490-infrastructure-'+(page.viewportSize()?.width||'desktop')+'.png',fullPage:false})
})

test('v1.34.90 desktop System Data offers actual PDF workflow entry',async ({page})=>{
  await openCockpit(page)
  await page.locator('.rundeckAnalysisActions').getByRole('button',{name:/System Data/}).click()
  const data=page.getByRole('dialog',{name:'System Data'})
  await expect(data).toBeVisible({timeout:30000})
  await expect(data.getByRole('tab',{name:/Collection History/})).toBeVisible()
  await expect(data.getByRole('tab',{name:/SPHERE Services/})).toBeVisible()
  await expect(data.getByRole('tab',{name:/Token Management/})).toBeVisible()
  await expect(data.getByRole('button',{name:'Open PDF Preview'})).toBeVisible()
  await data.getByRole('button',{name:'Open PDF Preview'}).click()
  await expect(data).toHaveCount(0)
  const report=page.getByRole('dialog',{name:'PDF preview'})
  await expect(report).toBeVisible({timeout:30000})
  await expect(report.getByTitle('SPHERE PDF preview')).toBeVisible({timeout:30000})
})
test('v1.34.90 desktop SAP Issues supports source-backed APP and indicator filters',async ({page})=>{
  await openCockpit(page)
  await page.locator('.rundeckAnalysisActions').getByRole('button',{name:/SAP Issues/}).click()
  const issues=page.getByRole('dialog',{name:'SAP Issues'})
  await expect(issues).toBeVisible({timeout:30000})
  const filters=issues.getByRole('group',{name:'Filter SAP indicators'})
  await expect(filters).toBeVisible()
  await expect(filters.getByRole('searchbox')).toBeVisible()
  await filters.getByRole('searchbox').fill('no-such-indicator-zz')
  await expect(issues.getByText('No indicators match these filters.')).toBeVisible({timeout:30000})
  await filters.getByRole('searchbox').fill('')
  await expect(filters.getByRole('combobox')).toBeVisible()
})

test('v1.34.90 desktop WP and Trace search acts on retained evidence only',async ({page})=>{
  await openCockpit(page)
  const modal=await openActionableLiveJob(page)
  const panel=modal.locator('.rundeckWpSignalPanel')
  await expect(panel).toBeVisible({timeout:30000})
  if(await panel.locator('.rundeckWpSignalFilters').count()){
    const search=panel.getByRole('searchbox')
    await expect(search).toBeVisible()
    await search.fill('no-matching-pid-zz')
    await expect(panel.getByText('No saved WP / Trace row matches these filters.')).toBeVisible()
    await search.fill('')
    await expect(panel.getByRole('checkbox',{name:'Errors only'})).toBeVisible()
    await expect(panel.getByRole('button',{name:'All rows'})).toBeVisible()
  } else {
    await expect(panel).toHaveClass(/is-empty/)
    await expect(panel).toContainText('WP/Trace signal was not retained')
  }
})

test('v1.34.91 desktop review measures actual visual hierarchy, not just DOM existence',async ({page})=>{
  await openCockpit(page)
  const title=page.locator('.rundeckLandscapeHeader h2')
  await expect(title).toHaveText('SAP Performance Dashboard')
  const trendTitle=page.locator('.rundeckTrendEditorial h3')
  await expect(trendTitle).toHaveText('Performance Trends')
  const cards=page.locator('.rundeckUnifiedAppCards .rundeckUnifiedAppCard')
  await expect(cards).toHaveCount(5)
  const chart=page.locator('.rundeckTripleTrendGrid .rundeckTrendChart').first()
  await expect(chart).toBeVisible({timeout:30000})
  const metric=cards.first().locator('.rundeckUnifiedMetric strong').first()
  const geometry=await page.evaluate(()=>{
    const rect=(selector)=>{const e=document.querySelector(selector); if(!e)return null; const r=e.getBoundingClientRect();return {height:r.height,width:r.width,fontSize:parseFloat(getComputedStyle(e).fontSize)}}
    return {title:rect('.rundeckLandscapeHeader h2'),
      app:rect('.rundeckUnifiedAppCard'),metric:rect('.rundeckUnifiedMetric strong'),
      trend:rect('.rundeckTrendChart'),operational:rect('.rundeckAnalysisLaunchers'),
      horizontalOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}
  })
  expect(geometry.title?.fontSize).toBeGreaterThanOrEqual(20)
  expect(geometry.app?.height).toBeGreaterThanOrEqual(110)
  expect(geometry.metric?.fontSize).toBeGreaterThanOrEqual(14)
  expect(geometry.trend?.height).toBeGreaterThanOrEqual(187)
  expect(geometry.operational?.height).toBeGreaterThanOrEqual(44)
  expect(geometry.horizontalOverflow).toBeLessThanOrEqual(2)
  await page.screenshot({path:'test-results/sphere-v13491-overview-'+(page.viewportSize()?.width||'desktop')+'.png',fullPage:false})
})
test('v1.34.91 desktop Live search filters only loaded real observations',async ({page})=>{
  await openCockpit(page)
  await expect(page.locator('.rundeckJobsProgramsWorkspace .rundeckCurrentWorkloadTableWrap')).toBeVisible({timeout:30000})
  const section=page.getByRole('region',{name:'Current SAP jobs and programs'})
  const search=section.getByRole('searchbox',{name:'Search loaded jobs and programs'})
  await expect(search).toBeVisible()
  await expect(section.getByRole('columnheader',{name:'Observed At'})).toBeVisible()
  await search.fill('nonexistent-unique-job-zyx4321')
  await expect(section.getByText(/No matching job or program in the .*loaded rows/)).toBeVisible()
  await search.clear()
  await expect(section.locator('tbody tr').first()).toBeVisible()
})

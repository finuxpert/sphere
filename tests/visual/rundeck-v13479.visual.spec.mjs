import { test, expect } from '@playwright/test'

const TARGET = process.env.SPHERE_VISUAL_BASE_URL || 'https://sphere.astraotoparts.co.id/dev/#/tool/logs'

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
  const focus = plots.first().getByRole('group', { name: 'Highlight APP trace' })
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
  const modal = page.getByRole('dialog', { name: /APP5.*APP Analysis/ })
  await expect(modal).toBeVisible({ timeout: 30_000 })
  await expect(modal.getByRole('region', { name: 'SAP performance evidence' })).toBeVisible()
  await expect(modal.getByRole('region', { name: 'Infrastructure evidence' })).toBeVisible()
  await expect(modal.getByRole('group', { name: 'Select Infrastructure APP' })).toHaveCount(0)
  await expect(modal.getByRole('button', { name: 'Close analysis' })).toBeVisible()
  await modal.getByRole('button', { name: 'Close analysis' }).click()
  await expect(modal).toHaveCount(0)
})

test('v1.34.82 analysis shortcuts never paint outside their six independent cells', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'desktop-1536') test.skip()
  await openCockpit(page)
  const rail = page.locator('.rundeckAnalysisRailV13456')
  const cards = rail.locator('.rundeckEvidenceCard, .rundeckSelectedSecondaryAnalysis > button')
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
  await test.info().attach('six-analysis-tiles',{body:await page.screenshot({animations:'disabled'}),contentType:'image/png'})
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

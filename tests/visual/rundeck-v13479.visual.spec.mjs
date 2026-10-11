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

import { test, expect } from '@playwright/test'

const TARGET = process.env.SPHERE_VISUAL_BASE_URL || 'https://sphere.astraotoparts.co.id/dev/#/tool/logs'

async function openCockpit(page) {
  await page.goto(TARGET, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.rundeckPanel')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.rundeckCockpitV13456')).toBeVisible({ timeout: 30_000 })
}

async function viewportEvidence(page) {
  return page.evaluate(() => {
    const pageRoot = document.documentElement
    const rect = node => {
      if (!node) return null
      const box = node.getBoundingClientRect()
      return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,height:box.height}
    }
    const jobs = document.querySelector('.rundeckJobsProgramsWorkspace')
    const pager = document.querySelector('.rundeckWorkloadPager')
    const table = document.querySelector('.rundeckCurrentWorkloadTableWrap')
    const metric = document.querySelector('.rundeckUnifiedMetric strong')
    const appTitle = document.querySelector('.rundeckLandscapeHeader h2')
    return {
      pageOverflowX: pageRoot.scrollWidth - pageRoot.clientWidth,
      pageOverflowY: pageRoot.scrollHeight - pageRoot.clientHeight,
      jobs: rect(jobs), pager: rect(pager), table: rect(table),
      metricFont: metric ? Number.parseFloat(getComputedStyle(metric).fontSize) : null,
      titleFont: appTitle ? Number.parseFloat(getComputedStyle(appTitle).fontSize) : null,
      viewport: {width: innerWidth,height: innerHeight},
    }
  })
}

test('v1.35.6 desktop overview fits viewport with readable metrics and visible workload controls', async ({page}) => {
  await openCockpit(page)
  const cards = page.locator('.rundeckUnifiedAppCards .rundeckUnifiedAppCard')
  await expect(cards).toHaveCount(5)
  await expect(page.locator('.rundeckTripleTrendGrid .rundeckTrendChart').first()).toBeVisible()
  await expect(page.locator('.rundeckJobsProgramsWorkspace')).toBeVisible()
  await expect(page.locator('.rundeckAnalysisRailV13456 .rundeckAnalysisActions > button')).toHaveCount(6)
  const result = await viewportEvidence(page)
  console.log('SPHERE_V1356_DESKTOP_GEOMETRY=' + JSON.stringify(result))
  expect(result.pageOverflowX).toBeLessThanOrEqual(2)
  expect(result.pageOverflowY).toBeLessThanOrEqual(2)
  expect(result.jobs?.bottom).toBeLessThanOrEqual(result.viewport.height + 2)
  expect(result.titleFont).toBeGreaterThanOrEqual(18)
  expect(result.metricFont).toBeGreaterThanOrEqual(12)
  expect(result.table).not.toBeNull()
  // A pager may legitimately be absent for zero observations. Check that any
  // displayed pager remains inside the viewport rather than clipping below it.
  if (result.pager && result.pager.height > 0) {
    expect(result.pager.bottom).toBeLessThanOrEqual(result.viewport.height + 2)
  }
  await test.info().attach('sphere-v1356-overview', {
    body: await page.screenshot({ animations: 'disabled', fullPage: false }),
    contentType: 'image/png',
  })
})

test('v1.35.6 desktop theme choices and SAP Issues dialog remain readable', async ({page}) => {
  await openCockpit(page)
  const selector = page.getByRole('combobox',{name:'Display theme'})
  await expect(selector).toBeVisible()
  for (const theme of ['dark','light','system']) {
    await selector.selectOption(theme)
    await page.locator('.rundeckAnalysisRailV13456').getByRole('button',{name:/SAP Issues/}).click()
    const dialog = page.getByRole('dialog',{name:'SAP Issues'})
    await expect(dialog).toBeVisible()
    const geometry = await dialog.evaluate(el => {
      const r = el.getBoundingClientRect()
      const body = el.querySelector('.rundeckWorkspaceDrawerBody')
      return {
        x:r.left, right:r.right, y:r.top, bottom:r.bottom,
        width:innerWidth, height:innerHeight,
        overflowX:body ? body.scrollWidth-body.clientWidth : 0,
        color:getComputedStyle(el).color,
        background:getComputedStyle(el).backgroundColor,
      }
    })
    console.log('SPHERE_V1356_THEME_DIALOG=' + JSON.stringify({theme,...geometry}))
    expect(geometry.x).toBeGreaterThanOrEqual(-1)
    expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1)
    expect(geometry.y).toBeGreaterThanOrEqual(-1)
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1)
    expect(geometry.overflowX).toBeLessThanOrEqual(2)
    expect(geometry.color).not.toBe('rgba(0, 0, 0, 0)')
    await test.info().attach('sphere-v1356-' + theme + '-issues', {
      body: await page.screenshot({ animations: 'disabled', fullPage: false }),
      contentType: 'image/png',
    })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  }
})

test('v1.35.6 Android overview and SAP Issues modal have no horizontal overflow', async ({page}) => {
  await openCockpit(page)
  const result = await viewportEvidence(page)
  console.log('SPHERE_V1356_ANDROID_GEOMETRY=' + JSON.stringify(result))
  expect(result.pageOverflowX).toBeLessThanOrEqual(2)
  await expect(page.locator('.rundeckAnalysisRailV13456 .rundeckAnalysisActions > button')).toHaveCount(6)
  await page.locator('.rundeckAnalysisRailV13456').getByRole('button',{name:/SAP Issues/}).click()
  const dialog = page.getByRole('dialog',{name:'SAP Issues'})
  await expect(dialog).toBeVisible()
  const bounds = await dialog.evaluate(el => {
    const box = el.getBoundingClientRect()
    return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,w:innerWidth,h:innerHeight}
  })
  expect(bounds.left).toBeGreaterThanOrEqual(-1)
  expect(bounds.right).toBeLessThanOrEqual(bounds.w + 1)
  expect(bounds.top).toBeGreaterThanOrEqual(-1)
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.h + 1)
  const overflow = await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(2)
  await test.info().attach('sphere-v1356-android', {
    body: await page.screenshot({ animations: 'disabled', fullPage: false }),
    contentType:'image/png',
  })
})

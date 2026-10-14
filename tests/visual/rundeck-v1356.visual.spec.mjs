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
    const metric = document.querySelector('.rundeckSelectedAppMetric strong')
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
  const cards = page.locator('.rundeckAppHexSelectors .rundeckAppHexSelector')
  await expect(cards).toHaveCount(5)
  await expect(page.locator('.rundeckTripleTrendGrid .rundeckTrendChart').first()).toBeVisible()
  await expect(page.locator('.rundeckJobsProgramsWorkspace')).toBeVisible()
  await expect(page.locator('.rundeckAnalysisRailV13456 .rundeckAnalysisActions > button')).toHaveCount(4)
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
  await expect(page.locator('.rundeckAnalysisRailV13456 .rundeckAnalysisActions > button')).toHaveCount(4)
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

test('v1.35.6 APP analysis keeps pager controls visible, verified collection labels and legible rows', async ({page}) => {
  await openCockpit(page)
  test.skip((page.viewportSize()?.width || 0) < 1100, 'Desktop APP analysis geometry')
  await page.locator('.rundeckAppHexSelectors .rundeckAppHexSelector').first().click()
  await expect(page.locator('.rundeckSelectedAppDetail')).toBeVisible()
  // Regression: one hexagon click opens the existing per-APP process and Infrastructure modal.
  const dialog = page.getByRole('dialog',{name:/APP\d+ Analysis/})
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('region',{name:'SAP performance evidence'})).toBeVisible()
  await expect(dialog.getByRole('region',{name:'Infrastructure evidence'})).toBeVisible()
  await expect(dialog.locator('.rundeckUnifiedAnalysisProvenance')).toBeVisible()
  const pager = dialog.locator('.rundeckInfraGrid article:first-child .rundeckInfraFsPager')
  await expect(pager).toBeVisible({timeout:20_000})
  const evidence = await dialog.evaluate(el => {
    const pane = el.querySelector('.rundeckInfraGrid article:first-child')
    const pager = pane?.querySelector('.rundeckInfraFsPager')
    const buttons = [...(pager?.querySelectorAll('button')||[])].map(node => {
      const rect=node.getBoundingClientRect()
      return {top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right}
    })
    const firstDataCell = el.querySelector('.rundeckAppServerTableWrap tbody td')
    const box=el.getBoundingClientRect()
    return {
      left:box.left,right:box.right,top:box.top,bottom:box.bottom,
      viewportWidth:innerWidth,viewportHeight:innerHeight,
      buttons,pagerWidth:pager?.getBoundingClientRect().width ?? null,
      fsOverflow:pane ? getComputedStyle(pane).overflowY : '',
      workloadFont:firstDataCell ? parseFloat(getComputedStyle(firstDataCell).fontSize) : null,
    }
  })
  console.log('SPHERE_V1356_APP_DETAIL=' + JSON.stringify(evidence))
  expect(evidence.left).toBeGreaterThanOrEqual(-1)
  expect(evidence.right).toBeLessThanOrEqual(evidence.viewportWidth + 1)
  expect(evidence.top).toBeGreaterThanOrEqual(-1)
  expect(evidence.bottom).toBeLessThanOrEqual(evidence.viewportHeight + 1)
  expect(evidence.buttons).toHaveLength(2)
  expect(Math.abs(evidence.buttons[0].top-evidence.buttons[1].top)).toBeLessThanOrEqual(2)
  expect(evidence.buttons[0].right).toBeLessThan(evidence.buttons[1].left+1)
  expect(evidence.fsOverflow).not.toBe('scroll')
  expect(evidence.fsOverflow).not.toBe('auto')
  if(evidence.workloadFont !== null) expect(evidence.workloadFont).toBeGreaterThanOrEqual(10)
  await test.info().attach('sphere-v1356-app-analysis',{
    body:await page.screenshot({animations:'disabled',fullPage:false}),
    contentType:'image/png',
  })
})

test('DEV Workload Health and table are genuinely side-by-side without clipping pager', async ({page}) => {
  await openCockpit(page)
  const health = page.getByRole('button',{name:/Open Jobs & Programs Review/})
  await expect(health).toBeVisible()
  const bounds = await page.evaluate(() => {
    const rect = selector => {
      const node = document.querySelector(selector)
      if (!node) return null
      const box = node.getBoundingClientRect()
      return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height}
    }
    return {
      header:rect('.rundeckJobsProgramsWorkspaceHead'),
      split:rect('.rundeckJobsProgramsSplit'),
      table:rect('.rundeckJobsProgramsWorkspaceBody'),
      side:rect('.rundeckJobsProgramsHealthSide'),
      card:rect('.rundeckWorkloadHealth'),
      pager:rect('.rundeckWorkloadPager'),
      overflowX:document.documentElement.scrollWidth - document.documentElement.clientWidth,
      overflowY:document.documentElement.scrollHeight - document.documentElement.clientHeight,
      viewport:{width:innerWidth,height:innerHeight},
    }
  })
  console.log('SPHERE_WORKLOAD_HEALTH_TWO_COLUMN_GEOMETRY=' + JSON.stringify(bounds))
  expect(bounds.header).not.toBeNull()
  expect(bounds.table).not.toBeNull()
  expect(bounds.side).not.toBeNull()
  expect(bounds.card).not.toBeNull()
  expect(bounds.overflowX).toBeLessThanOrEqual(2)
  if (bounds.viewport.width >= 1200) {
    expect(bounds.table.right).toBeLessThanOrEqual(bounds.side.left + 2)
    expect(bounds.table.width / bounds.side.width).toBeGreaterThan(0.9)
    expect(bounds.table.width / bounds.side.width).toBeLessThan(1.1)
    expect(Math.abs(bounds.table.top - bounds.card.top)).toBeLessThanOrEqual(5)
    expect(bounds.card.bottom).toBeLessThanOrEqual(bounds.viewport.height + 2)
    expect(bounds.overflowY).toBeLessThanOrEqual(2)
    if (bounds.pager) expect(bounds.pager.bottom).toBeLessThanOrEqual(bounds.viewport.height + 2)
    const dots = page.locator('.rundeckWorkloadDotGrid .rundeckWorkloadDot')
    await expect(dots.first()).toBeVisible({timeout:30000})
    const displayed = await dots.count()
    expect(displayed).toBeGreaterThan(30)
    expect(displayed).toBeLessThanOrEqual(400)
    const red = page.locator('.rundeckWorkloadDot.is-review').first()
    if (await red.count()) {
      const rowLabel = await red.getAttribute('aria-label')
      expect(rowLabel).toMatch(/^(Job|Program) .+Review Required/)
      await red.click()
      const detail = page.getByRole('dialog')
      await expect(detail).toBeVisible({timeout:20000})
      await expect(detail.getByRole('button',{name:'Review Result'})).toBeVisible()
      await page.keyboard.press('Escape')
    }
  } else {
    expect(bounds.card.right).toBeLessThanOrEqual(bounds.viewport.width + 2)
  }
  await health.click()
  await expect(page.getByRole('tab',{name:'Review'})).toHaveAttribute('aria-selected','true')
  const category = page.getByRole('combobox',{name:'Evaluation category'})
  await expect(category).toHaveValue('REVIEW')
  await category.selectOption('ATTENTION')
  await expect(category).toHaveValue('ATTENTION')
  await health.click()
  await expect(category).toHaveValue('REVIEW')
})

test('DEV historical Search locates workload ranked outside the first 100 via backend query', async ({page}) => {
  test.skip((page.viewportSize()?.width || 0) < 1200, 'Desktop server-side search contract')
  const requested = []
  await page.route('**/api/evaluation/workloads?**', async route => {
    const url = new URL(route.request().url())
    const query = url.searchParams.get('q') || ''
    requested.push({ query, offset: url.searchParams.get('offset'), health:url.searchParams.get('health') })
    const matched = query.toUpperCase().includes('Z_PROGRAM_350')
    const body = {
      period:'1d', days:1, type:'ALL', end:'2026-10-13T03:00:00Z',
      quality:{confidence:'HIGH',partial_or_incomplete_checks:0},
      summary:{workloads:388,review_required:13,health:{review:13,attention:61,normal:290,unknown:24}},
      page:{scope:'FULL_EVALUATED_POPULATION',offset:0,limit:2,total:matched?1:388,
        returned:matched?1:2,has_more:!matched,query,health:url.searchParams.get('health')||'ALL'},
      items:matched?[{consumer_type:'PROGRAM',consumer_key:'Z_PROGRAM_350',
        status:'NORMAL',avg_cpu_pct:12,peak_cpu_pct:18,avg_pss_gb:0.8,
        assessment_reason:'Within resource thresholds'}]:[
        {consumer_type:'PROGRAM',consumer_key:'Z_PROGRAM_000',status:'REVIEW REQUIRED',
          avg_cpu_pct:90,peak_cpu_pct:110,avg_pss_gb:5},
        {consumer_type:'PROGRAM',consumer_key:'Z_PROGRAM_001',status:'REVIEW REQUIRED',
          avg_cpu_pct:85,peak_cpu_pct:104,avg_pss_gb:4.4}
      ],
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
  })
  await openCockpit(page)
  await page.getByRole('tab',{name:'Search'}).click()
  const search = page.getByRole('searchbox',{name:'Search historical job or program'})
  await search.fill('Z_PROGRAM_350')
  await expect(page.locator('.rundeckReviewWorkloadV1231 button',{hasText:'Z_PROGRAM_350'})).toBeVisible({timeout:15000})
  expect(requested.some(item=>item.query==='Z_PROGRAM_350' && item.health==='ALL')).toBe(true)
  await expect(page.locator('.rundeckReviewPager')).toContainText('1 matches')
})

test('v1.35.15 APP shortcut keeps verified Infrastructure host identity', async ({page}) => {
  await openCockpit(page)
  test.skip((page.viewportSize()?.width || 0) < 1100, 'Desktop APP navigation regression')
  const selectors=page.locator('.rundeckAppHexSelectors .rundeckAppHexSelector')
  await expect(selectors).toHaveCount(5)
  await selectors.nth(1).click()
  const appDialog=page.getByRole('dialog',{name:/APP2 Analysis/})
  await expect(appDialog).toBeVisible()
  await appDialog.getByRole('button',{name:'Close analysis'}).click()
  await expect(appDialog).toHaveCount(0)
  await page.locator('.rundeckAnalysisRailV13456').getByRole('button',{name:'Open Infrastructure Analysis'}).click()
  const infraDialog=page.getByRole('dialog',{name:'Infrastructure Analysis'})
  await expect(infraDialog).toBeVisible()
  const focus=infraDialog.locator('.rundeckInfraIdentity, .rundeckInfraError')
  await expect.poll(async () => (await focus.allTextContents()).join(' '), {timeout:30000}).toMatch(/APP2/)
  const geometry=await infraDialog.evaluate(el=>{
    const box=el.getBoundingClientRect()
    return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:innerWidth,height:innerHeight}
  })
  expect(geometry.left).toBeGreaterThanOrEqual(-1)
  expect(geometry.right).toBeLessThanOrEqual(geometry.width+1)
  expect(geometry.top).toBeGreaterThanOrEqual(-1)
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.height+1)
})

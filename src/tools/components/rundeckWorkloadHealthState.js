/** Classify one backend status for detail views; never apply host CPU thresholds to grouped workload CPU. */
export function workloadHealthLevel(row = {}) {
  const status = String(row?.status || '').toUpperCase()
  if (status === 'REVIEW REQUIRED') return 'review'
  if (['HIGH CPU', 'HIGH MEMORY', 'CPU SPIKE', 'INCREASING CPU', 'RECURRING'].includes(status)) return 'attention'
  if (status === 'NORMAL') return 'normal'
  return 'unknown'
}

/** Proportional 30-slot population view using largest-remainder allocation. */
export function allocateWorkloadHexagons(health, total, slots = 30) {
  if (!health || !Number.isSafeInteger(total) || total < 0) return null
  const keys = ['review', 'attention', 'unknown', 'normal']
  const counts = keys.map(key => Number(health[key]))
  if (!counts.every(value => Number.isSafeInteger(value) && value >= 0) ||
      counts.reduce((sum, n) => sum + n, 0) !== total) return null
  if (total === 0) return []
  const count = Math.max(1, Math.min(30, Math.floor(Number(slots) || 30)))
  const exact = counts.map(n => n / total * count)
  const assigned = exact.map(Math.floor)
  const remaining = count - assigned.reduce((sum,n) => sum + n, 0)
  const order = exact.map((n,i) => ({i, fraction:n-assigned[i]}))
    .sort((a,b) => b.fraction - a.fraction || a.i-b.i)
  for (let i=0; i < remaining; i++) assigned[order[i].i]++
  return keys.flatMap((key,i) => Array.from({length:assigned[i]}, () => key))
}

/** Full-report counts, not the first 30 rank-sorted rows. Fail closed for older API or inconsistent totals. */
export function workloadHealthPreview(report, maxDots = 30) {
  if (!report || !report.summary || !Array.isArray(report.items)) return null
  const positive = value => value !== null && value !== undefined && value !== '' &&
    Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null
  const total = positive(report.summary.workloads)
  const reviewRequired = positive(report.summary.review_required)
  if (total === null || reviewRequired === null || reviewRequired > total) return null
  const health = report.summary.health
  const hexagons = allocateWorkloadHexagons(health, total, maxDots)
  if (hexagons === null || Number(health.review) !== reviewRequired) return null
  const quality = report.quality || {}
  return {
    total, reviewRequired, health,
    hexagons,
    limited: String(quality.confidence || '').toUpperCase() === 'LOW' ||
      Number(quality.partial_or_incomplete_checks || 0) > 0,
    end: report.end || '',
  }
}

/** Validate exact backend-page identity before turning a dot into a clickable job/program. */
export function validatedWorkloadDots(first, following = [], pageIndex = 0, pageSize = 400) {
  const preview = workloadHealthPreview(first)
  const startOffset = pageIndex * pageSize
  if (!preview || !Number.isSafeInteger(pageIndex) || pageIndex < 0 ||
      !Number.isSafeInteger(pageSize) || pageSize < 1 ||
      (preview.total > 0 && startOffset >= preview.total)) return null
  const expected = Math.min(pageSize, Math.max(0, preview.total - startOffset))
  const pages = [first, ...following]
  const rows = []
  const identities = new Set()
  for (let index = 0; index < pages.length; index++) {
    const report = pages[index]
    const offset = startOffset + index * 100
    const count = Math.min(100, Math.max(0, expected - index * 100))
    if (count === 0 || !report || !Array.isArray(report.items) ||
        report.page?.scope !== 'FULL_EVALUATED_POPULATION' ||
        report.page?.health !== 'ALL' || report.page?.offset !== offset ||
        report.page?.total !== preview.total ||
        Number(report.summary?.workloads) !== preview.total ||
        report.start !== first.start || report.end !== first.end ||
        report.items.length !== count || report.page?.returned !== count) return null
    for (const row of report.items) {
      const type = String(row?.consumer_type || '').trim()
      const key = String(row?.consumer_key || '').trim()
      if (!type || !key) return null
      const id = type + ':' + key
      if (identities.has(id)) return null
      identities.add(id)
      rows.push(row)
    }
  }
  if (rows.length !== expected) return null
  // When the complete population fits on one page, status-level counts must agree.
  if (startOffset === 0 && expected === preview.total) {
    const counts = { review: 0, attention: 0, normal: 0, unknown: 0 }
    for (const row of rows) counts[workloadHealthLevel(row)]++
    if (Object.keys(counts).some(key => counts[key] !== Number(preview.health[key]))) return null
  }
  return { preview, rows, pageIndex, pageSize, start: first.start || '', end: first.end || '' }
}

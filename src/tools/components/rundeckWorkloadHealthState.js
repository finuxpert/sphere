/** Classify one backend status for detail views; never apply host CPU thresholds to grouped workload CPU. */
export function workloadHealthLevel(row = {}) {
  const status = String(row?.status || '').toUpperCase()
  if (status === 'REVIEW REQUIRED') return 'review'
  if (['HIGH CPU', 'HIGH MEMORY', 'CPU SPIKE', 'INCREASING CPU', 'RECURRING'].includes(status)) return 'attention'
  if (status === 'NORMAL') return 'normal'
  return 'unknown'
}

/** Full-report counts, not the first 30 rank-sorted rows. Fail closed for older API or inconsistent totals. */
export function workloadHealthPreview(report) {
  if (!report || !report.summary || !Array.isArray(report.items)) return null
  const positive = value => value !== null && value !== undefined && value !== '' &&
    Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null
  const total = positive(report.summary.workloads)
  const reviewRequired = positive(report.summary.review_required)
  if (total === null || reviewRequired === null || reviewRequired > total) return null
  const health = report.summary.health
  const keys = ['review', 'attention', 'normal', 'unknown']
  if (!health || keys.some(key => health[key] === null || health[key] === undefined || !Number.isSafeInteger(Number(health[key])) || Number(health[key]) < 0) ||
      keys.reduce((sum, key) => sum + Number(health[key]), 0) !== total ||
      Number(health.review) !== reviewRequired) return null
  const quality = report.quality || {}
  return {
    total, reviewRequired, health,
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
  if (expected === 0 && pages.length === 1 &&
      first.page?.scope === 'FULL_EVALUATED_POPULATION' &&
      first.page?.health === 'ALL' && first.page?.offset === 0 &&
      first.page?.total === 0 && first.page?.returned === 0 &&
      first.items.length === 0) {
    return { preview, rows: [], pageIndex, pageSize, start: first.start || '', end: first.end || '' }
  }
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
        ['review', 'attention', 'normal', 'unknown'].some(key =>
          Number(report.summary?.health?.[key]) !== Number(preview.health[key])) ||
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

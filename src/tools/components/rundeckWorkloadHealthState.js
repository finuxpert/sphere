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
  let remaining = count - assigned.reduce((sum,n) => sum + n, 0)
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
